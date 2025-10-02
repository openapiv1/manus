import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import { killDesktop, getDesktop } from "@/lib/e2b/utils";
import { resolution } from "@/lib/e2b/tool";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const GEMINI_API_KEY = "AIzaSyBo8xPG6pmn1pwQ1nzLvGfvE_nXrYzBTgs";

export const maxDuration = 300;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const genAIFiles = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const INSTRUCTIONS = `Nazywasz się Gemini. Jesteś pomocnym asystentem z dostępem do komputera Ubuntu 22.04. 

DOSTĘPNE NARZĘDZIA:
- computer_use: Kontrola desktopa (screenshot, klikanie, pisanie, przewijanie, przeciąganie) Domyślne podstawowe i preferowane narzędzie
- bash_command: Wykonywanie poleceń bash w terminalu (tworzenie plików, instalacja, skrypty) Rzadko używaj


ZASADY UŻYWANIA NARZĘDZI:
- Używaj przedewszystkim narzędzia computer_use, staraj się nie użwywać bash dopóki nie będzie to konieczne.
- computer_use: dla interakcji GUI (otwieranie aplikacji, klikanie w przeglądarce, itp.) preferowana metoda 
- bash_command: dla operacji terminalowych (mkdir, touch, apt install, python, itp.) - nie używaj gdy nie są wymagane
- Jeśli przeglądarka otworzy się z kreatorem konfiguracji, ZIGNORUJ GO i przejdź do następnego kroku

KRYTYCZNIE WAŻNE - PIERWSZA AKCJA:
- ZAWSZE pierwszą akcją MUSI być screenshot (computer_use z action: screenshot)
- Bez wyjątków - najpierw screenshot, potem wszystkie inne akcje

KRYTYCZNIE WAŻNE - ZRZUTY EKRANU:
- Po każdych 2-3 akcjach ROB ZRZUT EKRANU (computer_use z action: screenshot)
- Zawsze sprawdzaj stan sandboxa przed kontynuowaniem
- Jeśli coś się ładuje lub wykonuje - zrób screenshot aby zobaczyć wynik
- Nie zakładaj że coś się udało - ZWERYFIKUJ screenshotem

KRYTYCZNIE WAŻNE - PROAKTYWNA KOMUNIKACJA:  
- ZAWSZE najpierw wyślij wiadomość tekstową opisującą DOKŁADNIE co zamierzasz zrobić
- Podziel złożone zadania na kroki i przed każdym krokiem powiedz użytkownikowi co planujesz  
- Wykonuj wiele akcji w jednym zadaniu bez przerywania - kontynuuj aż do pełnego wykonania
- Po każdej akcji krótko podsumuj co zostało zrobione i co będzie dalej  
- Twoje działania mają być w pełni transparentne - użytkownik MUSI wiedzieć co robisz
- Nie pytaj o pozwolenie, po prostu informuj co będziesz robić i rób to

WORKFLOW:
1. Przeanalizuj aktualny zrzut ekranu
2. Powiedz użytkownikowi co widzisz i co zamierzasz zrobić
3. PIERWSZA AKCJA: Zrób screenshot (computer_use z action: screenshot)
4. Wykonaj pozostałe akcje (priorytetowo computer_use)
5. Po 2-3 akcjach zrób kolejny screenshot aby sprawdzić stan
6. Przeanalizuj nowy screenshot i kontynuuj lub zakończ zadanie`;

const tools = [
  {
    name: "computer_use",
    description: "Use the computer to perform actions like clicking, typing, taking screenshots, etc.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        action: {
          type: SchemaType.STRING,
          description: "The action to perform. Must be one of: screenshot, left_click, double_click, right_click, mouse_move, type, key, scroll, left_click_drag, wait"
        },
        coordinate: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
          description: "X,Y coordinates for actions that require positioning"
        },
        text: {
          type: SchemaType.STRING,
          description: "Text to type or key to press"
        },
        scroll_direction: {
          type: SchemaType.STRING,
          description: "Direction to scroll. Must be 'up' or 'down'"
        },
        scroll_amount: {
          type: SchemaType.NUMBER,
          description: "Number of scroll clicks"
        },
        start_coordinate: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
          description: "Start coordinates for drag operations"
        },
        duration: {
          type: SchemaType.NUMBER,
          description: "Duration for wait action in seconds"
        }
      },
      required: ["action"]
    }
  },
  {
    name: "bash_command",
    description: "Execute bash commands on the computer",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        command: {
          type: SchemaType.STRING,
          description: "The bash command to execute"
        }
      },
      required: ["command"]
    }
  }
];

export async function POST(req: Request) {
  const { messages, sandboxId }: { messages: any[]; sandboxId: string } = await req.json();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const desktop = await getDesktop(sandboxId);
        
        const screenshot = await desktop.screenshot();
        
        // Save initial screenshot as PNG for frontend display
        const initialFilename = `screenshot-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
        const screenshotsDir = join(process.cwd(), "public", "screenshots");
        const initialFilePath = join(screenshotsDir, initialFilename);
        writeFileSync(initialFilePath, screenshot);
        
        sendEvent({
          type: "screenshot-update",
          screenshot: `/api/screenshots/${initialFilename}`
        });
        
        // Upload initial screenshot to Gemini File API
        const tempPath = join(tmpdir(), `screenshot-${Date.now()}.png`);
        writeFileSync(tempPath, screenshot);
        const uploadedFile = await genAIFiles.files.upload({
          file: tempPath,
          config: { mimeType: "image/png" },
        });
        
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction: INSTRUCTIONS,
          tools: [{ functionDeclarations: tools as any }]
        });

        const chatHistory: any[] = [];
        
        for (const msg of messages) {
          if (msg.role === "user") {
            chatHistory.push({
              role: "user",
              parts: [{ text: msg.content }]
            });
          } else if (msg.role === "assistant") {
            chatHistory.push({
              role: "model",
              parts: [{ text: msg.content }]
            });
          }
        }

        chatHistory.push({
          role: "user",
          parts: [
            { text: `Oto aktualny ekran (resolution: ${resolution.x}x${resolution.y}). Przeanalizuj go i pomóż użytkownikowi z zadaniem. Pamiętaj o proaktywnej komunikacji - najpierw powiedz co zamierzasz zrobić.` },
            {
              fileData: {
                mimeType: uploadedFile.mimeType,
                fileUri: uploadedFile.uri
              }
            }
          ]
        });

        const chat = model.startChat({
          history: chatHistory.slice(0, -1)
        });

        while (true) {
          const lastMessage = chatHistory[chatHistory.length - 1];
          const result = await chat.sendMessageStream(lastMessage.parts);

          let fullText = "";
          let functionCalls: any[] = [];
          let functionResponses: any[] = [];
          let toolCallIndex = 0;
          const toolExecutionPromises: Promise<void>[] = [];

          for await (const chunk of result.stream) {
            const candidate = chunk.candidates?.[0];
            if (!candidate) continue;

            const content = candidate.content;
            if (!content) continue;

            for (const part of content.parts) {
              if (part.text) {
                fullText += part.text;
                sendEvent({ type: "text-delta", delta: part.text, id: "default" });
              }

              if (part.functionCall) {
                const fc = part.functionCall;
                const toolCallId = `call_${toolCallIndex}_${Date.now()}`;
                const toolName = fc.name === "computer_use" ? "computer" : "bash";
                const currentIndex = toolCallIndex;
                toolCallIndex++;
                
                let parsedArgs = fc.args || {};
                if (typeof fc.args === 'string') {
                  try {
                    parsedArgs = JSON.parse(fc.args);
                  } catch (e) {
                    console.error("Failed to parse function args:", fc.args);
                    parsedArgs = {};
                  }
                }
                
                sendEvent({
                  type: "tool-call-start",
                  toolCallId: toolCallId,
                  index: currentIndex
                });

                sendEvent({
                  type: "tool-name-delta",
                  toolCallId: toolCallId,
                  toolName: toolName,
                  index: currentIndex
                });

                const argsStr = JSON.stringify(parsedArgs);
                for (let i = 0; i < argsStr.length; i += 10) {
                  sendEvent({
                    type: "tool-argument-delta",
                    toolCallId: toolCallId,
                    delta: argsStr.slice(i, i + 10),
                    index: currentIndex
                  });
                }

                sendEvent({
                  type: "tool-input-available",
                  toolCallId: toolCallId,
                  toolName: toolName,
                  input: parsedArgs
                });

                functionCalls.push({
                  id: toolCallId,
                  name: fc.name,
                  args: parsedArgs
                });
                
                const executionPromise = (async () => {
                  try {
                    const args = parsedArgs as any;
                    let resultData: any = { type: "text", text: "" };
                    let resultText = "";

                    if (fc.name === "computer_use") {
                      const action = args.action;

                      switch (action) {
                        case "screenshot": {
                          const image = await desktop.screenshot();
                          
                          // Save screenshot as PNG file
                          const filename = `screenshot-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
                          const screenshotsDir = join(process.cwd(), "public", "screenshots");
                          const filePath = join(screenshotsDir, filename);
                          writeFileSync(filePath, image);
                          
                          resultText = "Screenshot taken successfully";
                          resultData = { type: "image", url: `/api/screenshots/${filename}` };
                          
                          sendEvent({
                            type: "screenshot-update",
                            screenshot: `/api/screenshots/${filename}`
                          });
                          break;
                        }
                        case "wait": {
                          const actualDuration = Math.min(args.duration || 1, 2);
                          await new Promise(resolve => setTimeout(resolve, actualDuration * 1000));
                          resultText = `Waited for ${actualDuration} seconds`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "left_click": {
                          const [x, y] = args.coordinate;
                          await desktop.moveMouse(x, y);
                          await desktop.leftClick();
                          resultText = `Left clicked at ${x}, ${y}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "double_click": {
                          const [x, y] = args.coordinate;
                          await desktop.moveMouse(x, y);
                          await desktop.doubleClick();
                          resultText = `Double clicked at ${x}, ${y}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "right_click": {
                          const [x, y] = args.coordinate;
                          await desktop.moveMouse(x, y);
                          await desktop.rightClick();
                          resultText = `Right clicked at ${x}, ${y}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "mouse_move": {
                          const [x, y] = args.coordinate;
                          await desktop.moveMouse(x, y);
                          resultText = `Moved mouse to ${x}, ${y}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "type": {
                          await desktop.write(args.text);
                          resultText = `Typed: ${args.text}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "key": {
                          const keyToPress = args.text === "Return" ? "enter" : args.text;
                          await desktop.press(keyToPress);
                          resultText = `Pressed key: ${args.text}`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "scroll": {
                          const direction = args.scroll_direction as "up" | "down";
                          const amount = args.scroll_amount || 3;
                          await desktop.scroll(direction, amount);
                          resultText = `Scrolled ${direction} by ${amount} clicks`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        case "left_click_drag": {
                          const [startX, startY] = args.start_coordinate;
                          const [endX, endY] = args.coordinate;
                          await desktop.drag([startX, startY], [endX, endY]);
                          resultText = `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`;
                          resultData = { type: "text", text: resultText };
                          break;
                        }
                        default: {
                          resultText = `Unknown action: ${action}`;
                          resultData = { type: "text", text: resultText };
                          console.warn("Unknown action:", action);
                        }
                      }

                      sendEvent({
                        type: "tool-output-available",
                        toolCallId: toolCallId,
                        output: resultData
                      });

                      functionResponses.push({
                        name: fc.name,
                        response: { result: resultText }
                      });
                      
                      // Wait 2s after each action for UI to update
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      
                      if (action !== "screenshot") {
                        const actionScreenshot = await desktop.screenshot();
                        
                        // Save as PNG for frontend display
                        const filename = `screenshot-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
                        const screenshotsDir = join(process.cwd(), "public", "screenshots");
                        const filePath = join(screenshotsDir, filename);
                        writeFileSync(filePath, actionScreenshot);
                        
                        sendEvent({
                          type: "screenshot-update",
                          screenshot: `/api/screenshots/${filename}`
                        });
                      }
                    } else if (fc.name === "bash_command") {
                      const result = await desktop.commands.run(args.command);
                      const output = result.stdout || result.stderr || "(Command executed successfully with no output)";
                      
                      sendEvent({
                        type: "tool-output-available",
                        toolCallId: toolCallId,
                        output: { type: "text", text: output }
                      });
                      
                      functionResponses.push({
                        name: fc.name,
                        response: { result: output }
                      });
                      
                      // Wait 2s after bash command for execution to complete
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      
                      const bashScreenshot = await desktop.screenshot();
                      
                      // Save as PNG for frontend display
                      const filename = `screenshot-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
                      const screenshotsDir = join(process.cwd(), "public", "screenshots");
                      const filePath = join(screenshotsDir, filename);
                      writeFileSync(filePath, bashScreenshot);
                      
                      sendEvent({
                        type: "screenshot-update",
                        screenshot: `/api/screenshots/${filename}`
                      });
                    }
                  } catch (error) {
                    console.error("Error executing tool:", error);
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    sendEvent({
                      type: "error",
                      errorText: errorMsg
                    });
                    functionResponses.push({
                      name: fc.name,
                      response: { error: errorMsg }
                    });
                  }
                })();
                
                toolExecutionPromises.push(executionPromise);
              }
            }
          }
          
          await Promise.all(toolExecutionPromises);
          
          if (functionCalls.length > 0) {
            const newScreenshot = await desktop.screenshot();
            
            // Save as PNG for frontend display
            const finalFilename = `screenshot-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
            const finalFilePath = join(screenshotsDir, finalFilename);
            writeFileSync(finalFilePath, newScreenshot);
            
            sendEvent({
              type: "screenshot-update",
              screenshot: `/api/screenshots/${finalFilename}`
            });

            // Upload screenshot to Gemini File API
            const tempPath2 = join(tmpdir(), `screenshot-${Date.now()}.png`);
            writeFileSync(tempPath2, newScreenshot);
            const uploadedFile2 = await genAIFiles.files.upload({
              file: tempPath2,
              config: { mimeType: "image/png" },
            });

            chatHistory.push({
              role: "model",
              parts: functionCalls.map(fc => ({
                functionCall: {
                  name: fc.name,
                  args: fc.args
                }
              }))
            });

            // Build function response parts
            const responseParts: any[] = [];
            
            for (const fr of functionResponses) {
              responseParts.push({
                functionResponse: {
                  name: fr.name,
                  response: fr.response
                }
              });
            }
            
            chatHistory.push({
              role: "user",
              parts: responseParts
            });

            chatHistory.push({
              role: "user",
              parts: [
                { text: `All ${functionCalls.length} action(s) completed. Continue with the next steps. Here is the current screen (resolution: ${resolution.x}x${resolution.y}):` },
                {
                  fileData: {
                    mimeType: uploadedFile2.mimeType,
                    fileUri: uploadedFile2.uri
                  }
                }
              ]
            });

            functionCalls = [];
          } else {
            controller.close();
            return;
          }
        }
        
        controller.close();
      } catch (error) {
        console.error("Chat API error:", error);
        await killDesktop(sandboxId);
        sendEvent({
          type: "error",
          errorText: String(error)
        });
        controller.close();
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

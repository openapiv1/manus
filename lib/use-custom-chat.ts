"use client";

import { useState, useCallback, useRef, FormEvent, ChangeEvent } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: any[];
};

type UseChatOptions = {
  api: string;
  id?: string;
  body?: Record<string, any>;
  maxSteps?: number;
  onError?: (error: Error) => void;
};

type ChatStatus = "ready" | "streaming" | "error";

export function useCustomChat(options: UseChatOptions) {
  const { api, body, onError } = options;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentMessageRef = useRef<Message | null>(null);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const append = useCallback(async ({ role, content }: { role: "user" | "assistant"; content: string }) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role,
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setStatus("streaming");

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          ...body,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No reader available");
      }

      let assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        parts: [{ type: "text", text: "" }],
      };
      currentMessageRef.current = assistantMessage;
      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "text-delta") {
                assistantMessage.content += data.delta;
                
                // Find the last part
                const lastPart = assistantMessage.parts?.[assistantMessage.parts.length - 1];
                
                // If last part is text, update it; otherwise create new text part
                if (lastPart && lastPart.type === "text") {
                  lastPart.text += data.delta;
                } else {
                  // Create new text part after tool invocations
                  assistantMessage.parts = [...(assistantMessage.parts || []), { type: "text", text: data.delta }];
                }
                
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = { ...assistantMessage };
                  return newMessages;
                });
              } else if (data.type === "tool-call-start") {
                const toolPart = {
                  type: "tool-invocation",
                  toolInvocation: {
                    toolCallId: data.toolCallId,
                    toolName: "",
                    args: {},
                    argsText: "",
                    state: "streaming",
                  },
                };
                assistantMessage.parts = [...(assistantMessage.parts || []), toolPart];
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = { ...assistantMessage };
                  return newMessages;
                });
              } else if (data.type === "tool-name-delta") {
                const toolPartIndex = assistantMessage.parts?.findIndex(
                  (p: any) => p.type === "tool-invocation" && p.toolInvocation.toolCallId === data.toolCallId
                );
                if (toolPartIndex !== undefined && toolPartIndex !== -1 && assistantMessage.parts) {
                  const toolPart = assistantMessage.parts[toolPartIndex];
                  if (toolPart.type === "tool-invocation") {
                    assistantMessage.parts = [
                      ...assistantMessage.parts.slice(0, toolPartIndex),
                      {
                        ...toolPart,
                        toolInvocation: {
                          ...toolPart.toolInvocation,
                          toolName: data.toolName,
                        },
                      },
                      ...assistantMessage.parts.slice(toolPartIndex + 1),
                    ];
                    setMessages((prev) => {
                      const newMessages = [...prev];
                      newMessages[newMessages.length - 1] = { ...assistantMessage };
                      return newMessages;
                    });
                  }
                }
              } else if (data.type === "tool-argument-delta") {
                const toolPartIndex = assistantMessage.parts?.findIndex(
                  (p: any) => p.type === "tool-invocation" && p.toolInvocation.toolCallId === data.toolCallId
                );
                if (toolPartIndex !== undefined && toolPartIndex !== -1 && assistantMessage.parts) {
                  const toolPart = assistantMessage.parts[toolPartIndex];
                  if (toolPart.type === "tool-invocation") {
                    const newArgsText = (toolPart.toolInvocation.argsText || "") + data.delta;
                    let newArgs = toolPart.toolInvocation.args;
                    try {
                      newArgs = JSON.parse(newArgsText);
                    } catch (e) {
                      // Keep old args if parse fails
                    }
                    assistantMessage.parts = [
                      ...assistantMessage.parts.slice(0, toolPartIndex),
                      {
                        ...toolPart,
                        toolInvocation: {
                          ...toolPart.toolInvocation,
                          argsText: newArgsText,
                          args: newArgs,
                        },
                      },
                      ...assistantMessage.parts.slice(toolPartIndex + 1),
                    ];
                    setMessages((prev) => {
                      const newMessages = [...prev];
                      newMessages[newMessages.length - 1] = { ...assistantMessage };
                      return newMessages;
                    });
                  }
                }
              } else if (data.type === "tool-input-available") {
                const toolPartIndex = assistantMessage.parts?.findIndex(
                  (p: any) => p.type === "tool-invocation" && p.toolInvocation.toolCallId === data.toolCallId
                );
                if (toolPartIndex !== undefined && toolPartIndex !== -1 && assistantMessage.parts) {
                  const toolPart = assistantMessage.parts[toolPartIndex];
                  if (toolPart.type === "tool-invocation") {
                    assistantMessage.parts = [
                      ...assistantMessage.parts.slice(0, toolPartIndex),
                      {
                        ...toolPart,
                        toolInvocation: {
                          ...toolPart.toolInvocation,
                          args: data.input,
                          state: "call",
                        },
                      },
                      ...assistantMessage.parts.slice(toolPartIndex + 1),
                    ];
                    setMessages((prev) => {
                      const newMessages = [...prev];
                      newMessages[newMessages.length - 1] = { ...assistantMessage };
                      return newMessages;
                    });
                  }
                }
              } else if (data.type === "tool-output-available") {
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  
                  const toolPartIndex = lastMessage.parts?.findIndex(
                    (p: any) => p.type === "tool-invocation" && p.toolInvocation.toolCallId === data.toolCallId
                  );
                  
                  if (toolPartIndex !== undefined && toolPartIndex !== -1 && lastMessage.parts) {
                    const toolPart = lastMessage.parts[toolPartIndex];
                    if (toolPart.type === "tool-invocation") {
                      // Create completely new message with updated parts
                      newMessages[newMessages.length - 1] = {
                        ...lastMessage,
                        parts: [
                          ...lastMessage.parts.slice(0, toolPartIndex),
                          {
                            ...toolPart,
                            toolInvocation: {
                              ...toolPart.toolInvocation,
                              state: "result",
                              result: data.output,
                            },
                          },
                          ...lastMessage.parts.slice(toolPartIndex + 1),
                        ],
                      };
                      
                      // Also update the ref
                      assistantMessage.parts = newMessages[newMessages.length - 1].parts;
                    }
                  }
                  
                  return newMessages;
                });
              } else if (data.type === "screenshot-update") {
                // Update the current screenshot display
                setCurrentScreenshot(data.screenshot);
              } else if (data.type === "error") {
                throw new Error(data.errorText);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }

      setStatus("ready");
      currentMessageRef.current = null;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setStatus("ready");
        return;
      }
      
      setStatus("error");
      if (onError && error instanceof Error) {
        onError(error);
      }
      console.error("Chat error:", error);
    }
  }, [api, body, messages, onError]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim() || status === "streaming") return;

      const userInput = input;
      setInput("");
      await append({ role: "user", content: userInput });
    },
    [input, status, append]
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus("ready");
  }, []);

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    stop,
    append,
    setMessages,
    currentScreenshot,
  };
}

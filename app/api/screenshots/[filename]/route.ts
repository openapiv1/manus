import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const filename = params.filename;
    const screenshotsDir = join(process.cwd(), "public", "screenshots");
    const filePath = join(screenshotsDir, filename);
    
    const imageBuffer = await readFile(filePath);
    
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving screenshot:", error);
    return new NextResponse("Screenshot not found", { status: 404 });
  }
}

"use client";

import { Camera } from "lucide-react";

interface ScreenshotViewerProps {
  screenshot: string | null;
}

export function ScreenshotViewer({ screenshot }: ScreenshotViewerProps) {
  if (!screenshot) {
    return null;
  }

  return (
    <div className="w-full px-4 py-2">
      <div className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <Camera className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-baseline gap-2 font-mono text-sm font-medium">
              <span>Current Screen</span>
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt="Current Screenshot"
            className="w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { CloseIcon } from "@/components/icons";

// The camera view for Grocery mode. Uses the browser's BarcodeDetector where
// it exists (Chrome on Android) and falls back to @zxing/browser (iPhone
// Safari), loaded only when needed.

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorClass = new (options: { formats: string[] }) => Detector;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const found = useEffectEvent((code: string) => onDetected(code));

  useEffect(() => {
    let stopped = false;
    let stop = () => {};
    const el = video.current!;

    async function start() {
      const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
      if (Native) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        el.srcObject = stream;
        await el.play();
        const detector = new Native({ formats: FORMATS });
        const timer = setInterval(async () => {
          if (el.readyState < 2) return;
          try {
            const [code] = await detector.detect(el);
            if (code?.rawValue && !stopped) {
              stopped = true;
              found(code.rawValue);
            }
          } catch {
            // A frame that couldn't be read; try the next one.
          }
        }, 250);
        stop = () => {
          clearInterval(timer);
          stream.getTracks().forEach((t) => t.stop());
        };
        return;
      }

      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (stopped) return;
      const controls = await new BrowserMultiFormatReader().decodeFromConstraints(
        { video: { facingMode: "environment" }, audio: false },
        el,
        (result) => {
          if (result && !stopped) {
            stopped = true;
            found(result.getText());
          }
        },
      );
      stop = () => controls.stop();
      if (stopped) stop();
    }

    start().catch((err: unknown) => {
      const name = err instanceof DOMException ? err.name : "";
      setProblem(
        name === "NotAllowedError"
          ? "Camera is blocked. Allow it in your browser settings, or type the price below."
          : "Couldn't open the camera. Type the price below instead.",
      );
    });
    return () => {
      stopped = true;
      stop();
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-scrim">
      <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-2xl border-4 border-sun" />
      <p role="status" className="absolute inset-x-0 bottom-0 bg-scrim/80 px-4 py-2 text-center text-sm font-bold text-white">
        {problem ?? "Point at the barcode"}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close camera"
        className="absolute top-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink"
      >
        <CloseIcon size={18} />
      </button>
    </div>
  );
}

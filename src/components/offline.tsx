"use client";

import { useOffline } from "next/offline";
import { useEffect } from "react";

/** A bar while the signal is gone. Saves and page loads wait and retry by themselves. */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-30 bg-ink px-4 py-2 text-center text-sm font-bold text-white pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      You&apos;re offline. I&apos;ll save and load again as soon as you&apos;re back.
    </div>
  );
}

/** Registers public/sw.js in production, so the app installs and opens offline. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Not supported here (e.g. private mode): the app works without it.
    });
  }, []);
  return null;
}

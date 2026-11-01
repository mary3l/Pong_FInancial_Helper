"use client";

import { useEffect } from "react";
import { Pong } from "@/components/pong";

// Shown when a screen can't load, usually because Supabase couldn't be
// reached. Server error details stay in the server log in production.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Pong mood="worried" size={120} decorative />
      <h1 className="font-display text-2xl font-semibold">I couldn&apos;t load this</h1>
      <p className="text-[15px] leading-relaxed text-muted">
        Something went wrong getting your money data. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="h-12 rounded-[18px] bg-sun px-6 font-extrabold text-ink"
      >
        Try again
      </button>
    </main>
  );
}

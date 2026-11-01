"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// A route shown over the current page (see app/(app)/@modal). Full screen on
// phones, a centered dialog from lg up. Esc and back both close it.
export function Modal({
  path,
  label,
  children,
}: {
  /** The route this modal shows. A link elsewhere leaves it in the slot, so hide it then. */
  path: string;
  label: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return pathname === path ? <ModalDialog label={label}>{children}</ModalDialog> : null;
}

function ModalDialog({ label, children }: { label: string; children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        router.back();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-mint p-0 text-ink backdrop:bg-ink/50 lg:m-auto lg:h-auto lg:max-h-[calc(100dvh-48px)] lg:w-[calc(100%-48px)] lg:max-w-[980px] lg:rounded-[32px] lg:shadow-[0_24px_60px_rgba(18,48,42,0.35)]"
    >
      {children}
    </dialog>
  );
}

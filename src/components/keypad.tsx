"use client";

import type { Key } from "@/lib/calculator";

// Pong's calculator keypad from the design canvas, shared by the Add screen
// and the calculator sheet on every other amount field.

type KeyDef = { key: Key; label: string; kind: "num" | "op" | "fn" | "eq"; className?: string };

const KEYS: KeyDef[] = [
  { key: "C", label: "Clear", kind: "fn" },
  { key: "⌫", label: "Delete last digit", kind: "fn" },
  { key: "÷", label: "Divide", kind: "op" },
  { key: "×", label: "Multiply", kind: "op" },
  { key: "7", label: "7", kind: "num" },
  { key: "8", label: "8", kind: "num" },
  { key: "9", label: "9", kind: "num" },
  { key: "−", label: "Minus", kind: "op" },
  { key: "4", label: "4", kind: "num" },
  { key: "5", label: "5", kind: "num" },
  { key: "6", label: "6", kind: "num" },
  { key: "+", label: "Plus", kind: "op" },
  { key: "1", label: "1", kind: "num" },
  { key: "2", label: "2", kind: "num" },
  { key: "3", label: "3", kind: "num" },
  { key: "=", label: "Equals", kind: "eq", className: "row-span-2" },
  { key: "0", label: "0", kind: "num", className: "col-span-2" },
  { key: ".", label: "Decimal point", kind: "num" },
];

const KEY_STYLE = {
  num: "bg-white font-medium",
  op: "bg-sun-tint font-semibold",
  fn: "bg-[#e3efe8] font-semibold",
  eq: "bg-sea font-semibold text-white",
};

/** Four columns by five rows; pass the row heights in `className`. */
export function Keypad({ onPress, className }: { onPress: (key: Key) => void; className: string }) {
  return (
    <div className={`grid grid-cols-4 gap-2 ${className}`}>
      {KEYS.map((k) => (
        <button
          key={k.key}
          type="button"
          aria-label={k.label}
          onClick={() => onPress(k.key)}
          className={`rounded-2xl font-display text-[24px] active:scale-95 ${KEY_STYLE[k.kind]} ${k.className ?? ""}`}
        >
          {k.key}
        </button>
      ))}
    </div>
  );
}

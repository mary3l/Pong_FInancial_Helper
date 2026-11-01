import { Pong, type PongMood } from "@/components/pong";

export function SetupHeader({
  step,
  title,
  message,
  mood,
}: {
  /** 1 or 2; omit when editing from Settings. */
  step?: number;
  title: string;
  message: string;
  mood: PongMood;
}) {
  return (
    <header className="flex flex-col gap-3">
      {step && (
        <>
          <p className="text-sm font-extrabold text-muted">STEP {step} OF 2</p>
          <div className="flex gap-1.5" aria-hidden="true">
            {[1, 2].map((n) => (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-sea" : "bg-line"}`}
              />
            ))}
          </div>
        </>
      )}
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <h1 className="font-display text-[28px] leading-tight font-semibold">{title}</h1>
          <p className="text-[15px] leading-relaxed text-muted">{message}</p>
        </div>
        <Pong mood={mood} size={76} decorative />
      </div>
    </header>
  );
}

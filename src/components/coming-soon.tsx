import { Pong, type PongMood } from "@/components/pong";

// Placeholder for screens that later phases of the dev plan fill in.
export function ComingSoon({
  title,
  message,
  phase,
  mood = "peek",
}: {
  title: string;
  message: string;
  phase: string;
  mood?: PongMood;
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      <section className="flex flex-col items-center gap-4 rounded-3xl bg-white px-6 py-10 text-center">
        <Pong mood={mood} size={120} decorative />
        <p className="max-w-sm text-base leading-relaxed text-muted">{message}</p>
        <span className="rounded-full bg-sun-tint px-3 py-1 text-sm font-extrabold text-sun-text">
          Coming in {phase}
        </span>
      </section>
    </div>
  );
}

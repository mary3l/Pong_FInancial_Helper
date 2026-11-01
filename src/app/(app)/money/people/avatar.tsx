/** A person's initial in a circle. Decorative: the name is always shown next to it. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-sun-tint font-display text-[15px] font-semibold text-sun-text"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

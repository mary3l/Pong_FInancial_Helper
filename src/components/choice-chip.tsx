// A pill you pick one of, like a wallet or a pay schedule.
export function ChoiceChip({
  selected,
  onClick,
  children,
  className = "",
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-extrabold ${
        selected ? "bg-ink text-mint" : "bg-card text-ink hover:bg-sea-tint"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export const FIELD_CLASS =
  "h-12 min-w-0 rounded-[14px] border-2 border-line bg-card px-4 text-base outline-none focus:border-sea";

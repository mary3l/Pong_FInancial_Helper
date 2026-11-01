import Link from "next/link";
import { Suspense } from "react";
import { DisplayNameForm } from "@/components/display-name-form";
import { Pong } from "@/components/pong";
import { getCurrentUser } from "@/lib/auth";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={<HeaderSkeleton />}>
        <Header />
      </Suspense>

      <div className="flex items-end gap-1">
        <Pong mood="happy" size={92} decorative />
        <p className="relative mb-5 flex-1 rounded-[20px_20px_20px_6px] bg-white px-3.5 py-3 text-[15px] leading-relaxed shadow-[0_2px_0_var(--color-line)]">
          <strong>Hi, I&apos;m Pong!</strong> Add your wallets and payday, and
          I&apos;ll work out how much you can safely spend each day.
        </p>
      </div>

      <section className="relative flex flex-col gap-1.5 overflow-hidden rounded-[28px] bg-sea p-6 text-white lg:p-7">
        <div
          aria-hidden="true"
          className="absolute -top-12 -right-10 h-40 w-40 rounded-full bg-sea-light"
        />
        <span className="relative text-sm font-bold text-sea-text">
          SAFE TO SPEND TODAY
        </span>
        <span className="relative font-display text-5xl leading-none font-semibold lg:text-6xl">
          ₱ —
        </span>
        <span className="relative text-[15px] text-sea-text">
          Set up your wallets to see this number.
        </span>
      </section>

      <p className="text-sm text-muted">
        Wallet setup and expense logging arrive in Phase 1 of the dev plan.
      </p>
    </div>
  );
}

async function Header() {
  const user = await getCurrentUser();
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold lg:text-3xl">
          {user.name ? `Kumusta, ${user.name}!` : "Kumusta!"}
        </h1>
        <Link
          href="/settings"
          aria-label="Settings and account"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sun font-display text-lg font-semibold text-ink"
        >
          {user.name ? user.name.charAt(0).toUpperCase() : <PersonIcon />}
        </Link>
      </div>

      {!user.name && (
        <section className="rounded-3xl bg-white p-5">
          <DisplayNameForm
            initialName={null}
            label="What should I call you?"
            hint="Pick any name or nickname. You can change it later in Settings."
          />
        </section>
      )}
    </>
  );
}

function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3" aria-hidden="true">
      <div className="h-8 w-48 rounded-lg bg-line-soft" />
      <div className="h-11 w-11 rounded-full bg-line-soft" />
    </div>
  );
}

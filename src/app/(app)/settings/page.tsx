import { Suspense } from "react";
import { signOut } from "@/app/actions";
import { DisplayNameForm } from "@/components/display-name-form";
import { getCurrentUser } from "@/lib/auth";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold">Settings &amp; tools</h1>

      <section className="flex flex-col gap-4 rounded-3xl bg-white p-6">
        <h2 className="font-display text-xl font-semibold">Profile</h2>
        <Suspense fallback={<div className="h-28 rounded-[14px] bg-line-soft" />}>
          <Profile />
        </Suspense>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl bg-white p-6">
        <h2 className="font-display text-xl font-semibold">Account</h2>
        <Suspense fallback={<p className="h-6 w-56 rounded bg-line-soft" />}>
          <SignedInAs />
        </Suspense>
        <form action={signOut}>
          <button
            type="submit"
            className="h-12 rounded-[18px] border-2 border-line px-5 font-bold text-ink hover:bg-mint"
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}

async function Profile() {
  const user = await getCurrentUser();
  return <DisplayNameForm initialName={user.name} />;
}

async function SignedInAs() {
  const user = await getCurrentUser();
  return (
    <p className="text-muted">
      Signed in as <strong className="text-ink">{user.email}</strong>
    </p>
  );
}

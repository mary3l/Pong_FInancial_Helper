import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type User = {
  id: string;
  email: string;
  /** What Pong calls the user. Null until they choose one. */
  name: string | null;
};

// Reads the session at request time, so callers must sit behind <Suspense>.
export async function getCurrentUser(): Promise<User> {
  // Supabase checks token expiry with Date.now(), so opt out of prerendering
  // explicitly; otherwise Cache Components flags it during validation.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  // Only the name the user picked; never guessed from the email.
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    typeof meta.display_name === "string" && meta.display_name.trim()
      ? meta.display_name.trim()
      : null;

  return { id: claims.sub, email: claims.email ?? "", name };
}

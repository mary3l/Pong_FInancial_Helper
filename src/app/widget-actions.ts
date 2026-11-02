"use server";

import { createHash, randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { SIGNED_OUT_ERROR, signedInClient } from "@/lib/auth";

export type WidgetKeyState = { error?: string; setupCode?: string };

/**
 * Makes a widget key for the Scriptable home screen widget, replacing any
 * old one, and returns the setup code to paste into Scriptable. Only the
 * key's hash is stored, so the code can be shown just this once.
 */
export async function createWidgetKey(): Promise<WidgetKeyState> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return { error: SIGNED_OUT_ERROR };

  const key = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("widget_keys").upsert(
    {
      user_id: userId,
      key_hash: createHash("sha256").update(key).digest("hex"),
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    return {
      error:
        error.code === "PGRST205"
          ? "The widget table is missing. Run step 9 in supabase/SQL_GUIDE.md first."
          : "Couldn't make a widget key. Please try again.",
    };
  }

  // Where tapping the widget goes: this app, at the address you're using now.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  // The Supabase URL and publishable key are public; the widget key is not.
  const setup = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    widget: key,
    app: `${proto}://${host}`,
  };
  refresh();
  return { setupCode: Buffer.from(JSON.stringify(setup)).toString("base64url") };
}

/** Deletes the widget key, so the widget stops showing your spending. */
export async function turnOffWidget(): Promise<WidgetKeyState> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return { error: SIGNED_OUT_ERROR };

  const { error } = await supabase.from("widget_keys").delete().eq("user_id", userId);
  if (error) return { error: "Couldn't turn off the widget. Please try again." };
  refresh();
  return {};
}

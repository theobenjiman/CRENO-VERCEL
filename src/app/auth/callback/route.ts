import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** OAuth (Google) and email-link sign-in land here with ?code=… to start the session. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?e=auth", url.origin));
}

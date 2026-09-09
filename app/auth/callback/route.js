import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = supabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Send to the root page, which checks whether this person already
  // belongs to a league and routes to /create-league or /picks accordingly.
  return NextResponse.redirect(`${origin}/`);
}
import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

// Server-side workaround for a currently-active Supabase platform bug where
// auth.uid() resolves to NULL inside RLS policy checks for ES256-signed
// session tokens, even though the token itself is valid (confirmed via
// Supabase's own /auth/v1/user endpoint, which this route uses). Until
// that's fixed upstream, writes that need to know "who is this" happen
// here instead of relying on the browser talking to the database directly.
export async function POST(request) {
  const { name, season_year, picks_per_week } = await request.json();

  // Step 1: verify who's asking, via the Auth service directly (this path
  // is unaffected by the RLS/PostgREST bug).
  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Step 2: perform the writes with the service role (bypasses RLS
  // entirely), now that we've verified the user ourselves.
  const admin = supabaseAdmin();
  const { data: league, error: leagueErr } = await admin
    .from("leagues")
    .insert({ name, season_year, picks_per_week })
    .select()
    .single();
  if (leagueErr) return NextResponse.json({ error: leagueErr.message }, { status: 400 });

  const { error: memberErr } = await admin
    .from("league_members")
    .insert({ league_id: league.id, user_id: user.id, role: "commissioner" });
  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 400 });

  return NextResponse.json({ league });
}
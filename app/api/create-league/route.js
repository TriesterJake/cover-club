import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

// Server-side workaround for a currently-active Supabase platform bug where
// auth.uid() resolves to NULL inside RLS policy checks for ES256-signed
// session tokens, even though the token itself is valid (confirmed via
// Supabase's own /auth/v1/user endpoint, which this route uses). Until
// that's fixed upstream, writes that need to know "who is this" happen
// here instead of relying on the browser talking to the database directly.
// Is there already a league? The create-league page uses this to decide
// whether to show the form (first-ever setup) or tell people to ask the
// commissioner to add them.
export async function GET() {
  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { count } = await supabaseAdmin().from("leagues").select("id", { count: "exact", head: true });
  return NextResponse.json({ leagueExists: (count || 0) > 0 });
}

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

  // Only the very first league can be created this way; after that, people
  // join by being added by the commissioner.
  const { count: existing } = await admin.from("leagues").select("id", { count: "exact", head: true });
  if ((existing || 0) > 0) {
    return NextResponse.json({ error: "A league already exists. Ask the commissioner to add your email." }, { status: 403 });
  }

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
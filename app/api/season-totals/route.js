import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ userId: user.id, members: [], totals: {} });

  const { data: leagueMembers } = await admin
    .from("league_members").select("user_id, profiles(display_name)").eq("league_id", membership.league_id);

  const { data: graded } = await admin
    .from("graded_picks").select("user_id, points").eq("game_status", "final");

  const totals = {};
  (graded || []).forEach((g) => { totals[g.user_id] = (totals[g.user_id] || 0) + Number(g.points); });

  return NextResponse.json({
    userId: user.id,
    isCommissioner: membership.role === "commissioner",
    members: (leagueMembers || []).map((m) => ({ user_id: m.user_id, display_name: m.profiles?.display_name })),
    totals,
  });
}
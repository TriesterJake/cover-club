import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(request) {
  const { gameId, userId, team, line } = await request.json();

  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership || membership.role !== "commissioner") {
    return NextResponse.json({ error: "Only commissioners can do this" }, { status: 403 });
  }

  const { data: existing } = await admin
    .from("picks").select("id").eq("game_id", gameId).eq("user_id", userId).maybeSingle();

  const { error } = await admin.from("picks").upsert({
    id: existing?.id,
    game_id: gameId,
    user_id: userId,
    team,
    line,
    source: existing ? "commissioner_correction" : "commissioner_backfill",
    entered_by: user.id,
  }, { onConflict: "game_id,user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
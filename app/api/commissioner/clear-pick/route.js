import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(request) {
  const { gameId, userId } = await request.json();

  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership || membership.role !== "commissioner") {
    return NextResponse.json({ error: "Only commissioners can do this" }, { status: 403 });
  }

  await admin.from("picks").delete().eq("game_id", gameId).eq("user_id", userId);
  return NextResponse.json({ ok: true });
}
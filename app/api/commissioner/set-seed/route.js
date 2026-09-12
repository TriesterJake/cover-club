import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(request) {
  const { userId, seed } = await request.json(); // seed: 1-4, or null to clear

  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership || membership.role !== "commissioner") {
    return NextResponse.json({ error: "Only commissioners can do this" }, { status: 403 });
  }

  if (seed !== null) {
    // Clear that seed number off anyone else who currently has it, so
    // seeds 1-4 always map to exactly one person each.
    await admin.from("league_members").update({ playoff_seed: null })
      .eq("league_id", membership.league_id).eq("playoff_seed", seed);
  }

  const { error } = await admin.from("league_members").update({ playoff_seed: seed })
    .eq("league_id", membership.league_id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
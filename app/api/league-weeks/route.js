import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

// Lists every week for the signed-in person's league -- used to power the
// week-picker toggle on Scoreboard, Games, and Commissioner Tools.
export async function GET() {
  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("league_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ weeks: [] });

  const { data: weeks } = await admin
    .from("weeks").select("*").eq("league_id", membership.league_id).order("week_number");
  return NextResponse.json({ weeks: weeks || [] });
}
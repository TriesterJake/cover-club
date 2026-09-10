import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

// Generates all 18 regular-season weeks at once, each with a 7-day date
// range starting from the given Week 1 start date (should be that week's
// Tuesday or so, ahead of the Thursday night game, giving each week a
// window like Tue-Mon so every real game of the week lands inside it).
export async function POST(request) {
  const { week1StartDate } = await request.json();

  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership || membership.role !== "commissioner") {
    return NextResponse.json({ error: "Only commissioners can do this" }, { status: 403 });
  }

  const start = new Date(week1StartDate + "T00:00:00Z");
  const weeksToInsert = [];
  for (let i = 0; i < 18; i++) {
    const weekStart = new Date(start.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    weeksToInsert.push({
      league_id: membership.league_id,
      week_number: i + 1,
      label: `Week ${i + 1}`,
      type: "regular",
      start_date: weekStart.toISOString().slice(0, 10),
      end_date: weekEnd.toISOString().slice(0, 10),
    });
  }

  const { error } = await admin.from("weeks").upsert(weeksToInsert, { onConflict: "league_id,week_number" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, count: weeksToInsert.length });
}
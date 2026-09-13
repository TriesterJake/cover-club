import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ name: null, season_year: null });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("league_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ name: null, season_year: null });

  const { data: league } = await admin.from("leagues").select("name, season_year").eq("id", membership.league_id).single();
  return NextResponse.json({ name: league?.name || null, season_year: league?.season_year || null });
}
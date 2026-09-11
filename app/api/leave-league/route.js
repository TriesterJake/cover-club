import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

export async function POST() {
  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "You're not in a league" }, { status: 400 });

  if (membership.role === "commissioner") {
    return NextResponse.json({
      error: "Commissioners can't leave directly -- delete the league instead (Commissioner Tools -> Danger zone), or have another commissioner remove you.",
    }, { status: 400 });
  }

  await admin.from("league_members").delete().eq("league_id", membership.league_id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
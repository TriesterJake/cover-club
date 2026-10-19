import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

// Commissioner sets a new (temporary) password for someone in their league,
// e.g. when a family member forgets theirs. The person can change it
// themselves afterward on the Profile page.
export async function POST(request) {
  const { userId, password } = await request.json().catch(() => ({}));
  if (!userId || typeof password !== "string" || password.length < 8 || password.length > 72) {
    return NextResponse.json({ error: "Pick a password between 8 and 72 characters." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership || membership.role !== "commissioner") {
    return NextResponse.json({ error: "Only commissioners can do this" }, { status: 403 });
  }

  // The person must actually be in this commissioner's league.
  const { data: target } = await admin
    .from("league_members").select("user_id")
    .eq("league_id", membership.league_id).eq("user_id", userId).maybeSingle();
  if (!target) return NextResponse.json({ error: "That person isn't in your league." }, { status: 404 });

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

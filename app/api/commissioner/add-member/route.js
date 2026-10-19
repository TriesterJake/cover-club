import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

// Commissioner adds someone by email. If they already have an account they
// join the league right away; otherwise an invite is saved, and they can
// create their account on the login page (no confirmation email involved).
export async function POST(request) {
  const { email: rawEmail } = await request.json().catch(() => ({}));
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
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

  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (profile) {
    const { data: already } = await admin
      .from("league_members").select("user_id")
      .eq("league_id", membership.league_id).eq("user_id", profile.id).maybeSingle();
    if (already) return NextResponse.json({ error: "They're already in the league." }, { status: 400 });

    const { error } = await admin
      .from("league_members").insert({ league_id: membership.league_id, user_id: profile.id, role: "member" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ status: "added" });
  }

  const { error } = await admin
    .from("league_invites")
    .upsert({ league_id: membership.league_id, email }, { onConflict: "league_id,email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ status: "invited" });
}

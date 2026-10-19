import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

async function commissionerContext() {
  const supabase = supabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership || membership.role !== "commissioner") {
    return { error: NextResponse.json({ error: "Only commissioners can do this" }, { status: 403 }) };
  }
  return { admin, leagueId: membership.league_id };
}

// Pending invites: people added by email who haven't created an account yet.
export async function GET() {
  const ctx = await commissionerContext();
  if (ctx.error) return ctx.error;
  const { data } = await ctx.admin
    .from("league_invites").select("id, email, created_at")
    .eq("league_id", ctx.leagueId).order("created_at", { ascending: true });
  return NextResponse.json({ invites: data || [] });
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ctx = await commissionerContext();
  if (ctx.error) return ctx.error;
  await ctx.admin.from("league_invites").delete().eq("id", id).eq("league_id", ctx.leagueId);
  return NextResponse.json({ ok: true });
}

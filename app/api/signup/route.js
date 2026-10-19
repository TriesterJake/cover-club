import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Creates an account (email + password) with NO confirmation email -- but
// only for people the commissioner has invited. The one exception: if no
// league exists yet, anyone may sign up, so the very first person can
// create the league and become its commissioner.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const displayName = String(body.displayName || "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (password.length > 72) {
    return NextResponse.json({ error: "Password must be 72 characters or fewer." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { count: leagueCount } = await admin.from("leagues").select("id", { count: "exact", head: true });

  let invite = null;
  if ((leagueCount || 0) > 0) {
    const { data } = await admin
      .from("league_invites").select("id, league_id").eq("email", email).limit(1).maybeSingle();
    if (!data) {
      return NextResponse.json({
        error: "That email hasn't been added to the league yet. Ask your commissioner to add it, then try again.",
      }, { status: 403 });
    }
    invite = data;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) {
    if (/already|registered|exists/i.test(createErr.message)) {
      return NextResponse.json({
        error: "That email already has an account. Sign in instead -- or if you don't have a password yet, use \"Forgot password?\" on the sign-in screen.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: createErr.message }, { status: 400 });
  }
  const userId = created.user.id;

  if (displayName) {
    await admin.from("profiles").update({ display_name: displayName }).eq("id", userId);
  }

  if (invite) {
    const { error: memberErr } = await admin
      .from("league_members").insert({ league_id: invite.league_id, user_id: userId, role: "member" });
    if (memberErr) {
      // Don't leave a half-created account behind.
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "Couldn't add you to the league. Please try again." }, { status: 500 });
    }
    await admin.from("league_invites").delete().eq("email", email);
  }

  return NextResponse.json({ ok: true });
}

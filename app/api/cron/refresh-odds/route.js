import { supabaseAdmin } from "@/lib/supabaseServer";
import { refreshOddsForLeague } from "@/lib/oddsApi";

// Vercel Hobby caps functions at 60s -- set explicitly rather than
// relying on the (much lower) default, as extra headroom.
export const maxDuration = 60;

// Schedule sync (which games exist, their status/score) lives in
// refresh-scores now, not here -- this route ONLY checks DraftKings
// lines. Splitting the two jobs keeps each one fast and halves what a
// single request has to do, which is what was causing this to time out.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: league } = await admin.from("leagues").select("id").limit(1).single();
  if (!league) return Response.json({ ok: false, reason: "no league found" });

  const oddsResults = await refreshOddsForLeague(admin, league.id);
  return Response.json({ ok: true, league_id: league.id, oddsResults });
}
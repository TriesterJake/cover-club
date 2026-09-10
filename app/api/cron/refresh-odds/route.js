import { supabaseAdmin } from "@/lib/supabaseServer";
import { refreshOddsForLeague } from "@/lib/oddsApi";

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  // Single-league deployment (see README) -- just grab the one league that exists.
  const { data: league } = await admin.from("leagues").select("id").limit(1).single();
  if (!league) return Response.json({ ok: false, reason: "no league found" });

  const results = await refreshOddsForLeague(admin, league.id);
  return Response.json({ ok: true, league_id: league.id, results });
}
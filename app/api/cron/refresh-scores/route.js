import { supabaseAdmin } from "@/lib/supabaseServer";
import { refreshScoresForLeague } from "@/lib/espnScores";

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: league } = await admin.from("leagues").select("id").limit(1).single();
  if (!league) return Response.json({ ok: false, reason: "no league found" });

  const results = await refreshScoresForLeague(admin, league.id);
  return Response.json({ ok: true, league_id: league.id, results });
}
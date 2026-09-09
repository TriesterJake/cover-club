import { supabaseAdmin } from "@/lib/supabaseServer";
import { refreshOddsForWeek } from "@/lib/oddsApi";

// Vercel Cron (see vercel.json) hits this on a schedule. Protected so
// randoms on the internet can't trigger it / burn your Odds API credits.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: currentWeek } = await admin
    .from("weeks")
    .select("id")
    .order("week_number", { ascending: false })
    .limit(1)
    .single();

  if (!currentWeek) return Response.json({ ok: false, reason: "no weeks found" });

  const results = await refreshOddsForWeek(admin, currentWeek.id);
  return Response.json({ ok: true, week_id: currentWeek.id, results });
}

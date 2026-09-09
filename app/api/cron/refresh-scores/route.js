import { supabaseAdmin } from "@/lib/supabaseServer";
import { refreshScoresForWeek } from "@/lib/espnScores";

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

  const results = await refreshScoresForWeek(admin, currentWeek.id);
  return Response.json({ ok: true, week_id: currentWeek.id, results });
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function CreateLeaguePage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [name, setName] = useState("");
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [picksPerWeek, setPicksPerWeek] = useState(5);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: league, error: leagueErr } = await supabase
      .from("leagues")
      .insert({ name, season_year: Number(seasonYear), picks_per_week: Number(picksPerWeek) })
      .select()
      .single();
    if (leagueErr) { setError(leagueErr.message); setCreating(false); return; }

    const { error: memberErr } = await supabase
      .from("league_members")
      .insert({ league_id: league.id, user_id: user.id, role: "commissioner" });
    if (memberErr) { setError(memberErr.message); setCreating(false); return; }

    router.push("/picks");
  };

  return (
    <div className="cc-body" style={{ maxWidth: 440, paddingTop: 60 }}>
      <h1 className="cc-title">Create your league</h1>
      <p className="cc-sub">You'll be the commissioner &mdash; you can add family members and backfill past weeks once it's set up.</p>
      <form onSubmit={create}>
        <div className="cc-field">
          <label>League name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="The Cover Club" />
        </div>
        <div className="cc-field">
          <label>Season year</label>
          <input required type="number" value={seasonYear} onChange={(e) => setSeasonYear(e.target.value)} />
        </div>
        <div className="cc-field">
          <label>Picks per person per week</label>
          <input required type="number" value={picksPerWeek} onChange={(e) => setPicksPerWeek(e.target.value)} />
        </div>
        {error && <div className="cc-warning">{error}</div>}
        <button className="cc-savebtn" type="submit" disabled={creating}>{creating ? "Creating…" : "Create league"}</button>
      </form>
    </div>
  );
}

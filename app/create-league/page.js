"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { authedFetch } from "@/lib/authedFetch";

export default function CreateLeaguePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const now = new Date();
  const defaultSeasonLabel = now.getMonth() >= 5 // June or later -> season starting this year
    ? `${now.getFullYear()}-${now.getFullYear() + 1}`
    : `${now.getFullYear() - 1}-${now.getFullYear()}`;
  const [seasonYear, setSeasonYear] = useState(defaultSeasonLabel);
  const [picksPerWeek, setPicksPerWeek] = useState(5);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    const res = await authedFetch("/api/create-league", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, season_year: seasonYear, picks_per_week: Number(picksPerWeek) }),
    });
    const body = await res.json();
    if (!res.ok) { setError(body.error || "Something went wrong"); setCreating(false); return; }

    router.push("/picks");
  };

  return (
    <>
      <Nav isCommissioner={false} />
      <div className="cc-body" style={{ maxWidth: 440, paddingTop: 40 }}>
      <h1 className="cc-title">Create your league</h1>
      <p className="cc-sub">You'll be the commissioner &mdash; you can add family members and backfill past weeks once it's set up.</p>
      <form onSubmit={create}>
        <div className="cc-field">
          <label>League name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="The Cover Club" />
        </div>
        <div className="cc-field">
          <label>Season</label>
          <input required type="text" value={seasonYear} onChange={(e) => setSeasonYear(e.target.value)} placeholder="2026-2027" />
        </div>
        <div className="cc-field">
          <label>Picks per person per week</label>
          <input required type="number" value={picksPerWeek} onChange={(e) => setPicksPerWeek(e.target.value)} />
        </div>
        {error && <div className="cc-warning">{error}</div>}
        <button className="cc-savebtn" type="submit" disabled={creating}>{creating ? "Creating…" : "Create league"}</button>
      </form>
      </div>
    </>
  );
}
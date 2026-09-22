"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

const TABS = [
  { href: "/picks", label: "This Week" },
  { href: "/scoreboard", label: "Scoreboard" },
  { href: "/games", label: "Games" },
  { href: "/stats", label: "Stats" },
  { href: "/playoffs", label: "Playoffs" },
  { href: "/commissioner", label: "Commissioner Tools", commissionerOnly: true },
  { href: "/profile", label: "Profile" },
];

export default function Nav({ isCommissioner }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leagueName, setLeagueName] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);

  useEffect(() => {
    fetch("/api/league-info")
      .then((r) => r.json())
      .then((d) => {
        setLeagueName(d.name);
        setSeasonYear(d.season_year);
        if (d.name) document.title = d.name;
      })
      .catch(() => {});
  }, []);

  const signOut = async () => {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="cc-masthead">
      <div className="cc-masthead-top">
        <div>
          <h1 className="cc-title">{leagueName || "Cover Club"}</h1>
          <p className="cc-sub">Family pick&rsquo;em{seasonYear ? ` · ${seasonYear} season` : ""}</p>
        </div>
        <button className="cc-signout" onClick={signOut}>Sign out</button>
      </div>
      <div className="cc-tabs-scroll">
        <div className="cc-tabs">
          {TABS.filter((t) => !t.commissionerOnly || isCommissioner).map((t) => (
            <Link key={t.href} href={t.href} className={"cc-tab" + (pathname === t.href ? " active" : "")}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
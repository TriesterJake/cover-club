"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

const TABS = [
  { href: "/picks", label: "This Week" },
  { href: "/scoreboard", label: "Scoreboard" },
  { href: "/games", label: "Games" },
  { href: "/playoffs", label: "Playoffs" },
  { href: "/commissioner", label: "Commissioner Tools", commissionerOnly: true },
  { href: "/profile", label: "Profile" },
];

export default function Nav({ isCommissioner }) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="cc-masthead">
      <h1 className="cc-title">The Cover Club</h1>
      <p className="cc-sub">Family pick&rsquo;em &middot; 2026 season</p>
      <div className="cc-tabs">
        {TABS.filter((t) => !t.commissionerOnly || isCommissioner).map((t) => (
          <Link key={t.href} href={t.href} className={"cc-tab" + (pathname === t.href ? " active" : "")}>
            {t.label}
          </Link>
        ))}
        <button className="cc-tab" onClick={signOut} style={{ marginLeft: "auto" }}>Sign out</button>
      </div>
    </div>
  );
}

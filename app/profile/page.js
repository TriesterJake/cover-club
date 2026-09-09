"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import Nav from "@/components/Nav";

export default function ProfilePage() {
  const supabase = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email);
      const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
      setName(profile?.display_name || "");
      const { data: membership } = await supabase.from("league_members").select("role").eq("user_id", user.id).limit(1).single();
      setIsCommissioner(membership?.role === "commissioner");
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").upsert({ id: user.id, display_name: name });
    if (error) { alert(error.message); return; }
    setSaved(true);
  };

  if (loading) return <div className="cc-body">Loading&hellip;</div>;

  return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">
        <div className="cc-weeklabel" style={{ display: "block", marginBottom: 10 }}>Your profile</div>
        <p className="cc-hiddennote" style={{ marginTop: 0 }}>You sign in with your email, but the league sees your display name everywhere instead.</p>
        <div className="cc-field"><label>Email (used to sign in)</label><input value={email} disabled /></div>
        <div className="cc-field"><label>Display name (shown to the league)</label><input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></div>
        <button className="cc-savebtn" onClick={save}>Save name</button>
        {saved && <div className="cc-savedbanner" style={{ marginTop: 14 }}>Saved.</div>}
      </div>
    </>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import Nav from "@/components/Nav";
import { authedFetch } from "@/lib/authedFetch";

export default function ProfilePage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
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

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState(null);

  const changePassword = async () => {
    setPwMsg(null);
    if (pw.length < 8) { setPwMsg({ bad: true, text: "Password must be at least 8 characters." }); return; }
    if (pw !== pw2) { setPwMsg({ bad: true, text: "Passwords don't match." }); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setPwMsg({ bad: true, text: error.message }); return; }
    setPw(""); setPw2("");
    setPwMsg({ text: "Password updated." });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/login");
  };

  const leaveLeague = async () => {
    if (!window.confirm("Leave this league? You'll need to be re-added by the commissioner to rejoin.")) return;
    const res = await authedFetch("/api/leave-league", { method: "POST" });
    const body = await res.json();
    if (!res.ok) { alert(body.error); return; }
    router.push("/create-league");
  };

  if (loading) return <div className="cc-body">Loading&hellip;</div>;

  return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">
        <div className="cc-weeklabel" style={{ display: "block", marginBottom: 10 }}>Your profile</div>
        <p className="cc-hiddennote" style={{ marginTop: 0 }}>You sign in with your email and password, but the league sees your display name everywhere instead.</p>
        <div className="cc-field"><label>Email (used to sign in)</label><input value={email} disabled /></div>
        <div className="cc-field"><label>Display name (shown to the league)</label><input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></div>
        <button className="cc-savebtn" onClick={save}>Save name</button>
        {saved && <div className="cc-savedbanner" style={{ marginTop: 14 }}>Saved.</div>}

        <div className="cc-weeklabel" style={{ display: "block", margin: "32px 0 10px" }}>Change password</div>
        <div className="cc-field"><label>New password</label><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div className="cc-field"><label>Confirm new password</label><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        <button className="cc-savebtn" onClick={changePassword}>Update password</button>
        {pwMsg && (pwMsg.bad
          ? <div className="cc-warning" style={{ marginTop: 14 }}>{pwMsg.text}</div>
          : <div className="cc-savedbanner" style={{ marginTop: 14 }}>{pwMsg.text}</div>)}

        <p style={{ marginTop: 28 }}><button className="cc-namelink" onClick={signOut}>Sign out</button></p>

        {!isCommissioner && (
          <details style={{ marginTop: 40, borderTop: "1px solid var(--loss)", paddingTop: 16 }}>
            <summary className="cc-namelink" style={{ cursor: "pointer", color: "#E58C7C" }}>Leave this league</summary>
            <p className="cc-hiddennote" style={{ marginTop: 8 }}>
              Removes you from the league. Your past picks stay in the history, but you'll stop appearing in
              current weeks and would need the commissioner to add you back by email to rejoin.
            </p>
            <button className="cc-savebtn" style={{ background: "var(--loss)", color: "#fff" }} onClick={leaveLeague}>
              Leave league
            </button>
          </details>
        )}
      </div>
    </>
  );
}
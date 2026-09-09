"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const sendLink = async (e) => {
    e.preventDefault();
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="cc-body" style={{ maxWidth: 400, paddingTop: 80 }}>
      <h1 className="cc-title">The Cover Club</h1>
      <p className="cc-sub">Sign in with your email &mdash; no password, just a link.</p>
      {sent ? (
        <div className="cc-savedbanner">Check your inbox for a sign-in link.</div>
      ) : (
        <form onSubmit={sendLink}>
          <div className="cc-field">
            <label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          {error && <div className="cc-warning">{error}</div>}
          <button className="cc-savebtn" type="submit">Send sign-in link</button>
        </form>
      )}
    </div>
  );
}
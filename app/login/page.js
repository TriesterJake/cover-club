"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (m) => { setMode(m); setError(null); setInfo(null); };

  const signIn = async (addr, pw) => {
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email: addr, password: pw });
    if (error) {
      setError(/invalid login/i.test(error.message)
        ? "Wrong email or password. If you haven't set a password yet, use \"Forgot password?\" below."
        : error.message);
      return false;
    }
    // Full page load so the server sees the new session cookie.
    window.location.assign("/");
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null);
    const addr = email.trim().toLowerCase();

    if (mode === "signup") {
      if (password !== confirm) { setError("Passwords don't match."); return; }
      setBusy(true);
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr, password, displayName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || "Something went wrong."); setBusy(false); return; }
      await signIn(addr, password);
      setBusy(false);
      return;
    }

    setBusy(true);
    await signIn(addr, password);
    setBusy(false);
  };

  // Fallback for someone who has no password yet (e.g. they used to sign in
  // by emailed link) or forgot it. Only works for existing accounts.
  const emailLink = async () => {
    setError(null); setInfo(null);
    const addr = email.trim().toLowerCase();
    if (!addr) { setError("Type your email above first."); return; }
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setInfo("If that email has an account, a sign-in link is on its way. Once you're in, set a new password on the Profile page.");
  };

  return (
    <div className="cc-body" style={{ maxWidth: 400, paddingTop: 80 }}>
      <h1 className="cc-title">The Cover Club</h1>
      <p className="cc-sub">
        {mode === "signin"
          ? "Sign in with your email and password."
          : "Create your account. The commissioner needs to have added your email first."}
      </p>
      <form onSubmit={submit}>
        <div className="cc-field">
          <label>Email</label>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        {mode === "signup" && (
          <div className="cc-field">
            <label>Display name (shown to the league)</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Optional" />
          </div>
        )}
        <div className="cc-field">
          <label>Password</label>
          <input type="password" required minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {mode === "signup" && (
          <div className="cc-field">
            <label>Confirm password</label>
            <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <div className="cc-hiddennote" style={{ marginTop: 6 }}>At least 8 characters.</div>
          </div>
        )}
        {error && <div className="cc-warning">{error}</div>}
        {info && <div className="cc-savedbanner" style={{ marginBottom: 12 }}>{info}</div>}
        <button className="cc-savebtn" type="submit" disabled={busy}>
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="cc-hiddennote" style={{ marginTop: 20 }}>
        {mode === "signin" ? (
          <>
            New here? <button type="button" className="cc-namelink" onClick={() => switchMode("signup")}>Create an account</button>
            <br />
            <button type="button" className="cc-namelink" onClick={emailLink}>Forgot password? Email me a sign-in link</button>
          </>
        ) : (
          <>Already have an account? <button type="button" className="cc-namelink" onClick={() => switchMode("signin")}>Sign in</button></>
        )}
      </p>
    </div>
  );
}

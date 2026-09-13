import { supabaseBrowser } from "./supabaseClient";

// Wraps fetch for actions that need a signed-in session. If the very
// first attempt comes back unauthorized (a stale/expiring session token,
// which can happen mid-session especially during a long burst of edits),
// this forces a fresh session refresh and retries once automatically --
// instead of surfacing a confusing "not logged in" error for something
// that isn't really a logged-out state at all.
export async function authedFetch(url, options = {}) {
  let res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    const supabase = supabaseBrowser();
    await supabase.auth.refreshSession();
    res = await fetch(url, options);
  }
  return res;
}
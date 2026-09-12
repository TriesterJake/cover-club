// Wraps a fetch with one automatic retry on failure. Used for the
// pages' initial data load, since an occasional transient hiccup
// (a brief auth-check blip) was previously being misread as "there's
// genuinely no data" instead of "try again" -- this is what caused
// pages to sometimes flash an incorrect empty state until refreshed.
export async function fetchJsonWithRetry(url, options, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return await res.json();
      lastError = new Error(`Request failed (${res.status})`);
    } catch (e) {
      lastError = e;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 700));
  }
  throw lastError;
}
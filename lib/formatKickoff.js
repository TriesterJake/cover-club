// Includes the day of the week AND the viewer's own timezone abbreviation
// (e.g. "PDT", "EST") -- toLocaleString with no explicit timeZone already
// uses whatever zone the viewer's own device is set to, so this
// automatically shows correctly for everyone regardless of where they
// live, with the zone spelled out so nobody has to guess.
export function formatKickoff(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
    timeZoneName: "short",
  });
}
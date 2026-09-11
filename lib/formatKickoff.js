// Includes the day of the week, since a bare date/time is hard to place
// at a glance ("is that Sunday or Monday's game?").
export function formatKickoff(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
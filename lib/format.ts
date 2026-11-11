export function formatDate(iso: string): string {
  const date = new Date(iso + "T12:00:00");
  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date).replace(",", "");
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms).replace(",", "");
}

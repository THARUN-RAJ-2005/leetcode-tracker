/**
 * DateUtils — Single Responsibility: all date arithmetic in one place.
 */
export function getWeekBounds(today: Date): { start: string; end: string } {
  const d = new Date(today);
  const day = d.getUTCDay(); // 0=Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return {
    start: d.toISOString().split("T")[0],
    end: today.toISOString().split("T")[0],
  };
}

export function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Generate all YYYY-MM-DD strings from startDate to endDate inclusive */
export function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (cur <= end) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

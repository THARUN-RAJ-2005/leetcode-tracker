import { dbQuery } from "../db";

export interface LeaderboardEntry  { username: string; solve_count: number; }
export interface WeeklyEntry       { username: string; total_solves: number; }
export interface DailyBreakdownRow { username: string; date: string; solve_count: number; }

export class SolveRepository {
  async upsert(username: string, date: string, count: number, backfilled = false): Promise<void> {
    await dbQuery(
      `INSERT INTO daily_solves (username, date, solve_count, backfilled, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (username,date)
       DO UPDATE SET solve_count=EXCLUDED.solve_count, backfilled=EXCLUDED.backfilled, updated_at=NOW();`,
      [username, date, count, backfilled]
    );
  }

  async getExistingDates(username: string, dates: string[]): Promise<Set<string>> {
    if (!dates.length) return new Set();
    const res = await dbQuery(
      `SELECT date::text FROM daily_solves WHERE username=$1 AND date=ANY($2::date[]);`,
      [username, dates]
    );
    return new Set(res.rows.map((r) => r.date));
  }

  // ── Full boards — no LIMIT, all members ────────────────────────────────
  async getAllTodayBoard(date: string): Promise<LeaderboardEntry[]> {
    const res = await dbQuery(
      `SELECT username, solve_count FROM daily_solves WHERE date=$1 ORDER BY solve_count DESC;`,
      [date]
    );
    return res.rows;
  }

  async getAllWeeklyBoard(start: string, end: string): Promise<WeeklyEntry[]> {
    const res = await dbQuery(
      `SELECT username, COALESCE(SUM(solve_count),0)::int AS total_solves
       FROM daily_solves WHERE date>=$1 AND date<=$2
       GROUP BY username ORDER BY total_solves DESC;`,
      [start, end]
    );
    return res.rows;
  }

  // ── Legacy paginated (kept for /api/leaderboard pagination) ────────────
  async getTodayBoard(date: string): Promise<LeaderboardEntry[]> {
    return this.getAllTodayBoard(date);
  }

  async getWeeklyBoard(start: string, end: string): Promise<WeeklyEntry[]> {
    return this.getAllWeeklyBoard(start, end);
  }

  async getTodayBoardPaged(date: string, page: number, pageSize = 20) {
    const offset = page * pageSize;
    const [data, cnt] = await Promise.all([
      dbQuery(
        `SELECT username, solve_count FROM daily_solves WHERE date=$1 ORDER BY solve_count DESC LIMIT $2 OFFSET $3;`,
        [date, pageSize, offset]
      ),
      dbQuery(`SELECT COUNT(*)::int AS total FROM daily_solves WHERE date=$1;`, [date]),
    ]);
    const total = cnt.rows[0]?.total ?? 0;
    return { rows: data.rows as LeaderboardEntry[], page, hasMore: offset + pageSize < total, total };
  }

  async getWeeklyBoardPaged(start: string, end: string, page: number, pageSize = 20) {
    const offset = page * pageSize;
    const [data, cnt] = await Promise.all([
      dbQuery(
        `SELECT username, COALESCE(SUM(solve_count),0)::int AS total_solves
         FROM daily_solves WHERE date>=$1 AND date<=$2
         GROUP BY username ORDER BY total_solves DESC LIMIT $3 OFFSET $4;`,
        [start, end, pageSize, offset]
      ),
      dbQuery(
        `SELECT COUNT(DISTINCT username)::int AS total FROM daily_solves WHERE date>=$1 AND date<=$2;`,
        [start, end]
      ),
    ]);
    const total = cnt.rows[0]?.total ?? 0;
    return { rows: data.rows as WeeklyEntry[], page, hasMore: offset + pageSize < total, total };
  }

  // ── History — ALL records in one shot (no pagination) ──────────────────
  async getAllHistory(start: string, end: string): Promise<DailyBreakdownRow[]> {
    const res = await dbQuery(
      `SELECT username, date::text, solve_count FROM daily_solves
       WHERE date>=$1 AND date<=$2 ORDER BY solve_count DESC, date DESC;`,
      [start, end]
    );
    return res.rows;
  }

  // ── Full export (same as getAllHistory, used for CSV/PDF) ───────────────
  async getAllForExport(start: string, end: string): Promise<DailyBreakdownRow[]> {
    return this.getAllHistory(start, end);
  }
}

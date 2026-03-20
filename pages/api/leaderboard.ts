import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "../../lib/session";
import { setupDb } from "../../lib/db";
import { SolveRepository } from "../../lib/services/SolveRepository";
import { MEMBERS } from "@/students_list";
import { getWeekBounds, toDateStr } from "../../lib/services/DateUtils";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    await setupDb();
    const type = (req.query.type as string) || "today";
    const page = Math.max(0, parseInt((req.query.page as string) ?? "0", 10));
    const now  = new Date();
    const todayStr = toDateStr(now);
    const { start: weekStart, end: weekEnd } = getWeekBounds(now);
    const repo = new SolveRepository();
    const pageSize = 20;

    if (type === "today") {
      const allFromDb = await repo.getAllTodayBoard(todayStr);
      const dbMap = new Map(allFromDb.map((r) => [r.username, r.solve_count]));
      // Build full sorted list from authoritative MEMBERS (no duplicates)
      const full = MEMBERS
        .map((u) => ({ username: u, solve_count: dbMap.get(u) ?? 0 }))
        .sort((a, b) =>
          b.solve_count - a.solve_count ||
          a.username.toLowerCase().localeCompare(b.username.toLowerCase())
        );
      const start = page * pageSize;
      const rows = full.slice(start, start + pageSize);
      return res.status(200).json({ rows, page, hasMore: start + pageSize < full.length, total: full.length, todayStr });
    }

    if (type === "week") {
      const allFromDb = await repo.getAllWeeklyBoard(weekStart, weekEnd);
      const dbMap = new Map(allFromDb.map((r) => [r.username, r.total_solves]));
      const full = MEMBERS
        .map((u) => ({ username: u, total_solves: dbMap.get(u) ?? 0 }))
        .sort((a, b) =>
          b.total_solves - a.total_solves ||
          a.username.toLowerCase().localeCompare(b.username.toLowerCase())
        );
      const start = page * pageSize;
      const rows = full.slice(start, start + pageSize);
      return res.status(200).json({ rows, page, hasMore: start + pageSize < full.length, total: full.length, weekStart, weekEnd });
    }

    return res.status(400).json({ error: "type must be today or week" });
  } catch (err) {
    console.error("[leaderboard]", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}

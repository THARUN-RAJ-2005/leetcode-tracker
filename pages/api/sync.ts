/**
 * GET /api/sync
 * Returns ONLY what's already in the database — instant response, no LeetCode fetch.
 * The actual syncing happens via /api/sync/stream (SSE).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "../../lib/session";
import { setupDb } from "../../lib/db";
import { SolveRepository } from "../../lib/services/SolveRepository";
import { LeaderboardService } from "../../lib/services/LeaderboardService";
import { getWeekBounds, toDateStr } from "../../lib/services/DateUtils";
import { MEMBERS } from "@/students_list";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    await setupDb();
    const now      = new Date();
    const todayStr = toDateStr(now);
    const { start: weekStart, end: weekEnd } = getWeekBounds(now);

    const repo     = new SolveRepository();
    const boardSvc = new LeaderboardService(repo);

    // Read from DB only — instant
    const { todayBoard, weeklyBoard } = await boardSvc.getAll(todayStr, weekStart, weekEnd);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      todayStr, weekStart, weekEnd,
      members: MEMBERS,
      todayLeaderboard: todayBoard,
      weeklyLeaderboard: weeklyBoard,
      nextRefreshMs: 20 * 60 * 1000,
    });
  } catch (err) {
    console.error("[sync]", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}

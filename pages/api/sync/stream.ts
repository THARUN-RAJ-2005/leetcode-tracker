/**
 * GET /api/sync/stream
 * Server-Sent Events endpoint.
 *
 * Flow:
 *   1. Client opens EventSource on page load (after initial DB read from /api/sync).
 *   2. This endpoint fetches LeetCode in parallel batches of 20 (like Java thread pool).
 *   3. After each batch completes, it emits an SSE event with the updated leaderboard.
 *   4. Frontend receives events and animates the leaderboard dynamically — no reload needed.
 *
 * SSE event types:
 *   "batch"    → { batchIndex, totalBatches, results, todayLeaderboard, weeklyLeaderboard }
 *   "complete" → { message: "done" }
 *   "error"    → { error: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "../../../lib/session";
import { setupDb } from "../../../lib/db";
import { SolveRepository } from "../../../lib/services/SolveRepository";
import { LeetCodeClient } from "../../../lib/services/LeetCodeClient";
import { SyncService } from "../../../lib/services/SyncService";
import { LeaderboardService } from "../../../lib/services/LeaderboardService";
import { getWeekBounds, toDateStr } from "../../../lib/services/DateUtils";
import { MEMBERS } from "@/students_list";

// Vercel: max duration for streaming (Pro = 300s, Hobby = 60s)
export const config = { api: { responseLimit: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Auth
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.user) {
    res.status(401).end();
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  function send(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // @ts-ignore — flush is available in Node http
    if (typeof (res as any).flush === "function") (res as any).flush();
  }

  try {
    await setupDb();
    const now      = new Date();
    const todayStr = toDateStr(now);
    const { start: weekStart, end: weekEnd } = getWeekBounds(now);

    const repo     = new SolveRepository();
    const leetcode = new LeetCodeClient();
    const syncSvc  = new SyncService(leetcode, repo);
    const boardSvc = new LeaderboardService(repo);

    // Stream batches — each batch runs BATCH_SIZE fetches in parallel
    for await (const { batchIndex, totalBatches, results } of syncSvc.streamSync(todayStr)) {
      // After each batch is saved to DB, re-read the full updated leaderboard
      const { todayBoard, weeklyBoard } = await boardSvc.getAll(todayStr, weekStart, weekEnd);

      send("batch", {
        batchIndex,
        totalBatches,
        batchResults: results,
        todayLeaderboard: todayBoard,
        weeklyLeaderboard: weeklyBoard,
        todayStr,
        weekStart,
        weekEnd,
        members: MEMBERS,
      });
    }

    send("complete", { message: "All members synced", todayStr });
  } catch (err) {
    console.error("[stream]", err);
    send("error", { error: err instanceof Error ? err.message : "Stream error" });
  } finally {
    res.end();
  }
}

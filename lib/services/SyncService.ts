/**
 * SyncService — Parallel batch syncing with SSE streaming support.
 *
 * Architecture (replaces Java threads with Promise.all parallel batches):
 *   - syncBatch()  → fetches BATCH_SIZE members in true parallel via Promise.all
 *   - syncAll()    → legacy sequential (kept for compatibility)
 *   - streamSync() → generator that yields results as each batch completes,
 *                    enabling SSE streaming to the frontend
 */
import { ILeetCodeClient } from "./LeetCodeClient";
import { SolveRepository } from "./SolveRepository";
import { MEMBERS } from "@/students_list";

export const BATCH_SIZE = 20;

export interface SyncResult {
  username: string;
  todayCount: number;
  backfilledDates: string[];
  status: "ok" | "error";
  error?: string;
}

export class SyncService {
  constructor(
    private readonly leetcode: ILeetCodeClient,
    private readonly repo: SolveRepository
  ) {}

  /** Sync a single member — fetch + upsert */
  async syncMember(username: string, todayStr: string): Promise<SyncResult> {
    try {
      const byDay = await this.leetcode.fetchSubmissionsByDay(username);
      const todayCount = byDay[todayStr] ?? 0;
      const backfilledDates: string[] = [];

      await this.repo.upsert(username, todayStr, todayCount, false);

      const otherDates = Object.keys(byDay).filter((d) => d !== todayStr);
      if (otherDates.length > 0) {
        const existing = await this.repo.getExistingDates(username, otherDates);
        await Promise.all(
          otherDates
            .filter((date) => !existing.has(date))
            .map(async (date) => {
              await this.repo.upsert(username, date, byDay[date], true);
              backfilledDates.push(date);
            })
        );
      }

      return { username, todayCount, backfilledDates, status: "ok" };
    } catch (e) {
      return {
        username, todayCount: 0, backfilledDates: [],
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Sync a batch of members in TRUE PARALLEL (equivalent to Java thread pool).
   * Promise.all fires all BATCH_SIZE fetches simultaneously.
   */
  async syncBatch(usernames: string[], todayStr: string): Promise<SyncResult[]> {
    return Promise.all(usernames.map((u) => this.syncMember(u, todayStr)));
  }

  /**
   * Async generator that yields one batch of results at a time.
   * Used by the SSE endpoint to stream updates to the frontend.
   *
   * Batch 0 → members 0–19  (synced first, user sees leaderboard immediately)
   * Batch 1 → members 20–39 (runs in background, updates live)
   * ...etc
   */
  async *streamSync(todayStr: string): AsyncGenerator<{
    batchIndex: number;
    totalBatches: number;
    results: SyncResult[];
  }> {
    const totalBatches = Math.ceil(MEMBERS.length / BATCH_SIZE);
    for (let i = 0; i < MEMBERS.length; i += BATCH_SIZE) {
      const batch = MEMBERS.slice(i, i + BATCH_SIZE);
      const results = await this.syncBatch(batch, todayStr);
      yield {
        batchIndex: Math.floor(i / BATCH_SIZE),
        totalBatches,
        results,
      };
    }
  }
}

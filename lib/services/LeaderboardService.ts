import { SolveRepository, LeaderboardEntry, WeeklyEntry } from "./SolveRepository";
import { MEMBERS } from "@/students_list";

export interface FullLeaderboard {
  todayBoard: LeaderboardEntry[];
  weeklyBoard: WeeklyEntry[];
}

export class LeaderboardService {
  constructor(private readonly repo: SolveRepository) {}

  async getAll(todayStr: string, weekStart: string, weekEnd: string): Promise<FullLeaderboard> {
    const [tr, wr] = await Promise.all([
      this.repo.getAllTodayBoard(todayStr),
      this.repo.getAllWeeklyBoard(weekStart, weekEnd),
    ]);

    const tm = new Map(tr.map((r) => [r.username, r.solve_count]));
    const wm = new Map(wr.map((r) => [r.username, r.total_solves]));

    // Deduplicate by building from MEMBERS (authoritative list), fill 0 for missing.
    // Tie-break: username ascending (case-insensitive).
    const todayBoard: LeaderboardEntry[] = MEMBERS
      .map((u) => ({ username: u, solve_count: tm.get(u) ?? 0 }))
      .sort((a, b) =>
        b.solve_count - a.solve_count ||
        a.username.toLowerCase().localeCompare(b.username.toLowerCase())
      );

    const weeklyBoard: WeeklyEntry[] = MEMBERS
      .map((u) => ({ username: u, total_solves: wm.get(u) ?? 0 }))
      .sort((a, b) =>
        b.total_solves - a.total_solves ||
        a.username.toLowerCase().localeCompare(b.username.toLowerCase())
      );

    return { todayBoard, weeklyBoard };
  }
}

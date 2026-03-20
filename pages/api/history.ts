/**
 * GET /api/history — returns ALL history records in one request (no pagination).
 * GET /api/history?export=csv  — CSV download
 * GET /api/history?export=pdf  — JSON for client PDF generation
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "../../lib/session";
import { setupDb } from "../../lib/db";
import { SolveRepository } from "../../lib/services/SolveRepository";
import { getWeekBounds, toDateStr } from "../../lib/services/DateUtils";
import { MEMBER_DISPLAY } from "@/students_list";

function dn(u: string): string { return (MEMBER_DISPLAY as Record<string,string>)[u] || u; }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    await setupDb();
    const now  = new Date();
    const { start: weekStart } = getWeekBounds(now);
    const startDate = (req.query.start as string) || weekStart;
    const endDate   = (req.query.end   as string) || toDateStr(now);
    const search    = ((req.query.search as string) ?? "").toLowerCase().trim();
    const repo = new SolveRepository();

    // CSV export
    if (req.query.export === "csv") {
      let rows = await repo.getAllForExport(startDate, endDate);
      if (search) rows = rows.filter((r) => r.username.toLowerCase().includes(search) || dn(r.username).toLowerCase().includes(search));
      const lines = ["S.No,Name,LeetCode Username,Date,Problems Solved"];
      rows.forEach((r, i) => lines.push(`${i+1},"${dn(r.username)}","${r.username}","${r.date}",${r.solve_count}`));
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="lc-history-${startDate}-${endDate}.csv"`);
      return res.status(200).send(lines.join("\n"));
    }

    // PDF data export
    if (req.query.export === "pdf") {
      let rows = await repo.getAllForExport(startDate, endDate);
      if (search) rows = rows.filter((r) => r.username.toLowerCase().includes(search) || dn(r.username).toLowerCase().includes(search));
      return res.status(200).json({ rows, startDate, endDate });
    }

    // All records — no pagination
    let rows = await repo.getAllHistory(startDate, endDate);
    if (search) rows = rows.filter((r) => r.username.toLowerCase().includes(search) || dn(r.username).toLowerCase().includes(search));
    return res.status(200).json({ rows, total: rows.length, startDate, endDate });

  } catch (err) {
    console.error("[history]", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}

import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "../../../lib/session";
import { setupDb } from "../../../lib/db";
import { AuthRepository } from "../../../lib/services/AuthRepository";
import { AuthService } from "../../../lib/services/AuthService";

async function guard(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  const s = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!s.user?.isAdmin) { res.status(403).json({ error: "Admin access required" }); return false; }
  return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await guard(req, res))) return;
  await setupDb();
  const svc = new AuthService(new AuthRepository());

  if (req.method === "GET") return res.status(200).json({ emails: await svc.getUsers() });

  if (req.method === "POST") {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.includes("@")) return res.status(400).json({ error: "Valid email required." });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be ≥ 6 characters." });
    await svc.addUser(email.trim(), password);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "PUT") {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email) return res.status(400).json({ error: "Email required." });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be ≥ 6 characters." });
    await svc.setPassword(email.trim(), password);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body as { id?: number };
    if (!id) return res.status(400).json({ error: "ID required." });
    await svc.removeUser(id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

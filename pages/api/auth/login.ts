/**
 * POST /api/auth/login
 * Microservice: Authentication
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "../../../lib/session";
import { setupDb } from "../../../lib/db";
import { AuthRepository } from "../../../lib/services/AuthRepository";
import { AuthService } from "../../../lib/services/AuthService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: "Email and password required." });

  try {
    await setupDb();

    const authSvc = new AuthService(new AuthRepository());
    await authSvc.ensureAdminExists();

    const result = await authSvc.login(email, password);
    if (!result.ok) return res.status(result.isAdmin === false && result.error?.includes("credentials") ? 401 : 403).json({ error: result.error });

    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    session.user = { email: email.toLowerCase().trim(), isAdmin: result.isAdmin };
    await session.save();

    return res.status(200).json({ ok: true, isAdmin: result.isAdmin });
  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

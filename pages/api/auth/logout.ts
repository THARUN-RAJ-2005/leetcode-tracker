import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "../../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  session.destroy();
  return res.status(200).json({ ok: true });
}

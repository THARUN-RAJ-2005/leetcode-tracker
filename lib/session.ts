import type { SessionOptions } from "iron-session";

export interface SessionData {
  user?: {
    email: string;
    isAdmin: boolean;
  };
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "complex-password-at-least-32-characters-long!!",
  cookieName: "lc_tracker_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
  },
};

declare module "iron-session" {
  interface IronSessionData extends SessionData {}
}

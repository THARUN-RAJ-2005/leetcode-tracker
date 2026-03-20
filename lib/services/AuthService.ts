import bcrypt from "bcryptjs";
import { AuthRepository } from "./AuthRepository";

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL as string;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD as string;

export interface LoginResult { ok: boolean; isAdmin: boolean; error?: string; }

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  async ensureAdminExists(): Promise<void> {
    const existing = await this.repo.findByEmail(ADMIN_EMAIL);
    if (!existing) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await this.repo.createAdmin(ADMIN_EMAIL, hash);
    }
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.repo.findByEmail(email.toLowerCase().trim());
    if (!user) return { ok: false, isAdmin: false, error: "Access denied. Your email is not authorised." };
    if (!user.password_hash) return { ok: false, isAdmin: false, error: "No password set. Contact admin." };
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return { ok: false, isAdmin: false, error: "Invalid credentials." };
    return { ok: true, isAdmin: user.is_admin };
  }

  async addUser(email: string, password: string): Promise<void> {
    const hash = await bcrypt.hash(password, 12);
    await this.repo.addUser(email, hash);
  }

  async setPassword(email: string, password: string): Promise<void> {
    const hash = await bcrypt.hash(password, 12);
    await this.repo.updatePassword(email, hash);
  }

  async removeUser(id: number): Promise<void> { await this.repo.removeUser(id); }

  async getUsers() { return this.repo.getAllUsers(); }
}

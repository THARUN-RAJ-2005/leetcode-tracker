import { dbQuery } from "../db";

export interface AuthUser {
  id: number; email: string; password_hash: string | null;
  is_admin: boolean; created_at: string;
}

export class AuthRepository {
  async findByEmail(email: string): Promise<AuthUser | null> {
    const res = await dbQuery(
      `SELECT id, email, password_hash, is_admin, created_at FROM auth_users WHERE email = $1 LIMIT 1;`,
      [email.toLowerCase()]
    );
    return res.rows[0] ?? null;
  }

  async createAdmin(email: string, passwordHash: string): Promise<void> {
    await dbQuery(
      `INSERT INTO auth_users (email, password_hash, is_admin) VALUES ($1, $2, TRUE) ON CONFLICT (email) DO NOTHING;`,
      [email.toLowerCase(), passwordHash]
    );
  }

  async addUser(email: string, passwordHash: string): Promise<void> {
    await dbQuery(
      `INSERT INTO auth_users (email, password_hash, is_admin)
       VALUES ($1, $2, FALSE)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;`,
      [email.toLowerCase(), passwordHash]
    );
  }

  async updatePassword(email: string, passwordHash: string): Promise<void> {
    await dbQuery(
      `UPDATE auth_users SET password_hash = $2 WHERE email = $1;`,
      [email.toLowerCase(), passwordHash]
    );
  }

  async removeUser(id: number): Promise<void> {
    await dbQuery(`DELETE FROM auth_users WHERE id = $1 AND is_admin = FALSE;`, [id]);
  }

  async getAllUsers(): Promise<Pick<AuthUser, "id" | "email" | "created_at">[]> {
    const res = await dbQuery(
      `SELECT id, email, created_at FROM auth_users WHERE is_admin = FALSE ORDER BY created_at DESC;`
    );
    return res.rows;
  }
}

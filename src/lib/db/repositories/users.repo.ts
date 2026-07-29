// Users repository. Global (not store-scoped).
import { getDB } from '../sqlite';
import { nowISO, type User } from '../../types';
import { newId } from '../../ids';
import bcrypt from 'bcryptjs';

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  isRoot?: boolean;
}

export const usersRepo = {
  list(): User[] {
    return getDB()
      .prepare<[], User>(
        'SELECT * FROM users WHERE deletedAt IS NULL ORDER BY createdAt DESC',
      )
      .all();
  },

  byEmail(email: string): User | undefined {
    return getDB()
      .prepare<[string], User>(
        'SELECT * FROM users WHERE email = ? AND deletedAt IS NULL',
      )
      .get(email.toLowerCase().trim());
  },

  byId(id: string): User | undefined {
    return getDB()
      .prepare<[string], User>(
        'SELECT * FROM users WHERE id = ? AND deletedAt IS NULL',
      )
      .get(id);
  },

  async create(input: CreateUserInput): Promise<User> {
    const id = newId();
    const now = nowISO();
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user: User = {
      id,
      email: input.email.toLowerCase().trim(),
      name: input.name,
      passwordHash,
      isRoot: input.isRoot ? 1 : 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const d = getDB();
    d.transaction(() => {
      d.prepare(
        `INSERT INTO users(id,email,name,passwordHash,isRoot,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,?)`,
      ).run(
        user.id,
        user.email,
        user.name,
        user.passwordHash,
        user.isRoot,
        user.createdAt,
        user.updatedAt,
      );
      d.prepare(
        `INSERT INTO outbox(op,collection,docId,payloadJson,createdAt) VALUES('upsert','User',?,?,?)`,
      ).run(user.id, JSON.stringify(user), user.createdAt);
    })();
    return user;
  },

  async setPassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    getDB()
      .prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?')
      .run(passwordHash, nowISO(), id);
    // Outbox updated payload
    const u = this.byId(id);
    if (u) {
      getDB()
        .prepare(
          `INSERT INTO outbox(op,collection,docId,payloadJson,createdAt) VALUES('upsert','User',?,?,?)`,
        )
        .run(id, JSON.stringify({ ...u, passwordHash }), nowISO());
    }
  },

  /** Upsert an existing user record by id (used for membership joins and profile updates). */
  updateBasics(id: string, patch: Partial<Pick<User, 'name' | 'email'>>): void {
    const cur = this.byId(id);
    if (!cur) return;
    const next: User = { ...cur, ...patch, updatedAt: nowISO() };
    getDB()
      .prepare('UPDATE users SET name = ?, email = ?, updatedAt = ? WHERE id = ?')
      .run(next.name, next.email, next.updatedAt, id);
    getDB()
      .prepare(
        `INSERT INTO outbox(op,collection,docId,payloadJson,createdAt) VALUES('upsert','User',?,?,?)`,
      )
      .run(id, JSON.stringify(next), nowISO());
  },
};

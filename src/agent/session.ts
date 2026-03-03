/**
 * Session storage — persists chat history to disk.
 *
 * Layout on disk:
 *   <sessionsDir>/
 *     <id>.json   — one file per session
 *
 * Each file is a SessionRecord:
 *   { id, title, createdAt, updatedAt, messages: ChatMessage[] }
 *
 * Messages stored here are the TUI-level ChatMessage (role/content/timestamp),
 * NOT the raw pi-ai Context messages (which include binary image data).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoredMessage {
  role:      'user' | 'assistant';
  content:   string;
  timestamp: string; // ISO string — Date is not JSON-serialisable
}

export interface SessionRecord {
  id:        string;
  title:     string;
  createdAt: string;
  updatedAt: string;
  messages:  StoredMessage[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function titleFromMessages(messages: StoredMessage[]): string {
  const first = messages.find(m => m.role === 'user');
  if (!first) return 'New session';
  return first.content.slice(0, 48) + (first.content.length > 48 ? '…' : '');
}

// ── SessionStore ──────────────────────────────────────────────────────────────

export class SessionStore {
  private dir: string;

  constructor(sessionsDir: string) {
    this.dir = sessionsDir;
    mkdirSync(this.dir, { recursive: true });
  }

  /** List all sessions that have at least one message, newest first. */
  list(): SessionRecord[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return JSON.parse(readFileSync(join(this.dir, f), 'utf-8')) as SessionRecord; }
        catch { return null; }
      })
      .filter((s): s is SessionRecord => s !== null && s.messages.length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Load a single session by id. Returns null if not found. */
  load(id: string): SessionRecord | null {
    const path = join(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf-8')) as SessionRecord; }
    catch { return null; }
  }

  /** Save (create or update) a session. Auto-derives title from first user message. */
  save(id: string, messages: StoredMessage[]): SessionRecord {
    const existing = this.load(id);
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id,
      title:     titleFromMessages(messages) || existing?.title || 'New session',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      messages,
    };
    writeFileSync(join(this.dir, `${id}.json`), JSON.stringify(record, null, 2), 'utf-8');
    return record;
  }

  /** Return a new session id without writing anything to disk yet. */
  create(): string {
    return newId();
  }

  /** Delete a session. */
  delete(id: string): void {
    const path = join(this.dir, `${id}.json`);
    if (existsSync(path)) unlinkSync(path);
  }
}

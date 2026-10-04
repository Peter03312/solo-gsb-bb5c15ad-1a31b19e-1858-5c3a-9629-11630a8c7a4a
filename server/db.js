// SQLite 连接、建表与首次初始化。
import Database from 'better-sqlite3';
import { DB_PATH, ensureDataDir, SEED_DEMO } from './config.js';
import { seedDemo } from './seed.js';

ensureDataDir();

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  name            TEXT NOT NULL,
  start_point     TEXT NOT NULL,
  finish_point    TEXT NOT NULL,
  finish_deadline INTEGER NOT NULL CHECK (finish_deadline >= 0),
  revision        INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checkpoint_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  seq        INTEGER NOT NULL,
  name       TEXT NOT NULL,
  point_code TEXT NOT NULL,
  UNIQUE (seq, point_code)
);

CREATE TABLE IF NOT EXISTS readings (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  record_no            INTEGER NOT NULL UNIQUE,
  bib                  TEXT NOT NULL,
  point_code           TEXT NOT NULL,
  seconds              INTEGER NOT NULL CHECK (seconds >= 0),
  original_point_code  TEXT NOT NULL,
  original_seconds     INTEGER NOT NULL CHECK (original_seconds >= 0),
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','void','corrected')),
  corrected_point_code TEXT,
  corrected_seconds    INTEGER,
  reason               TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_readings_bib ON readings(bib);

CREATE TABLE IF NOT EXISTS publications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_revision  INTEGER NOT NULL,
  version_label   TEXT NOT NULL,
  snapshot_json   TEXT NOT NULL,
  published_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// 单赛事：永远只有 id = 1 一行。
const existing = db.prepare('SELECT COUNT(*) AS n FROM events').get();
if (existing.n === 0) {
  db.prepare(
    `INSERT INTO events (id, name, start_point, finish_point, finish_deadline, revision)
     VALUES (1, ?, ?, ?, ?, 1)`
  ).run('未命名赛事', 'START', 'FINISH', 0);
  if (SEED_DEMO) seedDemo(db);
}

// 在事务内把赛事修订号 +1（导入 / 改配置 / 裁判更正后调用）。
export const bumpRevision = db.transaction(() =>
  db.prepare(`UPDATE events SET revision = revision + 1, updated_at = datetime('now') WHERE id = 1`).run()
);

export function getEvent() {
  return db.prepare('SELECT * FROM events WHERE id = 1').get();
}

export function getGroups() {
  return db.prepare('SELECT seq, name, point_code FROM checkpoint_groups ORDER BY seq, id').all();
}

export function getLatestPublication() {
  return db.prepare('SELECT * FROM publications ORDER BY id DESC LIMIT 1').get();
}

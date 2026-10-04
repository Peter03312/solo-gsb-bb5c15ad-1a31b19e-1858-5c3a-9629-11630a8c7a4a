// 路由层共享工具：修订核对、入参校验、读数序列化。
import { db, getEvent, getGroups, bumpRevision, getLatestPublication } from './db.js';
import { computeResults } from './compute.js';

// 乐观并发：import / publish / setup 必须携带期望修订号，过期则 409 并返回当前修订。
export class StaleRevisionError extends Error {
  constructor(currentRevision) {
    super('赛事修订号已过期');
    this.status = 409;
    this.currentRevision = currentRevision;
  }
}

export function checkRevision(expectedRevision) {
  const event = getEvent();
  const expected = Number(expectedRevision);
  if (!Number.isInteger(expected)) {
    const err = new Error('expected_revision 必须为整数');
    err.status = 400;
    throw err;
  }
  if (expected !== event.revision) throw new StaleRevisionError(event.revision);
  return event;
}

export const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof StaleRevisionError) {
      return res.status(409).json({
        error: err.message,
        current_revision: err.currentRevision,
      });
    }
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

export const badRequest = (msg) => {
  const err = new Error(msg);
  err.status = 400;
  return err;
};

export const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

export function cleanCode(v, field) {
  if (!nonEmpty(v)) throw badRequest(`${field} 不能为空`);
  const s = v.trim();
  if (s.includes('|')) throw badRequest(`${field} 不能包含字符 "|"`);
  return s;
}

export function nonNegInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw badRequest(`${field} 必须为非负整数（收到 ${JSON.stringify(v)}）`);
  return n;
}

export const mapReading = (r) => ({
  record_no: r.record_no,
  bib: r.bib,
  point_code: r.point_code,
  seconds: r.seconds,
  original_point_code: r.original_point_code,
  original_seconds: r.original_seconds,
  status: r.status,
  corrected_point_code: r.corrected_point_code,
  corrected_seconds: r.corrected_seconds,
  reason: r.reason,
  created_at: r.created_at,
});

export function eventPayload() {
  const event = getEvent();
  const groups = getGroups();
  const pub = getLatestPublication();
  const counts = db
    .prepare(
      `SELECT
         COUNT(*)                                                              AS total,
         SUM(CASE WHEN status = 'void'      THEN 1 ELSE 0 END)                 AS voided,
         SUM(CASE WHEN status = 'corrected' THEN 1 ELSE 0 END)                 AS corrected
       FROM readings`
    )
    .get();
  return {
    event: {
      name: event.name,
      start_point: event.start_point,
      finish_point: event.finish_point,
      finish_deadline: event.finish_deadline,
      revision: event.revision,
      updated_at: event.updated_at,
    },
    groups,
    stats: {
      readings: counts.total,
      voided: counts.voided || 0,
      corrected: counts.corrected || 0,
    },
    latest_publication: pub
      ? {
          id: pub.id,
          event_revision: pub.event_revision,
          version_label: pub.version_label,
          published_at: pub.published_at,
        }
      : null,
  };
}

export function liveResults() {
  const event = getEvent();
  const groups = getGroups();
  const readings = db.prepare('SELECT * FROM readings ORDER BY record_no').all();
  const results = computeResults(event, groups, readings);
  return {
    revision: event.revision,
    event: {
      name: event.name,
      start_point: event.start_point,
      finish_point: event.finish_point,
      finish_deadline: event.finish_deadline,
    },
    groups,
    results,
    readings: readings.map(mapReading),
  };
}

export { db, bumpRevision };

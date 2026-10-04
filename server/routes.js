// 全部 HTTP 路由。
import express from 'express';
import { db, getEvent, getGroups, getLatestPublication, bumpRevision } from './db.js';
import {
  wrap,
  checkRevision,
  badRequest,
  nonEmpty,
  cleanCode,
  nonNegInt,
  mapReading,
  eventPayload,
  liveResults,
} from './helpers.js';
import { computeResults } from './compute.js';

export const router = express.Router();

/* ------------------------------- 赛事与关卡 ------------------------------- */

router.get('/event', wrap((req, res) => res.json(eventPayload())));

// 整体替换关卡组配置（seq 从 1 开始连续；同组内点位可替代）。
router.put(
  '/event/setup',
  wrap((req, res) => {
    const event = checkRevision(req.body?.expected_revision);
    const { name, start_point, finish_point, finish_deadline, groups } = req.body || {};

    if (!nonEmpty(name)) throw badRequest('赛事名称不能为空');
    const startPoint = cleanCode(start_point, '出发点位');
    const finishPoint = cleanCode(finish_point, '终点点位');
    if (startPoint === finishPoint) throw badRequest('出发点位与终点点位不能相同');
    const deadline = nonNegInt(finish_deadline, '终点截止秒数');

    if (!Array.isArray(groups) || groups.length === 0) throw badRequest('至少需要一个关卡组');
    const normalized = [];
    for (const g of groups) {
      const seq = Number(g?.seq);
      if (!Number.isInteger(seq) || seq < 1) throw badRequest('关卡组 seq 必须为从 1 开始的正整数');
      const gname = nonEmpty(g?.name) ? g.name.trim() : `第${seq}组`;
      if (!Array.isArray(g.points) || g.points.length === 0) {
        throw badRequest(`第 ${seq} 组至少需要一个点位`);
      }
      const points = g.points.map((p) => cleanCode(p, `第 ${seq} 组点位`));
      if (new Set(points).size !== points.length) throw badRequest(`第 ${seq} 组点位重复`);
      normalized.push({ seq, name: gname, points });
    }
    const seqs = [...new Set(normalized.map((g) => g.seq))].sort((a, b) => a - b);
    if (seqs[0] !== 1 || seqs[seqs.length - 1] !== seqs.length) {
      throw badRequest('关卡组序号必须从 1 开始且连续');
    }

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE events
         SET name = ?, start_point = ?, finish_point = ?, finish_deadline = ?,
             revision = revision + 1, updated_at = datetime('now')
         WHERE id = 1`
      ).run(name.trim(), startPoint, finishPoint, deadline);
      db.prepare('DELETE FROM checkpoint_groups').run();
      const ins = db.prepare('INSERT INTO checkpoint_groups (seq, name, point_code) VALUES (?, ?, ?)');
      for (const g of normalized) for (const p of g.points) ins.run(g.seq, g.name, p);
    });
    tx();

    res.json(eventPayload());
  })
);

/* --------------------------------- 打卡导入 -------------------------------- */

// 批量导入：同记录号异内容，或出现负秒数，整批拒绝（事务回滚）。
router.post(
  '/readings/import',
  wrap((req, res) => {
    checkRevision(req.body?.expected_revision);
    const readings = req.body?.readings;
    if (!Array.isArray(readings) || readings.length === 0) throw badRequest('readings 必须为非空数组');

    const insert = db.prepare(
      `INSERT INTO readings
         (record_no, bib, point_code, seconds, original_point_code, original_seconds)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const findExisting = db.prepare('SELECT * FROM readings WHERE record_no = ?');

    // 先在库外完整校验，任何问题都在写入前抛出 -> 整批拒绝。
    const seen = new Map();
    const toInsert = [];
    let duplicates = 0;
    const errors = [];

    readings.forEach((r, i) => {
      const where = `第 ${i + 1} 条`;
      const recordNo = Number(r?.record_no);
      if (!Number.isInteger(recordNo)) {
        errors.push(`${where}：记录号必须为整数`);
        return;
      }
      let bib, point, seconds;
      try {
        bib = cleanCode(r?.bib, `${where} 选手号`);
        point = cleanCode(r?.point_code, `${where} 点位`);
      } catch (e) {
        errors.push(e.message);
        return;
      }
      seconds = Number(r?.seconds);
      if (!Number.isInteger(seconds) || seconds < 0) {
        errors.push(`${where}（记录号 ${recordNo}）：秒数必须为非负整数，负秒数整批拒绝`);
        return;
      }
      if (seen.has(recordNo)) {
        const prev = seen.get(recordNo);
        if (prev.bib !== bib || prev.point !== point || prev.seconds !== seconds) {
          errors.push(`记录号 ${recordNo} 在批次内出现且内容不一致，整批拒绝`);
          return;
        }
        duplicates += 1; // 批次内完全重复：幂等忽略
      } else {
        seen.set(recordNo, { bib, point, seconds });
      }
      const existing = findExisting.get(recordNo);
      if (existing) {
        const same =
          existing.bib === bib &&
          existing.original_point_code === point &&
          existing.original_seconds === seconds;
        if (!same) {
          errors.push(
            `记录号 ${recordNo} 已存在但内容不同（库中：${existing.bib}/${existing.original_point_code}/${existing.original_seconds}秒），整批拒绝`
          );
          return;
        }
        duplicates += 1; // 与库中完全一致：幂等忽略
      } else {
        toInsert.push({ recordNo, bib, point, seconds });
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({ error: '整批导入被拒绝', rejected: true, details: errors.slice(0, 50) });
    }

    const inserted = db.transaction((rows) => {
      for (const r of rows) insert.run(r.recordNo, r.bib, r.point, r.seconds, r.point, r.seconds);
      if (rows.length > 0) bumpRevision();
      return rows.length;
    })(toInsert);

    res.status(201).json({ imported: inserted, duplicates, revision: getEvent().revision });
  })
);

/* --------------------------------- 裁判复核 -------------------------------- */

router.get('/readings', wrap((req, res) => {
  const rows = db.prepare('SELECT * FROM readings ORDER BY record_no').all();
  res.json({ readings: rows.map(mapReading), revision: getEvent().revision });
}));

// 更正打卡：可改点位/秒数；原值保留在 original_*；必须填写原因。
// 不传新值即恢复为原值（可用于取消作废）。
router.post(
  '/readings/:recordNo/correct',
  wrap((req, res) => {
    const recordNo = Number(req.params.recordNo);
    const row = db.prepare('SELECT * FROM readings WHERE record_no = ?').get(recordNo);
    if (!row) throw badRequest(`记录号 ${recordNo} 不存在`);
    const { reason, point_code, seconds } = req.body || {};
    if (!nonEmpty(reason)) throw badRequest('更正必须填写原因');

    let newPoint = row.original_point_code;
    let newSeconds = row.original_seconds;
    if (point_code !== undefined && point_code !== null && String(point_code).trim() !== '') {
      newPoint = cleanCode(point_code, '更正点位');
    }
    if (seconds !== undefined && seconds !== null && String(seconds).trim() !== '') {
      newSeconds = nonNegInt(seconds, '更正秒数');
    }

    db.transaction(() => {
      db.prepare(
        `UPDATE readings
         SET status = 'corrected', corrected_point_code = ?, corrected_seconds = ?, reason = ?
         WHERE record_no = ?`
      ).run(newPoint, newSeconds, reason.trim(), recordNo);
      bumpRevision();
    })();

    res.json({ reading: mapReading(db.prepare('SELECT * FROM readings WHERE record_no = ?').get(recordNo)), revision: getEvent().revision });
  })
);

// 作废打卡：排除出有效读数；原值与原因保留。
router.post(
  '/readings/:recordNo/void',
  wrap((req, res) => {
    const recordNo = Number(req.params.recordNo);
    const row = db.prepare('SELECT * FROM readings WHERE record_no = ?').get(recordNo);
    if (!row) throw badRequest(`记录号 ${recordNo} 不存在`);
    const { reason } = req.body || {};
    if (!nonEmpty(reason)) throw badRequest('作废必须填写原因');

    db.transaction(() => {
      db.prepare(`UPDATE readings SET status = 'void', reason = ? WHERE record_no = ?`).run(
        reason.trim(),
        recordNo
      );
      bumpRevision();
    })();

    res.json({ reading: mapReading(db.prepare('SELECT * FROM readings WHERE record_no = ?').get(recordNo)), revision: getEvent().revision });
  })
);

/* --------------------------------- 成绩查询 -------------------------------- */

router.get('/results/live', wrap((req, res) => res.json(liveResults())));

/* --------------------------------- 发布冻结 -------------------------------- */

// 发布即冻结：关卡、有效读数与成绩整体写入不可变快照；后续更正不改变历史版本。
router.post(
  '/publications',
  wrap((req, res) => {
    const event = checkRevision(req.body?.expected_revision);
    const live = liveResults();
    const maxRow = db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM publications').get();

    const tx = db.transaction(() => {
      const info = db.prepare(
        `INSERT INTO publications (event_revision, version_label, snapshot_json, published_at)
         VALUES (?, ?, ?, datetime('now'))`
      ).run(
        event.revision,
        req.body?.version_label ? String(req.body.version_label) : `v${maxRow.m + 1}`,
        JSON.stringify(live)
      );
      return info.lastInsertRowid;
    });
    const id = tx();
    const pub = db.prepare('SELECT * FROM publications WHERE id = ?').get(id);
    res.status(201).json({ id: pub.id, event_revision: pub.event_revision, version_label: pub.version_label, published_at: pub.published_at });
  })
);

router.get('/publications/latest', wrap((req, res) => {
  const pub = getLatestPublication();
  if (!pub) return res.status(404).json({ error: '尚未发布任何版本' });
  res.json({ id: pub.id, event_revision: pub.event_revision, version_label: pub.version_label, published_at: pub.published_at, snapshot: JSON.parse(pub.snapshot_json) });
}));

router.get('/publications', wrap((req, res) => {
  const rows = db.prepare('SELECT id, event_revision, version_label, published_at FROM publications ORDER BY id DESC').all();
  res.json({ publications: rows });
}));

router.get('/publications/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const pub = db.prepare('SELECT * FROM publications WHERE id = ?').get(id);
  if (!pub) return res.status(404).json({ error: `版本 ${id} 不存在` });
  res.json({ id: pub.id, event_revision: pub.event_revision, version_label: pub.version_label, published_at: pub.published_at, snapshot: JSON.parse(pub.snapshot_json) });
}));

router.get('/health', (req, res) => res.json({ ok: true, revision: getEvent().revision }));

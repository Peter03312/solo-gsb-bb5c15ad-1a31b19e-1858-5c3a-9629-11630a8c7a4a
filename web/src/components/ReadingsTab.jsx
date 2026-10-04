import React, { useMemo, useState } from 'react';
import { api } from '../api.js';

function statusTag(r) {
  if (r.status === 'void') return <span className="tag void">已作废</span>;
  if (r.status === 'corrected') return <span className="tag corrected">已更正</span>;
  return <span className="tag fin">有效</span>;
}

function CorrectModal({ reading, onClose, onSubmit }) {
  const [point, setPoint] = useState(reading.status === 'corrected' ? reading.corrected_point_code : reading.point_code);
  const [seconds, setSeconds] = useState(reading.status === 'corrected' ? reading.corrected_seconds : reading.seconds);
  const [reason, setReason] = useState('');

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>更正打卡（记录号 {reading.record_no}）</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          原值永久保留：{reading.bib} · {reading.original_point_code} · {reading.original_seconds} 秒。
          新值留空点位/秒数即恢复为原值。
        </div>
        <div className="row">
          <label className="field">
            更正后点位
            <input value={point} onChange={(e) => setPoint(e.target.value)} />
          </label>
          <label className="field">
            更正后秒数（非负整数）
            <input type="number" min="0" value={seconds} onChange={(e) => setSeconds(e.target.value)} />
          </label>
        </div>
        <label className="field">
          更正原因（必填）
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：31 号点打卡失败，裁判核实经过" />
        </label>
        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>取消</button>
          <button
            className="btn"
            onClick={() => onSubmit({ point_code: point, seconds, reason })}
            disabled={!reason.trim()}
          >
            确认更正并重算
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReadingsTab({ live, onChanged, onError, showToast }) {
  const [filter, setFilter] = useState('');
  const [bibFilter, setBibFilter] = useState('');
  const [editing, setEditing] = useState(null);

  const readings = useMemo(() => {
    if (!live) return [];
    const f = filter.trim();
    const b = bibFilter.trim();
    return live.readings.filter(
      (r) =>
        (!f || String(r.record_no).includes(f) || r.point_code.includes(f) || r.status === f)
        && (!b || r.bib.includes(b))
    );
  }, [live, filter, bibFilter]);

  const doVoid = async (r) => {
    const reason = prompt(`作废记录号 ${r.record_no}（${r.bib} @ ${r.point_code}）的原因（必填）：`);
    if (reason === null) return;
    if (!reason.trim()) return showToast('作废必须填写原因', true);
    try {
      await api.voidReading(r.record_no, { reason });
      showToast(`记录号 ${r.record_no} 已作废，成绩已重算`);
      onChanged();
    } catch (e) {
      onError(e);
    }
  };

  const doCorrect = async (payload) => {
    try {
      await api.correct(editing.record_no, payload);
      showToast(`记录号 ${editing.record_no} 已更正，成绩已重算`);
      setEditing(null);
      onChanged();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <div className="panel">
      <h2>打卡复核</h2>
      <div className="row-flex" style={{ marginBottom: 12 }}>
        <label className="field">
          选手号
          <input value={bibFilter} onChange={(e) => setBibFilter(e.target.value)} placeholder="如 101" />
        </label>
        <label className="field">
          记录号 / 点位 / 状态
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="如 1003 或 A1 或 void" />
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th>记录号</th><th>选手</th><th>有效点位</th><th>有效秒数</th>
            <th>原始值</th><th>状态</th><th>裁判原因</th><th style={{ width: 150 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r) => (
            <tr key={r.record_no} className={r.status === 'void' ? 'voided' : ''}>
              <td>{r.record_no}</td>
              <td>{r.bib}</td>
              <td>{r.status === 'corrected' ? r.corrected_point_code : r.point_code}</td>
              <td>{r.status === 'corrected' ? r.corrected_seconds : r.seconds}</td>
              <td className="muted">
                {r.original_point_code}@{r.original_seconds}s
              </td>
              <td>{statusTag(r)}</td>
              <td className="muted" style={{ maxWidth: 240 }}>{r.reason || '—'}</td>
              <td>
                <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => setEditing(r)}>
                  更正
                </button>
                {r.status !== 'void' ? (
                  <button className="btn danger" onClick={() => doVoid(r)}>作废</button>
                ) : (
                  <button className="btn secondary" onClick={() => setEditing(r)}>恢复</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {readings.length === 0 && <div className="muted" style={{ padding: 16 }}>没有匹配的打卡记录。</div>}
      {editing && <CorrectModal reading={editing} onClose={() => setEditing(null)} onSubmit={doCorrect} />}
    </div>
  );
}

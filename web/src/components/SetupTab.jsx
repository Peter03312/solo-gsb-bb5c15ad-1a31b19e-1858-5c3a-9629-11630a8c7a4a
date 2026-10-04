import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function SetupTab({ eventInfo, onChanged, onError, showToast }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!eventInfo) return;
    const bySeq = new Map();
    for (const g of eventInfo.groups) {
      if (!bySeq.has(g.seq)) bySeq.set(g.seq, { seq: g.seq, name: g.name, pointsText: '' });
      const item = bySeq.get(g.seq);
      item.pointsText = [...(item.pointsText ? item.pointsText.split(/[,\s]+/).filter(Boolean) : []), g.point_code].join(',');
    }
    setForm({
      name: eventInfo.event.name,
      start_point: eventInfo.event.start_point,
      finish_point: eventInfo.event.finish_point,
      finish_deadline: eventInfo.event.finish_deadline,
      groups: [...bySeq.values()].sort((a, b) => a.seq - b.seq),
    });
  }, [eventInfo]);

  if (!form) return <div className="muted">加载中…</div>;

  const setGroup = (seq, patch) =>
    setForm((f) => ({ ...f, groups: f.groups.map((g) => (g.seq === seq ? { ...g, ...patch } : g)) }));

  const addGroup = () =>
    setForm((f) => ({
      ...f,
      groups: [...f.groups, { seq: f.groups.length + 1, name: `第${f.groups.length + 1}组`, pointsText: '' }],
    }));

  const removeGroup = (seq) =>
    setForm((f) => ({
      ...f,
      groups: f.groups
        .filter((g) => g.seq !== seq)
        .map((g, i) => ({ ...g, seq: i + 1 })),
    }));

  const save = async () => {
    const payload = {
      expected_revision: eventInfo.event.revision,
      name: form.name,
      start_point: form.start_point,
      finish_point: form.finish_point,
      finish_deadline: form.finish_deadline,
      groups: form.groups.map((g) => ({
        seq: g.seq,
        name: g.name,
        points: g.pointsText.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
      })),
    };
    try {
      await api.setup(payload);
      showToast(`关卡设置已保存，修订号已更新`);
      onChanged();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <div className="panel">
      <h2>关卡设置</h2>
      <div className="muted" style={{ marginBottom: 12 }}>
        保存将整体替换当前配置并使修订号 +1；组按顺序通过，组内点位互为替代（填一个即可）。点位以逗号或空格分隔。
      </div>
      <div className="row-flex" style={{ marginBottom: 14 }}>
        <label className="field">赛事名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="field">出发点位<input value={form.start_point} onChange={(e) => setForm({ ...form, start_point: e.target.value })} /></label>
        <label className="field">终点点位<input value={form.finish_point} onChange={(e) => setForm({ ...form, finish_point: e.target.value })} /></label>
        <label className="field">终点截止秒数
          <input type="number" min="0" value={form.finish_deadline} onChange={(e) => setForm({ ...form, finish_deadline: e.target.value })} />
        </label>
      </div>

      <table>
        <thead>
          <tr><th style={{ width: 70 }}>组序</th><th style={{ width: 180 }}>组名</th><th>可替代点位</th><th style={{ width: 80 }}></th></tr>
        </thead>
        <tbody>
          {form.groups.map((g) => (
            <tr key={g.seq}>
              <td>第 {g.seq} 组</td>
              <td><input value={g.name} onChange={(e) => setGroup(g.seq, { name: e.target.value })} /></td>
              <td><input style={{ width: '100%' }} value={g.pointsText} onChange={(e) => setGroup(g.seq, { pointsText: e.target.value })} placeholder="如 A1, A2" /></td>
              <td><button className="btn danger" onClick={() => removeGroup(g.seq)}>删除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row-flex" style={{ marginTop: 14 }}>
        <button className="btn secondary" onClick={addGroup}>＋ 增加一组</button>
        <button className="btn" onClick={save}>核对修订号 {eventInfo.event.revision} 并保存</button>
      </div>
    </div>
  );
}

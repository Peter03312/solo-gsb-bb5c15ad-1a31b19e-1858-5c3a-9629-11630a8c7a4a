import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function PublishTab({ eventInfo, onChanged, onError, showToast }) {
  const [label, setLabel] = useState('');
  const [pubs, setPubs] = useState([]);

  const loadList = async () => {
    try {
      setPubs((await api.getPublications()).publications);
    } catch (e) {
      onError(e);
    }
  };
  useEffect(() => { loadList(); }, []);

  const publish = async () => {
    if (!confirm('发布后将冻结当前关卡、有效读数与成绩快照；后续裁判更正不会改变历史版本。确认发布？')) return;
    try {
      const r = await api.publish({
        expected_revision: eventInfo.event.revision,
        version_label: label.trim() || undefined,
      });
      showToast(`已发布冻结版本 ${r.version_label}（修订号 ${r.event_revision}）`);
      setLabel('');
      onChanged();
      loadList();
    } catch (e) {
      onError(e);
    }
  };

  const drift = eventInfo?.latest_publication
    ? eventInfo.event.revision - eventInfo.latest_publication.event_revision
    : null;

  return (
    <div>
      <div className="panel">
        <h2>发布成绩（冻结快照）</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          将以当前修订号 <b>{eventInfo?.event.revision}</b> 冻结：关卡组配置、全部有效读数（含作废/更正标记）、计算出的最早有效链与排名。
          {drift !== null && drift > 0 && (
            <> <span className="warn">注意：自上次发布以来赛事已有 {drift} 次修订/更正。</span></>
          )}
        </div>
        <div className="row-flex">
          <label className="field">
            版本标签（留空自动生成）
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="如 决赛-初版" />
          </label>
          <button className="btn" onClick={publish}>核对修订号并发布</button>
        </div>
      </div>

      <div className="panel">
        <h2>历史版本</h2>
        {pubs.length === 0 ? (
          <div className="muted">尚未发布任何版本。</div>
        ) : (
          <table>
            <thead>
              <tr><th style={{ width: 60 }}>版本ID</th><th>标签</th><th style={{ width: 120 }}>赛事修订号</th><th style={{ width: 200 }}>发布时间（UTC）</th></tr>
            </thead>
            <tbody>
              {pubs.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.version_label}</td>
                  <td>{p.event_revision}</td>
                  <td>{p.published_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="muted" style={{ marginTop: 10 }}>
          历史版本内容不可修改；在「成绩榜与链」页可查看最新冻结版的完整快照。
        </div>
      </div>
    </div>
  );
}

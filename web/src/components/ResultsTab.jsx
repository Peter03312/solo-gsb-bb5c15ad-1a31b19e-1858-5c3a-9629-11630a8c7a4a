import React, { useState } from 'react';
import { api } from '../api.js';

function fmtChain(chain) {
  return chain
    .map((c) => {
      if (c.stage === 'start') return `出发 ${c.pointCode}@${c.seconds}s`;
      if (c.stage === 'finish') return `终点 ${c.pointCode}@${c.seconds}s`;
      return `G${c.seq}:${c.pointCode}@${c.seconds}s`;
    })
    .join(' → ');
}

function LivePanel({ live }) {
  if (!live) return <div className="muted">加载中…</div>;
  const { results, event, groups, revision } = live;
  const groupText = groups
    .reduce((acc, g) => {
      if (!acc.has(g.seq)) acc.set(g.seq, { name: g.name, points: [] });
      acc.get(g.seq).points.push(g.point_code);
      return acc;
    }, new Map());

  return (
    <div>
      <div className="panel">
        <h2>赛事规则 <span className="muted">（当前修订号 {revision}）</span></h2>
        <div className="muted">
          出发点位 <b>{event.start_point}</b> · 终点点位 <b>{event.finish_point}</b> · 终点截止{' '}
          <b>{event.finish_deadline}</b> 秒（距发枪）
        </div>
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr><th style={{ width: 70 }}>组序</th><th>组名</th><th>可替代点位（命中其一即可）</th></tr>
          </thead>
          <tbody>
            {[...groupText.entries()].map(([seq, g]) => (
              <tr key={seq}>
                <td>第 {seq} 组</td>
                <td>{g.name}</td>
                <td>{g.points.join(' / ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>成绩榜</h2>
        <div className="muted" style={{ marginBottom: 10 }}>
          完成 {results.finisherCount} 人 / 参赛 {results.bibCount} 人；按耗时升序，同耗时并列（并列后名次跳空）。
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>名次</th>
              <th style={{ width: 90 }}>选手</th>
              <th style={{ width: 110 }}>状态</th>
              <th style={{ width: 110 }}>耗时（秒）</th>
              <th>最早有效链</th>
            </tr>
          </thead>
          <tbody>
            {results.finishers.map((r) => (
              <tr key={r.bib}>
                <td className="rank">{r.rank}</td>
                <td>{r.bib}</td>
                <td><span className="tag fin">完成</span></td>
                <td>{r.duration}</td>
                <td className="chain">{fmtChain(r.chain)}</td>
              </tr>
            ))}
            {results.unfinished.map((r) => (
              <tr key={r.bib}>
                <td>—</td>
                <td>{r.bib}</td>
                <td>
                  <span className="tag dnf">
                    {r.failStage === 'start' ? '出发异常' : r.failStage === 'finish' ? '未达终点' : `未完成G${r.groupSeq}`}
                  </span>
                </td>
                <td>—</td>
                <td className="chain danger">{r.failReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FrozenPanel({ pub }) {
  const snap = pub.snapshot;
  return (
    <div>
      <div className="panel" style={{ borderColor: '#f59e0b' }}>
        <h2>🔒 冻结版本 {pub.version_label}</h2>
        <div className="muted">
          发布于 {pub.published_at}（UTC）· 基于赛事修订号 {pub.event_revision} · 后续裁判更正不会改变本版内容
        </div>
      </div>
      <LivePanel live={snap} />
    </div>
  );
}

export default function ResultsTab({ live, onError }) {
  const [frozen, setFrozen] = useState(null);
  const [view, setView] = useState('live');

  const loadLatest = async () => {
    try {
      const pub = await api.getLatestPublication();
      setFrozen(pub);
      setView('frozen');
    } catch (e) {
      onError(e);
    }
  };

  return (
    <div>
      <div className="row-flex" style={{ marginBottom: 12 }}>
        <button className={`btn ${view === 'live' ? '' : 'secondary'}`} onClick={() => setView('live')}>
          当前实时成绩（修订号 {live?.revision ?? '…'}）
        </button>
        <button className={`btn ${view === 'frozen' ? '' : 'secondary'}`} onClick={loadLatest}>
          查看最新冻结版
        </button>
      </div>
      {view === 'live' ? <LivePanel live={live} /> : frozen ? <FrozenPanel pub={frozen} /> : null}
    </div>
  );
}

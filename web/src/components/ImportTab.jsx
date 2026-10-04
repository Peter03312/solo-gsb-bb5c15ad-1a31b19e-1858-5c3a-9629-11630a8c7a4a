import React, { useState } from 'react';
import { api, parseCsv } from '../api.js';

const SAMPLE = `record_no,bib,point_code,seconds
5001,105,START,0
5002,105,A1,180
5003,105,B2,620
5004,105,C1,1250
5005,105,FINISH,1550`;

export default function ImportTab({ revision, onChanged, onError, showToast }) {
  const [text, setText] = useState('');
  const [format, setFormat] = useState('csv');

  const buildReadings = () => {
    if (format === 'csv') return parseCsv(text);
    return JSON.parse(text);
  };

  const doImport = async () => {
    let readings;
    try {
      readings = buildReadings();
    } catch (e) {
      return showToast(`格式解析失败：${e.message}`, true);
    }
    if (!Array.isArray(readings)) return showToast('JSON 顶层必须是数组', true);
    try {
      const r = await api.importReadings({ expected_revision: revision, readings });
      showToast(
        `导入完成：新增 ${r.imported} 条，重复跳过 ${r.duplicates} 条，新修订号 ${r.revision}`
      );
      setText('');
      onChanged();
    } catch (e) {
      if (e.status === 400 && e.data?.details) {
        onError(new Error(`${e.data.error}：\n` + e.data.details.slice(0, 8).join('\n')));
      } else {
        onError(e);
      }
    }
  };

  return (
    <div className="panel">
      <h2>批量导入打卡</h2>
      <div className="muted" style={{ marginBottom: 10 }}>
        将依据 <b>修订号 {revision ?? '…'}</b> 核对赛事版本；若他人已修改赛事，本次导入被拒绝并返回当前修订号。
        <br />
        规则：同记录号内容不一致或出现负秒数，<b className="danger">整批拒绝</b>；完全相同的重复记录跳过（可安全重传）。
      </div>
      <div className="row-flex" style={{ marginBottom: 10 }}>
        <label className="field">
          格式
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="csv">CSV（record_no,bib,point_code,seconds）</option>
            <option value="json">JSON 数组</option>
          </select>
        </label>
        <button className="btn secondary" onClick={() => setText(SAMPLE)}>填入示例</button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={format === 'csv' ? SAMPLE : JSON.stringify([
          { record_no: 5001, bib: '105', point_code: 'START', seconds: 0 },
        ], null, 2)}
      />
      <div style={{ marginTop: 10 }}>
        <button className="btn" onClick={doImport} disabled={!text.trim()}>
          核对修订号并整批导入
        </button>
      </div>
    </div>
  );
}

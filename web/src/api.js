// API 客户端：409（修订过期）统一抛出携带当前修订号的错误。
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(data.error || `请求失败（${res.status}）`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  getEvent: () => request('/event'),
  getLiveResults: () => request('/results/live'),
  getReadings: () => request('/readings'),
  getPublications: () => request('/publications'),
  getPublication: (id) => request(`/publications/${id}`),
  getLatestPublication: () => request('/publications/latest'),
  setup: (body) => request('/event/setup', { method: 'PUT', body: JSON.stringify(body) }),
  importReadings: (body) => request('/readings/import', { method: 'POST', body: JSON.stringify(body) }),
  correct: (recordNo, body) => request(`/readings/${recordNo}/correct`, { method: 'POST', body: JSON.stringify(body) }),
  voidReading: (recordNo, body) => request(`/readings/${recordNo}/void`, { method: 'POST', body: JSON.stringify(body) }),
  publish: (body) => request('/publications', { method: 'POST', body: JSON.stringify(body) }),
};

// CSV：record_no,bib,point_code,seconds（也接受中文表头）。
export function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  const keys = ['record_no', 'bib', 'point_code', 'seconds'];
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const obj = {};
    header.forEach((h, i) => {
      const key = ['记录号', '选手', '选手号', '点位', '秒数', '发枪秒数'].includes(h)
        ? { 记录号: 'record_no', 选手: 'bib', 选手号: 'bib', 点位: 'point_code', 秒数: 'seconds', 发枪秒数: 'seconds' }[h]
        : h;
      obj[key] = cells[i];
    });
    return {
      record_no: obj.record_no,
      bib: obj.bib,
      point_code: obj.point_code,
      seconds: obj.seconds,
    };
  });
}

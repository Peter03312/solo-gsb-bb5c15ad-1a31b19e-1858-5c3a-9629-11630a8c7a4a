import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PORT, WEB_DIST } from './config.js';
import { router } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '5mb' }));

// 畸形 JSON 给出 400 而不是默认的 HTML 500 页。
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '请求体不是合法 JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '请求体过大' });
  next(err);
});

app.use('/api', router);

// 生产环境直接托管前端构建产物（容器内单服务）。
const distDir = path.resolve(__dirname, '..', WEB_DIST);
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// 兜底错误处理。
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`定向越野复核系统已启动: http://0.0.0.0:${PORT} (API 前缀 /api)`);
});

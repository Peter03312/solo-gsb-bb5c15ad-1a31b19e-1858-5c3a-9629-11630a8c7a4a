// 应用配置：全部通过环境变量覆盖（见 README）。
import path from 'node:path';
import fs from 'node:fs';

export const PORT = Number(process.env.PORT || 8080);
export const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'orienteering.sqlite');
export const WEB_DIST = process.env.WEB_DIST || path.join(process.cwd(), 'web', 'dist');
// 首次启动且数据库为空时写入演示赛事（0/1/false 关闭）。
export const SEED_DEMO = !['0', 'false', 'no'].includes(String(process.env.SEED_DEMO || '1').toLowerCase());

export function ensureDataDir() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

# 定向越野打卡争议复核系统

主办方按顺序设置关卡组（每组含可替代点位）并录入终点截止秒数；系统从选手出发后的读数中选出
**时间严格递增、依序通过各组、截止前到终点**的最早有效链，按耗时排名（同耗时并列），
并支持裁判作废 / 更正打卡、重算成绩与发布冻结。

技术栈：**Node.js + Express + React（Vite）+ SQLite（better-sqlite3）**。

---

## 一键启动（Docker Compose，推荐）

```bash
docker compose up --build -d
```

启动时自动建表、初始化数据库；数据库为空时默认写入一套演示赛事（可用 `SEED_DEMO=0` 关闭）。

- 网页地址： **http://localhost:8080**
- API 前缀： `http://localhost:8080/api`
- 容器端口： **8080**（宿主机映射端口在 `docker-compose.yml` 中修改）
- 数据持久化： Docker 命名卷 `orienteering-data` → 容器内 `/app/data/orienteering.sqlite`

停止与清理：

```bash
docker compose down            # 停止（保留数据卷）
docker compose down -v         # 停止并删除数据卷（清空数据）
```

不用 Compose 直接构建镜像：

```bash
docker build -t orienteering-review .
docker run -p 8080:8080 -v "$PWD/data:/app/data" orienteering-review
```

---

## 本地开发运行

需要 Node.js ≥ 20。

```bash
# 终端 1：后端（默认 8080，首次启动自动建库+演示数据）
cd server
npm install
npm start                    # 或在仓库根目录：npm run dev:server（改动自动重启）

# 终端 2：前端开发服务器（5173，/api 自动代理到 8080）
cd web
npm install
npm run dev                  # 或在仓库根目录：npm run dev:web
```

- 开发网页地址： **http://localhost:5173**
- 生产构建：仓库根目录执行 `npm run build:web`，构建产物在 `web/dist`，
  随后 `npm start` 启动的后端会在 **8080** 同时托管网页与 API。

---

## 配置（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | HTTP 监听端口 |
| `DB_PATH` | `./data/orienteering.sqlite` | SQLite 数据库文件路径（所在目录自动创建） |
| `WEB_DIST` | `./web/dist` | 前端构建产物目录（存在时由后端托管） |
| `SEED_DEMO` | `1` | 首次启动且库为空时写入演示赛事；设为 `0` / `false` 关闭 |

---

## 成绩计算规则

1. **唯一出发打卡**：每位选手有效读数中必须恰有一条出发点位打卡；没有或多于一条都记为未完成。
2. **依序通过各组**：从出发读数起，按组序为每组选取「当前时间之后、命中本组任一点位」的**最早**一条打卡
   （组内点位互为替代）。该贪心选择即全局最早有效链。
3. **时间严格递增**：等于当前时间的打卡不计入；同一秒以记录号较小者优先（确定性决胜）。
4. **终点与截止**：最后一组之后取最早的终点读数，且其距发枪秒数必须 ≤ 终点截止秒数；
   超过截止记「终点超时」。
5. **逆序与多余打卡不作依据**：如先打了后组点位再补前组，后组那条不会被提前消费；同点重复打卡只取最早有效一条。
6. **排名**：完成者按耗时（终点秒 − 出发秒）升序，**同耗时并列**，采用标准竞赛排名（并列后名次跳空，如 1、2、2、4）；
   未完成者列在完成者之后，并给出**首个未完成的组**或**终点超时**的具体原因。

## 裁判复核

- **作废**打卡：从有效读数中排除，原值与作废原因永久保留，成绩立即重算。
- **更正**打卡：可修改点位 / 秒数，原始值保留在 `original_*` 字段，必须填写原因；
  新值留空则恢复为原值（也可用于取消作废）。更正后成绩立即重算。

## 发布冻结与赛事修订

- 赛事有一个单调递增的**修订号**：改关卡配置、导入打卡、裁判作废 / 更正都会使其 +1（发布本身不增加修订号）。
- **导入和发布必须携带 `expected_revision` 核对**：与当前修订号不一致时返回
  `409` 及当前修订号，前端会提示并刷新，避免基于过期版本操作。
- **发布**会把当时的关卡配置、全部有效读数（含作废 / 更正标记）和计算结果整体写入不可变快照；
  **发布之后的任何更正都不改变历史版本**，实时成绩与历史冻结版可分别查看。

## 批量导入规则

- 接口：`POST /api/readings/import`，体为 `{ expected_revision, readings: [...] }`，
  每条记录含 `record_no`（整数、唯一）、`bib`、`point_code`、`seconds`。
- 网页支持 **CSV**（表头 `record_no,bib,point_code,seconds`）与 **JSON 数组**两种粘贴方式。
- 出现以下任一情况，**整批拒绝**（不写入任何一条）：
  - 负秒数（或非整数秒）；
  - 同记录号在批次内 / 与库中已有记录内容不一致。
- 与库中（或批次内）完全相同的记录视为重复，幂等跳过，可安全重传。

---

## 主要 HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/event` | 赛事配置、关卡组、统计、最新发布摘要 |
| PUT | `/api/event/setup` | 整体替换关卡设置（需 `expected_revision`，过期返回 409） |
| POST | `/api/readings/import` | 批量导入打卡（需 `expected_revision`；违规整批拒绝） |
| GET | `/api/readings` | 全部打卡（含原值、状态、原因） |
| POST | `/api/readings/:recordNo/void` | 作废打卡（body: `{reason}`） |
| POST | `/api/readings/:recordNo/correct` | 更正打卡（body: `{reason, point_code?, seconds?}`） |
| GET | `/api/results/live` | 当前实时成绩、最早有效链与全部读数 |
| POST | `/api/publications` | 发布冻结快照（需 `expected_revision`） |
| GET | `/api/publications/latest` | 最新冻结版完整快照 |
| GET | `/api/publications/:id` | 指定历史版本快照 |
| GET | `/api/health` | 健康检查 |

## 演示数据

首次启动内置一场赛事：截止 1800 秒，三个关卡组（A1/A2、B1/B2、C1/C2）。

- **101 / 102**：不同路线同耗时 1600 秒，并列第 1（101 含一条同点多余打卡）；
- **103**：逆序打卡（先 C2 后 B1），第三组无法完成；
- **104**：1900 秒到终点，超过截止。

可在网页中导入更多打卡、作废 / 更正后观察重算与冻结效果。

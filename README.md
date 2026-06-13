# VoyagePlanner · 冰岛 2026

面向同行者共享查看和维护的冰岛自驾行程项目。首个路线严格以 Notion 的冰岛页面为基础，日期为 **2026-09-26 至 2026-10-07**。

## 功能

- 地图与时间轴联动，按天查看行程
- 景点、住宿、租车图片预览
- 后台新增、修改、删除节点，修改实时保存到服务器
- 打印 / 导出完整行程明细
- Flask API + SQLite 持久化，适合少量同行者共享

## 本地开发

需要 Node.js 20+ 与 Conda。

```bash
conda env create -f environment.yml
conda activate voyageplanner
python -m backend.app
```

另开终端：

```bash
npm install
npm run dev
```

前端开发地址为 `http://localhost:3000`，Vite 会把 `/api` 代理到 `http://127.0.0.1:8080`。

## Docker 部署

```bash
docker compose up -d --build
```

访问 `http://服务器地址:25565`。服务显式绑定到 `0.0.0.0:25565`，SQLite 数据保存在 Docker volume `voyageplanner-data` 中，重新构建镜像不会丢失修改。

Docker 是推荐的服务器部署方式，服务器无需安装 Conda；`environment.yml` 主要用于本地开发或不使用 Docker 的环境。

## API

- `GET /api/health`
- `GET /api/trips/iceland-2026`
- `POST /api/trips/iceland-2026/nodes`
- `PUT /api/trips/iceland-2026/nodes/:id`
- `DELETE /api/trips/iceland-2026/nodes/:id`
- `POST /api/trips/iceland-2026/auto-connect`
- `POST /api/trips/iceland-2026/reset`

住宿图片为公开网络参考图，实际房源以预订页面为准。

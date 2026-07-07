# VoyagePlanner · 冰岛 2026

面向同行者共享查看和维护的冰岛自驾行程项目。首个路线严格以 Notion 的冰岛页面为基础，日期为 **2026-09-26 至 2026-10-07**。

## 功能

- 地图与时间轴联动，按天查看行程
- 景点、住宿、租车图片预览
- 后台新增、修改、删除节点，修改实时保存到服务器
- 打印 / 导出完整行程明细
- Flask API + SQLite 持久化，适合少量同行者共享

## 运行配置

复制 `.env.example` 为 `.env`，再按环境填写密钥和端口。不要把真实 `.env`、API key、SSH key、密码提交到 GitHub。

```bash
cp .env.example .env
```

主要变量：

```bash
PORT=8080                          # Flask / Gunicorn 容器内端口
APP_PORT=25565                     # Docker 对外 Web 端口
DATABASE_PATH=backend/voyageplanner.db
AMAP_WEB_SERVICE_KEY=              # 后端高德 POI / 逆地址解析
VITE_AMAP_JS_API_KEY=              # 前端高德地图 JS
VITE_AMAP_SECURITY_CODE=           # 高德安全密钥，如控制台要求
GOOGLE_MAPS_API_KEY=               # 后端 Google Places / Geocoding
VITE_GOOGLE_MAPS_BROWSER_KEY=      # 前端 Google Maps JS
OVERSEAS_GEOCODE_PROVIDER=google
HTTP_PROXY=                        # 服务器无法直连 Google / GitHub 时填写
HTTPS_PROXY=
NO_PROXY=localhost,127.0.0.1
```

端口不要混淆：`APP_PORT` 是浏览器访问服务的 Web 端口；服务器 SSH 端口单独在 `ssh -p` 中指定。

行程按区域选择地图供应商：国内行程使用高德，境外行程使用 Google。地点数据在应用层保存为统一结构，坐标默认以 WGS84 存储；高德地图渲染时再转换为 GCJ-02。地点检索只在用户点击“搜索”时调用接口，并使用本地缓存，避免个人项目里因输入联想产生额外调用。

## 本地开发

需要 Node.js 20+ 与 Conda。

1. 安装 Python 依赖并启动后端：

```bash
conda env create -f environment.yml
conda activate voyageplanner
python -m backend.app
```

后端默认监听 `http://127.0.0.1:8080`。

2. 另开终端，安装前端依赖并启动 Vite：

```bash
npm install
npm run dev
```

前端开发地址为 `http://localhost:3000`，Vite 会把 `/api` 代理到 `http://127.0.0.1:8080`。

3. 本地构建检查：

```bash
python3 -m py_compile backend/app.py
npm run build
docker compose config --quiet
```

## 数据库同步

`backend/voyageplanner.db` 和 `backend/uploads/` 会提交到 GitHub，用来让本地、GitHub 和服务器保留同一份行程数据与图片快照。线上 Docker volume 中的 SQLite 数据库和上传图片是日常准源；同步时先从服务器拉取当前 `/data/voyageplanner.db` 与 `/data/uploads/`，再提交到 GitHub，避免本地旧数据覆盖服务器数据。

如需把服务器当前数据拉到本地调试，运行：

```bash
bash scripts/pull-server-db.sh
```

脚本只从服务器容器拉取 `/data/voyageplanner.db` 到本地 `backend/voyageplanner.db`，并拉取 `/data/uploads/` 到本地 `backend/uploads/`；覆盖前会先把已有本地库和本地图片分别备份到 `.runtime/db-backups/` 与 `.runtime/upload-backups/`。SSH 密码不写入仓库，按提示输入即可。确认后提交 `backend/voyageplanner.db` 与 `backend/uploads/`，GitHub 就会以服务器当前数据为准。

数据库中保存的是应用根相对 URL，例如 `/uploads/example.png`。本地开发时由 `backend/uploads/example.png` 提供；Docker 镜像构建会把项目中的 `backend/voyageplanner.db` 与 `backend/uploads/` 一起打包进容器。容器启动时只会在 volume 缺少数据库或图片文件时从镜像快照补齐，不会覆盖线上 `/data/voyageplanner.db` 与 `/data/uploads/` 中已有的数据。

## Docker 打包与启动

Docker 是推荐的服务器部署方式，服务器无需安装 Conda；`environment.yml` 主要用于本地开发或不使用 Docker 的环境。

使用 Compose 构建镜像并启动：

```bash
docker compose up -d --build
```

访问 `http://服务器地址:25565`，或使用 `.env` 中的 `APP_PORT` 指定对外端口。服务显式绑定到 `0.0.0.0:${APP_PORT:-25565}`，SQLite 数据和上传图片保存在 Docker volume `voyageplanner-data` 中，重新构建镜像不会丢失修改。

常用 Docker 命令：

```bash
docker compose ps
docker logs --tail 100 voyageplanner
curl -fsS http://127.0.0.1:${APP_PORT:-25565}/api/health
docker compose restart
docker compose up -d --build
```

如果需要不用 Compose 手动打包镜像，可以执行：

```bash
set -a
source .env
set +a

docker build \
  --build-arg VITE_AMAP_JS_API_KEY="$VITE_AMAP_JS_API_KEY" \
  --build-arg VITE_AMAP_SECURITY_CODE="$VITE_AMAP_SECURITY_CODE" \
  --build-arg VITE_GOOGLE_MAPS_BROWSER_KEY="$VITE_GOOGLE_MAPS_BROWSER_KEY" \
  -t voyageplanner:latest .
```

手动运行镜像示例：

```bash
docker volume create voyageplanner-data
docker run -d \
  --name voyageplanner \
  --restart unless-stopped \
  -p 0.0.0.0:${APP_PORT:-25565}:8080 \
  --env-file .env \
  -v voyageplanner-data:/data \
  voyageplanner:latest
```

## 服务器部署流程

以下命令以当前服务器部署方式为模板。服务器上真实 API key 只放在服务器 `.env` 中，不写入仓库；代理地址按实际网络填写。

第一次准备目录：

```bash
ssh -p 2002 liyunkai@crazychild.cn
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/CrazyChild18/myPage.git voyageplanner
cd voyageplanner
cp .env.example .env
```

编辑服务器 `.env`：

```bash
nano .env
```

至少确认这些变量：

```bash
APP_PORT=25565
AMAP_WEB_SERVICE_KEY=...
VITE_AMAP_JS_API_KEY=...
GOOGLE_MAPS_API_KEY=...
VITE_GOOGLE_MAPS_BROWSER_KEY=...
OVERSEAS_GEOCODE_PROVIDER=google
```

如果服务器无法直连 Google 或 GitHub，可以加入代理：

```bash
HTTP_PROXY=http://192.168.1.3:20173
HTTPS_PROXY=http://192.168.1.3:20173
NO_PROXY=localhost,127.0.0.1
```

启动服务：

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:25565/api/health
```

后续更新服务器代码：

```bash
ssh -p 2002 liyunkai@crazychild.cn
cd ~/apps/voyageplanner
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:25565/api/health
```

如果服务器访问 GitHub 很慢或超时，可只给本次 `git pull` 加代理：

```bash
HTTP_PROXY=http://192.168.1.3:20173 \
HTTPS_PROXY=http://192.168.1.3:20173 \
git pull --ff-only origin main
```

不要执行 `docker compose down -v`，这会删除 Docker volume 并清空线上数据库和上传图片。常规更新只使用 `docker compose up -d --build`。

## API

- `GET /api/health`
- `GET /api/trips/iceland-2026`
- `POST /api/trips/iceland-2026/nodes`
- `PUT /api/trips/iceland-2026/nodes/:id`
- `DELETE /api/trips/iceland-2026/nodes/:id`
- `POST /api/trips/iceland-2026/auto-connect`
- `POST /api/trips/iceland-2026/reset`

住宿图片为公开网络参考图，实际房源以预订页面为准。

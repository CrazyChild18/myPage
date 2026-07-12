# VoyagePlanner

面向同行者共享查看和维护的旅行行程应用。前端使用 React/Vite，后端使用 Flask，数据持久化已经统一迁移到 PostgreSQL。

## 功能

- 地图与时间轴联动，按天查看行程
- 景点、交通和住宿信息维护，支持图片上传与删除
- PostgreSQL 多应用共享持久化
- 打印和导出完整行程明细

## 地图配置

国内行程使用高德地图，境外行程使用 Google Maps。地点坐标以 WGS84 为统一存储格式，高德渲染时转换为 GCJ-02。地图浏览器 Key 通过 Vite 构建参数注入，后端 Web Service Key 仅保存在运行环境中。
## 运行配置

复制 `.env.example` 为 `.env`，然后设置地图密钥、PostgreSQL 用户与密码。真实 `.env`、API Key 和数据库密码不要提交到 Git。

```bash
cp .env.example .env
```

Compose 会启动两个容器：

- `voyageplanner`：Web 与 API，对外端口默认保持 `25565`
- `voyageplanner-postgres`：PostgreSQL，只在 Docker 网络 `voyageplanner-shared` 中提供服务，不暴露公网端口

关键配置：

```dotenv
APP_PORT=25565
POSTGRES_DB=voyageplanner
POSTGRES_USER=voyageplanner
POSTGRES_PASSWORD=change-me
POSTGRES_DATA_DIR=
POSTGRES_BACKUP_DIR=
VOYAGEPLANNER_DATA_DIR=
```

本地不填写两个数据目录时，Compose 使用 Docker named volume。NAS 部署应填写宿主机绝对路径，例如：

```dotenv
POSTGRES_DATA_DIR=/volume/path/voyageplanner/postgres
VOYAGEPLANNER_DATA_DIR=/volume/path/voyageplanner/app-data
```

## Docker 启动

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:25565/api/health
```

健康接口成功时返回 PostgreSQL 状态：

```json
{"status":"ok","database":"postgresql"}
```

不要执行 `docker compose down -v`，也不要删除 NAS 上配置的 PostgreSQL 和应用数据目录。

## SQLite 数据迁移

`scripts/migrate_sqlite_to_postgres.py` 用于一次性迁移旧 SQLite 数据。它会先执行 SQLite 完整性检查，然后清空目标 PostgreSQL 业务表、导入全部数据，并逐表核对记录数。

```bash
DATABASE_URL='postgresql://user:password@postgres:5432/voyageplanner' \
python scripts/migrate_sqlite_to_postgres.py \
  --sqlite /migration/voyageplanner.db \
  --replace
```

`--replace` 是强制确认参数。迁移完成前应保留原 SQLite 文件和上传图片归档，以便回滚。

## 多应用共享数据库

其他 Docker Compose 项目可以加入现有网络：

```yaml
networks:
  voyageplanner-shared:
    external: true
```

后台任务通过容器名 `voyageplanner-postgres:5432` 连接，并使用单独的最小权限数据库账号。浏览器端不应直接连接 PostgreSQL。

## 本地开发

先启动 PostgreSQL，再运行后端与 Vite：

```bash
docker compose up -d postgres
python -m backend.app
npm run dev
```

后端默认监听 `http://127.0.0.1:8080`，Vite 默认监听 `http://localhost:3000` 并代理 `/api`。
## 本地检查

```bash
python -m unittest discover -s tests -v
python -m py_compile backend/app.py backend/database.py scripts/migrate_sqlite_to_postgres.py
npm run build
```

## 数据备份

- PostgreSQL：运行 `sh scripts/backup_postgres.sh`，备份写入 `POSTGRES_BACKUP_DIR`
- 图片：备份 `VOYAGEPLANNER_DATA_DIR/uploads`
- GitHub 只保存代码，不再保存运行中的数据库文件和上传图片

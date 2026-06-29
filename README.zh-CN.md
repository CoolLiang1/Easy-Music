# Easy Music

语言：[English](README.md) | [简体中文](README.zh-CN.md)

Easy Music 是一个自托管的个人云音乐系统，面向按场景听歌的个人音乐库使用。项目包含 FastAPI 后端、PostgreSQL、媒体处理 Worker、React/Vite Web 管理端，以及 Kotlin/Jetpack Compose Android 播放客户端。

这个项目适合用来管理自己的音乐库：上传或导入歌曲，编辑标签和元数据，在 Web 或 Android 上播放音乐，在 Android 上手动离线缓存，管理歌单和播放队列，并使用规则推荐和可选的 AI 标签建议。

## 项目状态

截至 2026-06-30：

- MVP Phase 0 到 Phase 7 已实现，并完成本地验收。
- V1.1 工作流改进、重复检测、封面编辑、高级推荐解释、冷门复活曲目、报告和 Android 快捷入口已实现并验收。
- V2 导入/视频、歌单、客户端播放队列、Recommendation V2 基础、标签简化和 AI Tag Suggestions V2 已实现。
- 首次真实 Ubuntu/domain/HTTPS 生产 smoke 已记录通过，见 [docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md](docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md)。
- 下一阶段计划是围绕现有 Web 和 Android 流程做 UI 优化。

## 功能

- 登录保护的个人音乐库。
- 支持上传 MP3、FLAC、M4A、WAV、OGG 音频文件。
- 可选的用户上传视频转音频处理。
- 安全的服务端导入预览，以及从配置好的导入根目录确认导入。
- 后台 Worker 处理元数据提取、播放文件生成、封面提取、重复信号和处理状态更新。
- 曲目、标签、封面、歌单和播放队列管理。
- Web 播放，以及 Android Media3 播放和后台控制。
- Android 手动离线缓存和播放事件同步。
- 基于规则的推荐，支持反馈、冷却模式、`not_today` 和歌单评分信号。
- AI Assistant V1 和 AI 标签建议，使用 OpenAI-compatible provider，默认关闭，需显式配置。
- 基于 Docker Compose 的生产部署，包含 Caddy HTTPS 反向代理、主机目录初始化、健康检查和数据库备份脚本。

## 项目入口

### 运行地址

本地开发默认入口：

| 入口 | 地址 |
| --- | --- |
| Web 管理端 | `http://127.0.0.1:8081/` |
| 后端 API | `http://127.0.0.1:8000/` |
| 健康检查 | `http://127.0.0.1:8000/health` |
| FastAPI OpenAPI 文档 | `http://127.0.0.1:8000/docs` |

生产环境使用 `.env.production` 中配置的 HTTPS origin，例如 `https://music.example.com`。如果上游网络屏蔽入站 80/443，也可以使用高端口 HTTPS，例如 `https://music.example.com:25443`。

### 仓库结构

| 路径 | 说明 |
| --- | --- |
| `backend/` | FastAPI 应用、SQLAlchemy 模型、Alembic 迁移、认证、API、服务、Worker 和测试。 |
| `web/` | React/Vite Web 管理端。 |
| `android/` | Kotlin/Jetpack Compose Android 应用。 |
| `deploy/` | Caddy 配置、主机目录初始化脚本、数据库备份脚本。 |
| `docs/` | 产品、架构、开发流程、部署、任务和验收文档。 |
| `docker-compose.yml` | 本地开发服务。 |
| `docker-compose.prod.yml` | 生产服务。 |
| `.env.example` | 开发环境示例配置，不包含真实密钥。 |
| `.env.production.example` | 生产环境模板，只包含占位符。 |

## 快速开始：本地开发

前置要求：

- Docker Engine 和 Docker Compose plugin。
- Python 3.12，用于后端本机测试和命令。
- Node.js 20.19+ 或 22.12+，用于 Web 应用。
- FFmpeg 和 ffprobe，用于本机媒体处理 smoke。
- Android Studio 或 Android SDK platform tools，用于 Android 开发。

从仓库根目录启动后端栈：

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d postgres api
docker compose exec api alembic upgrade head
docker compose exec `
  -e EASY_MUSIC_INITIAL_PASSWORD="replace-with-a-local-password" `
  api python -m app.auth.initial_user --username admin
docker compose up -d worker-loop
```

如果数据库里已经有初始用户，继续使用现有账号即可。初始用户命令是一次性的，如果已有用户会拒绝继续创建。

启动 Web 管理端：

```powershell
cd web
npm install
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

打开 `http://127.0.0.1:8081/`，使用本地 admin 账号登录，上传一个小的受支持音频文件，等待 Worker 将状态从 `processing` 处理到 `ready`。

## 后端开发

从 `backend/` 目录进行本机后端开发：

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
$env:DATABASE_URL = "postgresql+psycopg://easy_music:change-me-development-only@localhost:5432/easy_music_dev"
$env:MEDIA_ROOT = ".\media"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

处理一个待处理的 Worker 任务：

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.worker
```

持续运行 Worker：

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.worker --loop --poll-interval 5
```

运行后端测试：

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

## Web 开发

```powershell
cd web
npm install
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

常用检查：

```powershell
cd web
npm run typecheck
npm run build
```

当前 `web/package.json` 还没有配置 `npm run lint`。

## Android 开发和使用

构建并测试 Android 应用：

```powershell
cd android
.\gradlew.bat build
.\gradlew.bat test
```

Android 默认 API 地址是 `http://10.0.2.2:8000`，适合 Android 模拟器访问开发机上的后端。

如果是真机连接本地后端，可以使用 `adb reverse`，或构建时传入一个手机可访问的 API 地址：

```powershell
adb reverse tcp:8000 tcp:8000
cd android
.\gradlew.bat assembleDebug -PeasyMusicApiBaseUrl=http://127.0.0.1:8000
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

生产 Android APK 需要在构建时传入部署后的 HTTPS origin。不要把真实域名写进源码：

```powershell
cd android
.\gradlew.bat assembleDebug -PeasyMusicApiBaseUrl=https://music.example.com
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

如果生产环境使用高端口 HTTPS：

```powershell
cd android
.\gradlew.bat assembleDebug -PeasyMusicApiBaseUrl=https://music.example.com:25443
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

安装后，在手机上打开 Easy Music，使用服务器上的同一个账号登录，进入曲库，播放一个 `ready` 状态的曲目。

## 生产部署摘要

完整生产部署流程见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。本节只作为命令速览。

生产规则：

- 不要提交 `.env.production`。
- 不要提交真实域名、密码、API key、Bearer token 或私有主机路径。
- Web 构建前必须将 `VITE_API_BASE_URL` 设置为公开 HTTPS origin。
- Android 生产 APK 通过 `-PeasyMusicApiBaseUrl=...` 传入公开 API origin。
- 如果入站 80/443 被屏蔽，但高端口可访问，可以使用 DNS 验证证书和 `deploy/Caddyfile.manual-cert`。

典型 Ubuntu 部署流程：

```bash
cd /srv/easy-music/repo
if [ ! -f .env.production ]; then cp .env.production.example .env.production; fi
nano .env.production

chmod +x deploy/setup-host.sh deploy/backup-db.sh
sudo ./deploy/setup-host.sh

cd web
export VITE_API_BASE_URL="https://music.example.com"
export VITE_MAX_VIDEO_UPLOAD_MB="1024"
npm ci
npm run build
cd ..

docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production exec api alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.production ps
curl -sS https://music.example.com/health
```

只在首次部署时创建生产用户：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -e EASY_MUSIC_INITIAL_PASSWORD='your-admin-password-at-least-12-chars' \
  api python -m app.auth.initial_user --username admin
```

如果使用非标准 HTTPS 端口，在 `.env.production` 中配置匹配的 origin，并重新构建 Web：

```env
CORS_ORIGINS=https://music.example.com:25443
VITE_API_BASE_URL=https://music.example.com:25443
CADDY_DOMAIN=music.example.com
CADDY_HTTPS_PORT=25443
CADDYFILE_PATH=./deploy/Caddyfile.manual-cert
CADDY_CERT_DIR=/srv/easy-music/caddy-certs
```

## 运维命令

生产命令默认在服务器仓库根目录执行：

```bash
cd /srv/easy-music/repo
```

查看服务状态：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

查看全部日志或单个服务日志：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 worker
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 caddy
```

重启服务：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production restart api
docker compose -f docker-compose.prod.yml --env-file .env.production restart worker
docker compose -f docker-compose.prod.yml --env-file .env.production restart caddy
```

执行数据库迁移：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api alembic upgrade head
```

备份数据库：

```bash
./deploy/backup-db.sh /srv/easy-music/backups
ls -lh /srv/easy-music/backups
```

更新生产部署：

```bash
cd /srv/easy-music/repo
./deploy/backup-db.sh /srv/easy-music/backups
git pull --ff-only origin main

cd web
export VITE_API_BASE_URL="https://music.example.com"
export VITE_MAX_VIDEO_UPLOAD_MB="1024"
npm ci
npm run build
cd ..

docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production exec api alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

如果预生产环境部署的是 `develop`，把 pull 命令里的 `main` 换成 `develop`。

健康检查和磁盘检查：

```bash
curl -sS https://music.example.com/health
df -h /srv/easy-music
du -sh /srv/easy-music/media /srv/easy-music/postgres /srv/easy-music/backups
```

## 验证

提交 PR 或部署前建议按改动范围选择检查：

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

```powershell
cd web
npm run typecheck
npm run build
```

```powershell
cd android
.\gradlew.bat test
.\gradlew.bat build
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet
```

部署相关改动还应检查 `.env.production.example`、`docker-compose.prod.yml`、Caddy 配置、host setup、backup 脚本和 `docs/DEPLOYMENT.md`。

## 文档

建议从这些文档开始：

- [产品需求](docs/PRD.md)
- [系统架构](docs/ARCHITECTURE.md)
- [路线图](docs/ROADMAP.md)
- [开发流程](docs/DEVELOPMENT.md)
- [环境变量](docs/ENVIRONMENT.md)
- [生产部署](docs/DEPLOYMENT.md)
- [API 手动测试](docs/API_MANUAL_TESTING.md)
- [Git 工作流](docs/GIT_WORKFLOW.md)
- [Ubuntu 生产 smoke 验收](docs/ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md)
- [下一阶段 UI 优化任务](docs/TASKS/NEXT_UI_OPTIMIZATION_TASKS.md)

历史验收记录在 `docs/ACCEPTANCE/`，任务记录在 `docs/TASKS/`。

## 安全和密钥

- 只提交示例环境文件。
- 不要提交 `.env`、`.env.production`、生产域名、密码、API key、Bearer token、个人路径、媒体库、构建产物、依赖目录或数据库文件。
- AI 功能默认关闭，只有在明确配置 provider 凭据后再启用。
- 导入根目录必须显式配置，使用专用目录，并避免指向仓库、用户 home 目录或 Easy Music 管理的媒体目录。
- 生产环境不要把 PostgreSQL 直接暴露到公网。

## License

当前仓库还没有包含 license 文件。在添加 license 前，不应假定该项目具备公开复用授权。

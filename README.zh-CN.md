# Easy Music

语言：[English](README.md) | [简体中文](README.zh-CN.md)

Easy Music 是一个自托管的个人云音乐系统，面向按场景听歌。它从你自己的曲库里回答"现在该听什么"，依据是场景、类型、特征三类标签，加上播放历史和"听腻了""今天不想听"这类反馈。

这是一个私人的单用户项目，包含 FastAPI 后端（PostgreSQL 和媒体处理 Worker）、React/Vite Web 管理端，以及 Kotlin/Jetpack Compose Android 播放器。当前状态和待办见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 功能

- 需要登录的个人曲库，Web 和 Android 会在后台自动续期登录。
- 支持上传 MP3、FLAC、M4A、WAV、OGG、AAC；可从用户自己提供的视频中提取音频；可从服务器上配置好的目录只读预览后导入。
- Worker 负责提取元数据和封面、记录重复检测信号，并生成响度统一的 MP3 播放文件，原始文件保持不变。
- 在 Web 管理端管理曲目、标签、封面、歌单和播放队列。
- Web 播放；Android 使用 Media3 播放，支持后台、通知栏、锁屏和耳机控制，支持手动离线缓存，离线播放记录联网后同步。
- 基于规则的推荐，考虑反馈、冷却模式、`not_today` 和歌单信号。
- 可选 AI（OpenAI 兼容接口）：用自然语言提出听歌需求、单曲标签建议、基于你自己标签库的批量自动打标签，以及把杂乱文件名整理成规范标题和艺人（预览确认后才保存）。AI 从不直接挑选曲目，未配置时默认关闭。
- 生产环境使用 Docker Compose 部署，经 Caddy 提供 HTTPS，附带更新脚本和数据库备份。

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `backend/` | FastAPI 应用、SQLAlchemy 模型、Alembic 迁移、服务层、Worker、测试。 |
| `web/` | React/Vite Web 管理端。 |
| `android/` | Kotlin/Jetpack Compose Android 应用。 |
| `deploy/` | Caddy 配置、主机初始化、更新和备份脚本。 |
| `docs/` | 产品、架构、开发、部署文档和工作记录。 |
| `docker-compose.yml`、`docker-compose.prod.yml` | 本地和生产环境服务。 |
| `.env.example`、`.env.production.example` | 只含占位值的环境变量模板。 |

## 快速开始

需要：带 Compose 的 Docker、Node.js 20.19+ 或 22.12+；开发 Android 还需要 Android Studio 或 Android SDK。在仓库根目录的 PowerShell 中运行：

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d postgres api
docker compose exec api alembic upgrade head
docker compose exec `
  -e EASY_MUSIC_INITIAL_PASSWORD="replace-with-a-local-password" `
  api python -m app.auth.initial_user --username admin
docker compose up -d worker-loop

cd web
npm install
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

打开 `http://127.0.0.1:8081/`，用 `admin` 登录，上传一个短音频，等它变成 `ready`。API 地址是 `http://127.0.0.1:8000`，OpenAPI 文档在 `/docs`。

在主机上直接运行后端、构建 Android、运行各项检查，见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。生产部署见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 文档

- [文档指南](docs/README.md)：每类信息由哪份文档负责。
- [路线图](docs/ROADMAP.md)：状态和待办。
- [产品需求](docs/PRD.md)
- [架构](docs/ARCHITECTURE.md)
- [开发](docs/DEVELOPMENT.md)
- [环境变量](docs/ENVIRONMENT.md)
- [生产部署](docs/DEPLOYMENT.md)
- [API 手动测试](docs/API_MANUAL_TESTING.md)
- [Agent 指南](AGENTS.md)

## 安全

- 只提交示例环境变量文件。`.env`、`.env.production`、域名、密码、API Key、令牌、个人路径、媒体文件和数据库都不要进版本库。
- 导入目录要明确指定，并放在仓库、用户主目录和受管媒体目录之外。
- 不要把 PostgreSQL 暴露到公网。

## License

仓库没有附带许可证文件。除查看外，不要默认拥有任何复用权利。

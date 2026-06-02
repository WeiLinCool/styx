# Docker Compose 部署文档

本文档说明如何使用 Docker Compose 部署当前 WebUI 应用和 PostgreSQL 数据库。

当前项目是根目录级 Next.js App Router 应用，主要结构如下：

- `src/app`：页面、布局和 API Route。
- `src/features`：用户端和管理端功能 UI。
- `src/components/ui`：shadcn/Radix UI 基础组件。
- `src/server`：认证、数据库、仓储、审计、AI 运行时等服务端逻辑。
- `src/server/db/schema.ts`：Drizzle 数据库 schema。
- `drizzle/`：Drizzle 迁移文件。
- `package.json`：应用构建、启动、迁移、种子脚本。

## 1. 前置条件

服务器需要安装：

- Docker
- Docker Compose v2

建议生产环境放在反向代理后面，例如 Nginx、Caddy、Traefik。应用本身可以在 HTTP 下运行，但公网生产环境仍建议由反向代理提供 HTTPS。

## 2. 需要的环境变量

创建生产环境变量文件：

```bash
cp .env.local .env.production
```

生产环境至少需要配置：

```env
DATABASE_URL=postgresql://styx:change-me@postgres:5432/styx
PORT=5000
HOSTNAME=0.0.0.0
NODE_ENV=production
COZE_PROJECT_ENV=PROD

STYX_ADMIN_AUTH_SECRET=replace-with-a-long-random-secret
STYX_ADMIN_ACCOUNTS_JSON=[{"userId":"00000000-0000-4000-8000-000000000001","username":"admin","passwordHash":"<sha256-password-hash>","phone":"13800000000","allowWhitelistBypass":true}]
STYX_TRANSPORT_SECURITY_MODE=compatible
```

可选变量：

```env
STYX_OPENAI_COMPAT_PROXY_URL=http://proxy:10808
```

如果需要在 HTTP 部署下减少敏感请求被动抓包风险，生成并配置请求加密密钥：

```bash
node scripts/generate-request-encryption-keypair.mjs
```

把输出加入 `.env.production`：

```env
STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL=<server-private-key>
NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL=<client-public-key>
NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID=default
```

说明：

- `STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL` 只允许存在于服务端环境。
- `NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL` 会暴露给 Web 客户端，也可以内置到 App/Desktop 客户端。
- 该应用层加密用于降低被动抓包风险；HTTP Web 页面仍不能防主动中间人替换前端代码。

说明：

- `DATABASE_URL` 在 Compose 网络里应指向数据库服务名 `postgres`。
- `STYX_ADMIN_AUTH_SECRET` 必须使用足够长的随机字符串。
- `STYX_ADMIN_ACCOUNTS_JSON` 配置管理端账号白名单。
- `STYX_TRANSPORT_SECURITY_MODE` 可选值为 `strict`、`compatible`、`insecure`。如果没有 HTTPS，建议先使用 `compatible`，避免业务不可用。
- 生产环境不要开启 `STYX_ENABLE_DEV_AUTH`。

生成管理端密码 hash：

```bash
node -e "console.log(require('crypto').createHash('sha256').update('你的管理端密码').digest('hex'))"
```

## 3. Dockerfile 示例

当前仓库没有内置 Dockerfile。可以在项目根目录新增：

```Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV COZE_PROJECT_ENV=PROD
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/server/db ./src/server/db
COPY --from=builder /app/src/server/db/schema.ts ./src/server/db/schema.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 5000
CMD ["pnpm", "start"]
```

注意：迁移脚本 `pnpm db:migrate` 依赖 `src/server/db/migrate.ts` 和 `drizzle/`，所以上面的 runner 阶段保留了这些文件。

## 4. docker-compose.yml 示例

在项目根目录新增：

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: styx-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: styx
      POSTGRES_USER: styx
      POSTGRES_PASSWORD: change-me
    volumes:
      - styx-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U styx -d styx"]
      interval: 10s
      timeout: 5s
      retries: 10

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: styx-app
    restart: unless-stopped
    env_file:
      - .env.production
    environment:
      DATABASE_URL: postgresql://styx:change-me@postgres:5432/styx
      HOSTNAME: 0.0.0.0
      PORT: 5000
      NODE_ENV: production
      COZE_PROJECT_ENV: PROD
    ports:
      - "5000:5000"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  styx-postgres-data:
```

如果你使用反向代理，通常只需要把 `5000` 暴露给内网，公网入口由反向代理负责。

## 5. 首次部署流程

构建镜像：

```bash
docker compose build
```

启动数据库：

```bash
docker compose up -d postgres
```

执行数据库迁移：

```bash
docker compose run --rm app pnpm db:migrate
```

初始化种子数据：

```bash
docker compose run --rm app pnpm db:seed
```

启动应用：

```bash
docker compose up -d app
```

查看日志：

```bash
docker compose logs -f app
```

访问：

```text
http://服务器IP:5000
```

管理端入口：

```text
http://服务器IP:5000/admin
```

## 6. 后续升级流程

拉取新代码后执行：

```bash
docker compose build app
docker compose run --rm app pnpm db:migrate
docker compose up -d app
```

如果 schema 或初始化数据有变化，并且你确认需要刷新种子数据：

```bash
docker compose run --rm app pnpm db:seed
```

注意：`db:seed` 是初始化和补齐基础数据用的，不建议在不了解影响的情况下频繁对生产库执行。

## 7. 数据备份与恢复

备份：

```bash
docker compose exec postgres pg_dump -U styx -d styx > styx-backup.sql
```

恢复：

```bash
cat styx-backup.sql | docker compose exec -T postgres psql -U styx -d styx
```

生产环境升级前建议先备份数据库。

## 8. 常见问题

### 8.1 `DATABASE_URL is required`

说明容器没有读到 `DATABASE_URL`。检查：

```bash
docker compose config
docker compose exec app env | grep DATABASE_URL
```

Compose 内部连接 PostgreSQL 应使用服务名：

```env
DATABASE_URL=postgresql://styx:change-me@postgres:5432/styx
```

不要在容器里使用本机的 `localhost:5432` 连接数据库，除非数据库也运行在同一个容器中。

### 8.2 应用启动后数据库表不存在

说明没有执行迁移。执行：

```bash
docker compose run --rm app pnpm db:migrate
```

### 8.3 管理端无法登录

检查：

- `STYX_ADMIN_AUTH_SECRET` 是否配置。
- `STYX_ADMIN_ACCOUNTS_JSON` 是否是合法 JSON。
- `passwordHash` 是否为管理端密码的 SHA-256。
- `userId` 对应用户是否存在且拥有 `owner`、`admin` 或 `operator` 角色。
- 是否执行过 `pnpm db:seed` 或自行创建了对应用户和角色。

### 8.4 没有 HTTPS 时接口不可用

检查：

```env
STYX_TRANSPORT_SECURITY_MODE=compatible
```

如果设置为 `strict`，非本地 HTTP 请求可能会被拒绝。没有 HTTPS 的部署可以先使用 `compatible`，业务可用后再通过反向代理补 HTTPS。

### 8.5 端口冲突

如果服务器 5000 端口被占用，可以改 Compose 端口映射：

```yaml
ports:
  - "8080:5000"
```

然后访问：

```text
http://服务器IP:8080
```

## 9. 推荐生产拓扑

推荐结构：

```text
用户浏览器
  -> 反向代理/Nginx/Caddy，负责 HTTPS、域名、压缩、访问日志
  -> styx-app:5000
  -> styx-postgres:5432
```

数据库卷 `styx-postgres-data` 必须持久化，并纳入备份策略。

## 10. OrbStack 本地构建、导出镜像并部署到 CentOS

本节适用于：在本地 macOS + OrbStack 构建镜像，导出为 `.tar` 文件，上传到 CentOS 服务器后直接启动。服务器不需要放置完整源码，只需要镜像包、Compose 文件和环境变量文件。

### 10.1 确认目标服务器 CPU 架构

先在 CentOS 服务器执行：

```bash
uname -m
```

常见结果：

- `x86_64`：构建平台使用 `linux/amd64`。
- `aarch64`：构建平台使用 `linux/arm64`。

如果你的本地 Mac 是 Apple Silicon，而服务器是常见的 CentOS x86_64，必须按 `linux/amd64` 构建，否则服务器可能无法运行镜像。

后续示例默认服务器是 `x86_64`：

```bash
export TARGET_PLATFORM=linux/amd64
export APP_IMAGE=styx-webui:prod-$(date +%Y%m%d%H%M)
```

### 10.2 本地准备 Dockerfile 和环境变量

在项目根目录确认已经按本文第 3 节新增 `Dockerfile`。

准备生产环境变量文件：

```bash
cp .env.local .env.production
```

编辑 `.env.production`，至少确认以下值：

```env
DATABASE_URL=postgresql://styx:change-me@postgres:5432/styx
PORT=5000
HOSTNAME=0.0.0.0
NODE_ENV=production
COZE_PROJECT_ENV=PROD

STYX_ADMIN_AUTH_SECRET=replace-with-a-long-random-secret
STYX_ADMIN_ACCOUNTS_JSON=[{"userId":"00000000-0000-4000-8000-000000000001","username":"admin","passwordHash":"<sha256-password-hash>","phone":"13800000000","allowWhitelistBypass":true}]
STYX_TRANSPORT_SECURITY_MODE=compatible
```

生成管理端密码 hash：

```bash
node -e "console.log(require('crypto').createHash('sha256').update('你的管理端密码').digest('hex'))"
```

生产环境不要设置 `STYX_ENABLE_DEV_AUTH=true`。

### 10.3 在 OrbStack 本地构建应用镜像

在项目根目录执行：

```bash
docker buildx build \
  --platform "$TARGET_PLATFORM" \
  -t "$APP_IMAGE" \
  --load \
  .
```

确认镜像存在：

```bash
docker image ls "$APP_IMAGE"
```

如果服务器不能访问 Docker Hub，还需要提前拉取并导出 PostgreSQL 镜像：

```bash
docker pull --platform "$TARGET_PLATFORM" postgres:16-alpine
```

### 10.4 本地导出镜像包

创建导出目录：

```bash
mkdir -p deploy-artifacts
```

导出应用镜像：

```bash
docker save "$APP_IMAGE" | gzip > "deploy-artifacts/${APP_IMAGE//:/-}.tar.gz"
```

如果服务器不能联网拉取 PostgreSQL 镜像，同时导出数据库镜像：

```bash
docker save postgres:16-alpine | gzip > deploy-artifacts/postgres-16-alpine.tar.gz
```

记录应用镜像名，后续服务器 Compose 文件要使用同一个值：

```bash
echo "$APP_IMAGE" > deploy-artifacts/app-image.txt
```

### 10.5 准备服务器 Compose 文件

在本地创建 `deploy-artifacts/docker-compose.prod.yml`，注意把 `image` 替换为 `app-image.txt` 里的应用镜像名：

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: styx-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: styx
      POSTGRES_USER: styx
      POSTGRES_PASSWORD: change-me
    volumes:
      - styx-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U styx -d styx"]
      interval: 10s
      timeout: 5s
      retries: 10

  app:
    image: styx-webui:prod-YYYYMMDDHHMM
    container_name: styx-app
    restart: unless-stopped
    env_file:
      - .env.production
    environment:
      DATABASE_URL: postgresql://styx:change-me@postgres:5432/styx
      HOSTNAME: 0.0.0.0
      PORT: 5000
      NODE_ENV: production
      COZE_PROJECT_ENV: PROD
    ports:
      - "5000:5000"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  styx-postgres-data:
```

这里不要使用 `build:`，因为服务器只加载并运行已经导出的镜像。

复制生产环境变量文件：

```bash
cp .env.production deploy-artifacts/.env.production
```

### 10.6 上传到 CentOS 服务器

示例服务器目录：

```bash
ssh root@服务器IP "mkdir -p /opt/styx"
scp deploy-artifacts/* root@服务器IP:/opt/styx/
scp deploy-artifacts/.env.production root@服务器IP:/opt/styx/.env.production
```

如果你使用非 root 用户，把路径和用户替换成实际值，并确保该用户可以运行 Docker。

### 10.7 CentOS 安装运行依赖

服务器需要 Docker Engine 和 Docker Compose v2。已安装可跳过。

检查：

```bash
docker --version
docker compose version
```

如果防火墙开启，并且暂时直接暴露 `5000` 端口：

```bash
firewall-cmd --permanent --add-port=5000/tcp
firewall-cmd --reload
```

生产环境更推荐只让反向代理对外暴露 HTTPS，再把流量转发到本机或内网的 `5000` 端口。

### 10.8 在 CentOS 加载镜像

进入部署目录：

```bash
cd /opt/styx
```

加载应用镜像：

```bash
gunzip -c styx-webui-prod-*.tar.gz | docker load
```

如果上传了 PostgreSQL 镜像，也加载它：

```bash
gunzip -c postgres-16-alpine.tar.gz | docker load
```

确认镜像已存在：

```bash
docker image ls | grep -E 'styx-webui|postgres'
```

### 10.9 首次启动和初始化数据库

先启动数据库：

```bash
docker compose -f docker-compose.prod.yml up -d postgres
```

执行迁移：

```bash
docker compose -f docker-compose.prod.yml run --rm app pnpm db:migrate
```

初始化种子数据：

```bash
docker compose -f docker-compose.prod.yml run --rm app pnpm db:seed
```

启动应用：

```bash
docker compose -f docker-compose.prod.yml up -d app
```

查看状态和日志：

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
```

访问：

```text
http://服务器IP:5000
http://服务器IP:5000/admin
```

### 10.10 后续升级流程

本地重新构建并导出新镜像：

```bash
export TARGET_PLATFORM=linux/amd64
export APP_IMAGE=styx-webui:prod-$(date +%Y%m%d%H%M)

docker buildx build \
  --platform "$TARGET_PLATFORM" \
  -t "$APP_IMAGE" \
  --load \
  .

mkdir -p deploy-artifacts
docker save "$APP_IMAGE" | gzip > "deploy-artifacts/${APP_IMAGE//:/-}.tar.gz"
echo "$APP_IMAGE" > deploy-artifacts/app-image.txt
```

更新 `docker-compose.prod.yml` 里的 `app.image` 为新镜像名，然后上传新的应用镜像包和 Compose 文件。

服务器加载新镜像：

```bash
cd /opt/styx
gunzip -c styx-webui-prod-*.tar.gz | docker load
```

升级前备份数据库：

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U styx -d styx > styx-backup-$(date +%Y%m%d%H%M).sql
```

执行迁移并重启应用：

```bash
docker compose -f docker-compose.prod.yml run --rm app pnpm db:migrate
docker compose -f docker-compose.prod.yml up -d app
```

确认新容器正常后，可以清理不用的旧应用镜像：

```bash
docker image prune
```

### 10.11 CentOS 部署检查清单

- `docker compose -f docker-compose.prod.yml config` 能正常渲染配置。
- `.env.production` 中 `DATABASE_URL` 使用 `postgres` 服务名，而不是 `localhost`。
- `POSTGRES_PASSWORD` 和 `DATABASE_URL` 的密码一致。
- `docker compose -f docker-compose.prod.yml ps` 中 `postgres` 和 `app` 均为运行状态。
- `docker compose -f docker-compose.prod.yml logs app` 没有 `DATABASE_URL is required`、迁移缺失或端口监听错误。
- 如果没有 HTTPS，先使用 `STYX_TRANSPORT_SECURITY_MODE=compatible`。
- 管理端登录前确认 `STYX_ADMIN_ACCOUNTS_JSON` 是合法 JSON，且 `passwordHash` 是 SHA-256。

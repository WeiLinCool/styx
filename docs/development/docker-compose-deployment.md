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


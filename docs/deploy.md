# デプロイ手順

## 事前確認

```powershell
pnpm check
pnpm typecheck
pnpm test:workers
pnpm test:e2e
```

## 本番env生成

`.env.production`を更新してから生成します。`.env.production`はgit管理しません。

```powershell
Copy-Item .env.production.example .env.production
pnpm prod:env
```

主な値です。

- `ACCOUNT_URL`:account WorkerのURL
- `AUTH_APPS`:app定義。`session_verify_secret`はapp session secretと一致させます。
- `DOMAIN_NAME`:本番domain
- `SESSION_HMAC_SECRET`:account session署名secret
- `APP_SESSION_HMAC_SECRET`:app session署名secret
- `CSRF_HMAC_SECRET`:CSRF署名secret
- `OTP_HMAC_SECRET`:OTP hash secret
- Discord関連値

## 初回作成

初回はD1とR2を先に作成します。

```powershell
pnpm tf:init
pnpm tf:validate
terraform -chdir=infra apply -target=cloudflare_d1_database.auth -target=cloudflare_r2_bucket.assets
terraform -chdir=infra output d1_database_id
```

出力されたD1 IDを`workers/account/wrangler.toml`の`database_id`へ設定してcommitします。

## account Worker

```powershell
pnpm exec wrangler deploy --config workers/account/wrangler.toml
pnpm exec wrangler secret bulk .wrangler/env/production/account.vars --config workers/account/wrangler.toml
pnpm d1:migrations:list
pnpm d1:migrations:apply
terraform -chdir=infra apply
```

`0003_auth_code_session_persistent.sql`まで適用されていることを確認します。

## app Worker

`workers/app`はサンプルです。Cloudflareへdeployする場合だけ実行します。

```powershell
pnpm exec wrangler deploy --config workers/app/wrangler.toml
pnpm exec wrangler secret bulk .wrangler/env/production/app.vars --config workers/app/wrangler.toml
```

## ローカルD1更新

ローカルでschemaエラーが出た場合はmigrationを適用します。

```powershell
pnpm exec wrangler d1 migrations apply org-auth --local --config workers/account/wrangler.toml
```

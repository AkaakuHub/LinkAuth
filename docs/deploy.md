# 実行手順

## 事前確認

```powershell
pnpm check
pnpm typecheck
pnpm test:workers
pnpm test:e2e
```

## ローカル確認

`.env.local.example`から`.env.local`を作り、値を設定します。

```powershell
Copy-Item .env.local.example .env.local
pnpm dev:env
pnpm dev:seed
pnpm dev
```

生成ファイルは直接編集しません。

```txt
workers/account/.dev.vars
workers/app/.dev.vars
```

ローカルURLです。

| Worker | URL |
| --- | --- |
| account | `http://localhost:8787` |
| sample app | `http://localhost:8789` |

ローカルD1でschemaエラーが出た場合はmigrationを適用します。

```powershell
pnpm exec wrangler d1 migrations apply org-auth --local --config workers/account/wrangler.toml
```

## 本番env生成

`.env.production`を更新してから生成します。`.env.production`はgit管理しません。

```powershell
Copy-Item .env.production.example .env.production
pnpm prod:env
```

主な値です。

共通値です。

- `ACCOUNT_URL`:account WorkerのURL
- `DOMAIN_NAME`:本番domain
- `SESSION_KID`:account/app session署名key ID

account Worker用の値です。

- `AUTH_APPS`:認可するapp定義。複数appは配列へ追加し、各`session_verify_secret`は該当appの`APP_SESSION_HMAC_SECRET`と一致させます。
- `SESSION_HMAC_SECRET`:account session署名secret
- `CSRF_HMAC_SECRET`:CSRF署名secret
- `OTP_HMAC_SECRET`:OTP hash secret
- Discord関連値

サンプルapp Worker用の値です。

- `APP_ID`:このenvから生成するapp Workerのapp ID
- `APP_SESSION_HMAC_SECRET`:`APP_ID`に対応するapp session署名secret

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

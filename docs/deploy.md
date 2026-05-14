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
pnpm dev:seed -- --discord-id <your-discord-user-id>
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
pnpm exec wrangler d1 migrations apply link-auth --local --config workers/account/wrangler.toml
```

## 本番env生成

`.env.production`を更新してから生成します。`.env.production`はgit管理しません。

```powershell
Copy-Item .env.production.example .env.production
pnpm prod:env
```

`pnpm prod:env`は`.wrangler/env/production/account.vars`と`infra/terraform.tfvars`を生成します。環境ごとの値は`.env.production`へ集約し、生成ファイルは直接編集しません。

主な値です。

共通値です。

- `ACCOUNT_URL`:account WorkerのURL
- `DOMAIN_NAME`:本番domain
- `SESSION_KID`:account/app session署名key ID

Cloudflare用の値です。

- `CLOUDFLARE_API_TOKEN`:Terraform用Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`:Cloudflare account ID
- `CLOUDFLARE_ZONE_ID`:Cloudflare zone ID
- `CLOUDFLARE_ACCOUNT_CLEANUP_CRON`:期限切れ認証データ削除schedule

account Worker用の値です。

- `AUTH_APPS`:認可するapp定義。複数appは配列へ追加し、各`session_verify_secret`は該当app側の`APP_SESSION_HMAC_SECRET`と一致させます。
- `SESSION_HMAC_SECRET`:account session署名secret
- `CSRF_HMAC_SECRET`:CSRF署名secret
- `OTP_HMAC_SECRET`:OTP hash secret
- Discord関連値

`workers/app`は利用方法を示すローカルサンプルであり、本番へdeployしません。

secret値は32bytes以上の乱数を使います。`SESSION_HMAC_SECRET`、各appの`APP_SESSION_HMAC_SECRET`、`CSRF_HMAC_SECRET`、`OTP_HMAC_SECRET`は別々に生成します。

Windows PowerShellです。

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

macOSです。

```sh
openssl rand -base64 32
```

## 初回作成

初回はD1とR2を先に作成します。`infra/terraform.tfvars`は`pnpm prod:env`で生成済みにします。

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

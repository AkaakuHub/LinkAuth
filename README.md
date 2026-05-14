# LinkAuth

外部アカウント連携を扱う、Cloudflare Workers、D1、R2構成の認証システムです。

## 実装範囲

- `workers/`: アカウント管理Worker、ローカル確認用サービスWorker
- `workers/account/migrations/`: D1 schema migration
- `src/`: link-authライブラリ

## 設定

必要な値は環境ごとの`.env.*`に設定します。ローカルは`.env.local.example`から`.env.local`を作り、本番は`.env.production.example`から`.env.production`を作ります。Worker用のenvファイルは、環境ごとの`.env.*`から生成します。

`.env.*`は、共通値、account Worker用、サンプルapp Worker用に分けて書いています。`AUTH_APPS`はaccount Worker用の認可app一覧です。`APP_ID`と`APP_SESSION_HMAC_SECRET`はサンプルapp Worker用です。`AUTH_APPS`内の該当appの`session_verify_secret`は、そのapp Workerの`APP_SESSION_HMAC_SECRET`と同じ値にします。

複数appがある場合は`AUTH_APPS`へappごとに追加し、`.env.*`の`APP_ID`で今回生成するサンプルapp Workerを選びます。`session_verify_secret`がないappは`/token`と`/session/verify`で拒否されます。

## ローカル確認

初回は`.env.local`を作成します。内容は`.env.local.example`を見てください。

```powershell
Copy-Item .env.local.example .env.local
```

`.env.local`を編集したら、各Worker用のenvファイルを生成します。

```powershell
pnpm dev:env
```

生成されるファイルは次です。secretは`.env.local`の1か所だけを編集し、生成ファイルを直接編集しません。

```txt
workers/account/.dev.vars
workers/app/.dev.vars
```

初回とローカルD1削除後は、`.env.local`の`LOCAL_DISCORD_ID`を使ってログイン対象ユーザーを投入します。

```powershell
pnpm dev:seed
```

通常のローカル起動はこれだけです。

```powershell
pnpm dev
```

`pnpm dev`は、設定生成、client/style生成、`account`Worker、ローカル確認用`service`Workerをまとめて起動します。

ポートは次です。

| Worker | URL |
| --- | --- |
| account | `http://localhost:8787` |
| service | `http://localhost:8789` |

`http://localhost:8787`は`account.akaaku.net`相当のアカウント管理サイトです。OAuth2の`/login`と`/callback`も同じWorkerで受けます。

`http://localhost:8789`はローカル確認用の呼び出し元サービス例です。Cloudflareへデプロイする対象ではありません。

`8789`は未ログイン時に`8787/authorize`へリダイレクトします。ログイン後はapp専用セッションCookieを発行して`8789`へ戻ります。`8789`からアカウント管理へ移動した場合、ログアウト後もDiscord OAuth2ではなく`8789`のトップへ戻ります。

OAuth、D1連携、R2連携を含む操作はsecretとCloudflareリソースが必要です。画面だけ確認する場合も、ログイン後のページは実セッションCookieがないとリダイレクトします。

Discord OAuth2をローカルと本番の両方で試す場合は、Discord Developer PortalのOAuth2 Redirectsに両方を登録してください。

```txt
http://localhost:8787/callback
https://account.<your-domain>/callback
```

## Cloudflare設定

運用手順だけを確認する場合は`docs/deploy.md`も見てください。

Terraformで管理するCloudflareリソースは次です。

- D1 database: `org-auth`
- R2 bucket: `org-auth-assets`
- account Worker custom domain: `account.<domain>`
- account Worker cron trigger: expired auth data cleanup

初回はWorkerサービスがまだ存在しないため、D1とR2だけを先に作成します。`infra/terraform.tfvars.example`を`infra/terraform.tfvars`へ写して、Cloudflareの値を設定します。

```powershell
Copy-Item infra/terraform.tfvars.example infra/terraform.tfvars
pnpm tf:init
pnpm tf:validate
terraform -chdir=infra apply -target=cloudflare_d1_database.auth -target=cloudflare_r2_bucket.assets
```

TerraformはWorkerのsecretを管理しません。Terraform stateにsecret値を残さないためです。Workerコードのdeployとsecret設定はWranglerで行います。

account WorkerのD1 bindingは`workers/account/wrangler.toml`の`database_id`へ実際のD1 database IDを設定します。`database_id`はsecretではないため、共有する本番D1が決まったらgit管理対象としてcommitします。リポジトリ内の`00000000-0000-0000-0000-000000000000`はプレースホルダーです。

D1 database IDはTerraform apply後に出る`d1_database_id`です。出力を再表示する場合は次を使います。

```powershell
terraform -chdir=infra output d1_database_id
```

本番用の値は`.env.production`に設定します。`.env.local`はローカル専用です。

```powershell
Copy-Item .env.production.example .env.production
pnpm prod:env
```

`pnpm prod:env`は`.wrangler/env/production/account.vars`と`.wrangler/env/production/app.vars`を生成します。生成ファイルを直接編集しません。

`workers/account/wrangler.toml`の`database_id`を置き換えたら、account Workerをdeployし、生成済みの本番envファイルをsecretとして登録します。

```powershell
pnpm exec wrangler deploy --config workers/account/wrangler.toml
pnpm exec wrangler secret bulk .wrangler/env/production/account.vars --config workers/account/wrangler.toml
```

D1 schemaは本番D1へmigrationを適用します。

```powershell
pnpm d1:migrations:list
pnpm d1:migrations:apply
```

account Workerのdeploy、secret登録、D1 migration適用後に、custom domainとcron triggerを作成します。

```powershell
terraform -chdir=infra apply
```

account Workerには`.wrangler/env/production/account.vars`から次のsecretを登録します。

```txt
ACCOUNT_URL
AUTH_APPS
CSRF_HMAC_SECRET
CSRF_KID
DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_GUILD_IDS
DISCORD_PUBLIC_KEY
DOMAIN_NAME
LINK_AUTH_ENV
OTP_HMAC_SECRET
SESSION_HMAC_SECRET
SESSION_KID
```

ローカル確認用のapp WorkerをCloudflareへdeployする場合だけ、同じ`.env.production`から生成した`.wrangler/env/production/app.vars`を使います。

```powershell
pnpm exec wrangler deploy --config workers/app/wrangler.toml
pnpm exec wrangler secret bulk .wrangler/env/production/app.vars --config workers/app/wrangler.toml
```

app Workerには`.wrangler/env/production/app.vars`から次のsecretを登録します。

```txt
ACCOUNT_URL
APP_ID
APP_SESSION_HMAC_SECRET
DOMAIN_NAME
SESSION_KID
```

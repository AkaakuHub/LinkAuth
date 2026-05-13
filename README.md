# LinkAuth

外部アカウント連携を扱う、Cloudflare Workers、D1、R2構成の認証システムです。

## 実装範囲

- `workers/`: アカウント管理Worker、ローカル確認用サービスWorker
- `workers/account/migrations/`: D1 schema migration
- `shared/`: Cookie、HMAC、CSRFの共通処理

## 設定

必要な値は`.env.local.example`を見て、`.env.local`に設定します。ローカルWorker用のsecretは`.env.local`から生成します。

`AUTH_APPS`の各appには`session_verify_secret`が必要です。この値はapp Workerの`APP_SESSION_HMAC_SECRET`と同じ値にします。`session_verify_secret`がないappは`/token`と`/session/verify`で拒否されます。

## ローカル確認

初回は`.env.local`を作成します。内容は`.env.local.example`を見てください。

```powershell
Copy-Item .env.local.example .env.local
```

`.env.local`を編集したら、各Worker用の設定ファイルを生成します。

```powershell
pnpm dev:env
```

生成されるファイルは次です。secretは`.env.local`の1か所だけを編集します。

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

Terraformで管理するCloudflareリソースは次です。

- D1 database: `org-auth`
- R2 bucket: `org-auth-assets`
- account Worker custom domain: `account.<domain>`

初回は`infra/terraform.tfvars.example`を`infra/terraform.tfvars`へ写して、Cloudflareの値を設定します。

```powershell
Copy-Item infra/terraform.tfvars.example infra/terraform.tfvars
pnpm tf:init
pnpm tf:validate
terraform -chdir=infra apply
```

TerraformはWorkerのsecretを管理しません。Terraform stateにsecret値を残さないためです。Workerコードのdeployとsecret/vars設定はWranglerで行います。

account WorkerのD1 bindingは`workers/account/wrangler.toml`の`database_id`へ実際のD1 database IDを設定してからデプロイします。リポジトリ内の`00000000-0000-0000-0000-000000000000`はプレースホルダーです。

D1 database IDはTerraform apply後に出る`d1_database_id`です。

account Workerには次のsecret/varsを設定します。

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
OTP_HMAC_SECRET
SESSION_HMAC_SECRET
SESSION_KID
```

app Workerには次のsecret/varsを設定します。

```txt
ACCOUNT_URL
APP_ID
APP_SESSION_HMAC_SECRET
DOMAIN_NAME
SESSION_KID
```

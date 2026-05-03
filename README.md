# LinkAuth

外部アカウント連携を扱う、Cloudflare Workers、AWS Lambda、DynamoDB、Cloudflare Tunnel、Caddy構成の認証システムです。

## 実装範囲

- `infra/`: AWSとCloudflareリソースのTerraform定義
- `lambdas/`: Discord Interaction受信とWorker専用ユーザーAPI
- `workers/`: アカウント管理Worker、ローカル確認用サービスWorker
- `shared/`: Cookie、HMAC、内部API署名の共通処理

## 設定

必要な値は`.env.local.example`を見て、`.env.local`に設定します。Terraform、Workers、Docker Composeの設定ファイルは`.env.local`から生成します。

## デプロイ順

Workers Custom Domainは、対象Workerが先に存在している必要があります。初回はWranglerで`account`を一度デプロイしてからTerraformを適用してください。

## ローカル確認

ローカルでも本番に近い経路で確認するため、DynamoDB Localと`user-api`をDocker Composeで起動します。`user-api`はモックではなく、`lambdas/user-api/src/index.ts`と同じhandlerをHTTPで受けるローカルアダプタです。

初回は`.env.local`を作成します。内容は`.env.local.example`を見てください。

```powershell
Copy-Item .env.local.example .env.local
```

`.env.local`を編集したら、各ツール用の設定ファイルを生成します。

```powershell
pnpm dev:env
```

生成されるファイルは次です。secretは`.env.local`の1か所だけを編集します。

```txt
workers/account/.dev.vars
workers/app/.dev.vars
infra/terraform.tfvars
```

DynamoDB LocalはDocker volumeへ永続化します。初回とvolume削除後は、`.env.local`の`LOCAL_DISCORD_ID`を使ってログイン対象ユーザーを投入します。

```powershell
pnpm dev:seed
```

通常のローカル起動はこれだけです。

```powershell
pnpm dev
```

`pnpm dev`は、設定生成、DynamoDB Local、`user-api` local、`account` Worker、ローカル確認用`service` Workerをまとめて起動します。

ポートは次です。

| Worker | URL |
| --- | --- |
| account | `http://localhost:8787` |
| service | `http://localhost:8789` |

`http://localhost:8787`は`account.akaaku.net`相当のアカウント管理サイトです。OAuth2の`/login`と`/callback`も同じWorkerで受けます。

`http://localhost:8789`はローカル確認用の呼び出し元サービス例です。Cloudflareへデプロイする対象ではありません。

`8789`は未ログイン時に`8787/authorize`へリダイレクトします。ログイン後はapp専用セッションCookieを発行して`8789`へ戻ります。`8789`からアカウント管理へ移動した場合、ログアウト後もDiscord OAuth2ではなく`8789`のトップへ戻ります。

OAuth、DynamoDB連携、R2連携を含む操作はsecretと外部リソースが必要です。画面だけ確認する場合も、ログイン後のページは実セッションCookieがないとリダイレクトします。

Discord OAuth2をローカルと本番の両方で試す場合は、Discord Developer PortalのOAuth2 Redirectsに両方を登録してください。

```txt
http://localhost:8787/callback
https://account.<your-domain>/callback
```

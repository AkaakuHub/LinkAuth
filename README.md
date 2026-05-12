# LinkAuth

外部アカウント連携を扱う、Cloudflare Workers、D1、R2構成の認証システムです。

## 実装範囲

- `workers/`: アカウント管理Worker、ローカル確認用サービスWorker
- `workers/account/migrations/`: D1 schema migration
- `shared/`: Cookie、HMAC、CSRFの共通処理

## 設定

必要な値は`.env.local.example`を見て、`.env.local`に設定します。ローカルWorker用のsecretは`.env.local`から生成します。

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

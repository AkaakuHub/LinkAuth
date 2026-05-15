# LinkAuth

Cloudflare WorkersでLinkAuthアカウント基盤を利用するためのapp側ライブラリです。

## Install

```sh
npm install link-auth
```

## Usage

```ts
import { handleAppAuthRequest, loadLinkAuthAppConfig } from "link-auth";

export default {
  async fetch(request, env) {
    const config = loadLinkAuthAppConfig(env);

    return await handleAppAuthRequest({
      authFailedResponse: () => new Response("unauthorized", { status: 401 }),
      config,
      handleRequest: ({ user }) =>
        Response.json({
          discord_id: user.discord_id,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
        }),
      loginResponse: () => Response.redirect("/_auth/account", 302),
      request,
    });
  },
};
```

## Environment

```text
ACCOUNT_URL=https://account.example.com
APP_ID=your-app-id
APP_SESSION_HMAC_SECRET=your-app-session-secret
SESSION_KID=your-session-key-id
```

## API

### `loadLinkAuthAppConfig(env)`

app WorkerのenvからLinkAuth設定を読み込みます。

### `handleAppAuthRequest(input)`

ログイン開始、callback、ログアウト、現在ユーザー取得、app session検証をまとめて処理します。認証済みリクエストでは`handleRequest`に`LinkAuthUser`を渡します。

### `LinkAuthUser`

```ts
type LinkAuthUser = {
  discord_id: string;
  display_name: string;
  role: "user" | "admin";
  status: "active";
  avatar_url: string | null;
  icon_source: "r2" | "none";
  icon_key: string | null;
};
```

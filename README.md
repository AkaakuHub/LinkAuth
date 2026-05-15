# LinkAuth

Cloudflare WorkersでLinkAuthアカウント基盤を利用するためのapp側ライブラリです。

## Install

```sh
npm install link-auth
```

## Usage

### Cloudflare Workers

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

### 静的アセット・画像のlocal session検証

`localSessionOnly`を指定すると、対象リクエストではapp session cookieをWorker内で署名検証し、account Workerの`/session/verify`へ問い合わせません。画像や静的アセットのように大量リクエストが発生する経路で使用します。

```ts
import { handleAppAuthRequest, loadLinkAuthAppConfig } from "link-auth";

export default {
  async fetch(request, env) {
    const config = loadLinkAuthAppConfig(env);

    return await handleAppAuthRequest({
      authFailedResponse: () => new Response("unauthorized", { status: 401 }),
      config,
      handleRequest: ({ request }) => env.ASSETS.fetch(request),
      localSessionOnly: ({ url }) =>
        url.pathname.startsWith("/assets/") ||
        url.pathname.startsWith("/cards/"),
      loginResponse: () => Response.redirect("/_auth/account", 302),
      request,
    });
  },
};
```

local session検証で確認するのは、cookieの署名、期限、`app_id`です。ユーザーの無効化、削除、guild退出を即時反映するAPIや重要操作では、`getLinkAuthUser`または`handleAppAuthRequest`の通常検証を使います。

### APIサーバーのBearer token認証

`getLinkAuthUser`は、`Authorization: Bearer ...`またはapp session cookieを検証し、認証済みユーザーを返します。Bearer tokenには、LinkAuthのaccount画面で発行したPersonal Access Tokenを指定します。

```ts
import { getLinkAuthUser, loadLinkAuthAppConfig } from "link-auth";

const config = loadLinkAuthAppConfig(process.env);

async function authenticate(request: Request) {
  const user = await getLinkAuthUser({ config, request });

  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return Response.json({ user });
}
```

NestJSでは、受け取ったHTTPリクエストからWeb標準の`Request`を作って`getLinkAuthUser`へ渡します。

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { getLinkAuthUser, loadLinkAuthAppConfig } from "link-auth";

@Injectable()
export class LinkAuthGuard implements CanActivate {
  private readonly config = loadLinkAuthAppConfig(process.env);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const host = req.headers.host;
    const protocol = req.protocol ?? "https";
    const url = `${protocol}://${host}${req.originalUrl ?? req.url}`;
    const request = new Request(url, {
      headers: req.headers,
      method: req.method,
    });
    const user = await getLinkAuthUser({
      config: this.config,
      request,
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    req.linkAuthUser = user;
    return true;
  }
}
```

curlからは次のように呼び出します。

```sh
curl https://api.example.com/api/me \
  -H "Authorization: Bearer lka_pat_xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
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

`localSessionOnly`を指定したリクエストでは、app session cookieをlocal検証します。Bearer token単独ではlocal検証しません。

### `getLinkAuthUser(input)`

Web標準の`Request`からBearer tokenまたはapp session cookieを検証し、`LinkAuthUser`を返します。検証に失敗した場合は`null`を返します。

app session cookieでもaccount Workerの`/session/verify`へ問い合わせるため、account側の現在状態を確認できます。

### `getLinkAuthSessionUser(input)`

Web標準の`Request`からapp session cookieだけをlocal検証し、`LinkAuthUser`を返します。account Workerへ問い合わせません。検証に失敗した場合は`null`を返します。

### `getLinkAuthSessionToken(input)`

Web標準の`Request`からapp session cookieのtokenを取り出します。Bearer token単独では返しません。cookieとBearer tokenが両方あり、値が一致しない場合は`null`を返します。

### `getLinkAuthSessionCookieName(appId)`

app session cookie名を返します。

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

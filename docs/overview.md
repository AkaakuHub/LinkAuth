# LinkAuth概要

LinkAuthはDiscord認証、OTP、account画面、app向けセッション発行をまとめる認証基盤です。

## 構成

- `workers/account`:認証基盤本体です。Discord OAuth、OTP、account session、remember token、PAT、profile管理を担当します。
- `workers/app`:利用方法を示すローカルサンプルです。認証の中身は持たず、`link-auth`のapp認証ラッパーを呼びます。本番へdeployしません。
- `src`:利用アプリ向けのライブラリ公開APIです。

## 利用アプリ側API

利用アプリは次の関数だけを呼びます。

- `loadLinkAuthAppConfig`:app Workerのenvから認証設定を読む
- `handleAppAuthRequest`:ログイン開始、callback、ログアウト、現在ユーザー取得、認証検証をまとめて処理する

署名、state検証、code交換、Cookie発行、`/session/verify`呼び出しはライブラリ側で処理します。

## ログイン保持

| 条件 | account session | app session | remember cookie |
| --- | --- | --- | --- |
| remember meオン | 1日 | 180日 | 180日 |
| remember meオフ | 30分 | 30分 | 発行しない |

remember meオフではsession cookieを使い、署名payloadの`exp`も30分にします。Chromeがsession cookieを復元しても、30分後はサーバー側検証で拒否します。

remember meオンではremember cookieを`token_id.random_token`形式で発行します。`random_token`は平文保存せず、D1へSHA-256ハッシュだけを保存します。

## auth code

account Workerは認証済みユーザーに対してappごとのauth codeを発行します。auth codeは5分有効で、正しいappが1回だけ消費できます。

`/token`では`app_id`、`code`、`x-app-token-signature`を検証します。auth codeには`session_persistent`を保存し、app sessionの期限へ引き継ぎます。

## PAT

account画面からBearer tokenを発行できます。token本体は発行直後のmodalで一度だけ表示します。保存するのはtoken hashです。

# auth code仕様

## 発行

account Workerはappごとにauth codeを発行します。

auth codeの有効期限は5分です。

## 消費

appは`app_id`、`code`、`x-app-token-signature`をaccount Workerの`/token`へ送ります。

account Workerはapp secretで署名を検証してから、user-apiの`/auth-code/consume`を呼びます。

user-apiは`app_id`と期限を検証してからauth codeを削除します。

別app_id、期限切れ、存在しないcodeは失敗します。別app_idの失敗ではauth codeを削除しません。

auth codeは正しいappで1回だけ消費できます。

# セキュリティ仕様

## app保護

appサンプルの保護対象は必ず`handleAppAuthRequest`を通ります。

- `GET /`:未認証なら`/login`へredirectします。
- `GET /api/me`:未認証なら401です。
- その他`/api/*`:未認証なら401、認証済みでも未定義APIは404です。

`handleAppAuthRequest`はapp sessionの署名、`app_id`、Cookie/Bearer不一致を検証します。その後、account Workerの`/session/verify`でユーザーがactiveであることを確認します。app側のコードは検証済みの`user`だけを受け取ります。

## OTP

OTPは5分有効です。平文では保存せず、`challenge_id`とOTPをHMAC-SHA-256でハッシュ化してD1へ保存します。

OTP検証時は先にchallengeを削除します。間違えたOTP、期限切れ、使用済み、存在しないchallengeは失敗します。

## CSRF

account Workerのprofile、avatar、delete、logoutはCSRF検証を必須にします。

CSRF tokenはユーザー、origin、action、有効期限、key idを署名対象にします。POSTの`Origin`がaccount originと一致しない場合は拒否します。

## remember token

remember cookieで復元するときは、D1のremember tokenを照合してからaccount sessionを再発行します。成功時はremember tokenをrotateします。

復元に失敗したremember cookieは削除します。ログアウト、全端末ログアウト、ユーザー削除では該当remember tokenを削除します。

## 期限切れデータ

auth code、OTP、remember token、PATは検証時に期限を確認します。cleanupは期限切れデータを削除します。

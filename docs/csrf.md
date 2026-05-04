# CSRF仕様

## 対象

account Workerのprofile、avatar、delete、logoutはCSRF検証を必須にします。

## 検証

CSRF tokenはユーザー、origin、action、有効期限、key idを署名対象にします。

POSTの`Origin`がaccount originと一致しない場合は拒否します。

form送信は`csrf_token`、avatar更新は`x-csrf-token`を使います。

# remember cookie仕様

## 選択方法

OTP認証画面に`remember_me`チェックボックスを表示します。

初期状態はオンです。

## オンの場合

account WorkerはOTP検証成功後に、account session cookieとremember cookieを発行します。

remember cookieの値は`token_id.random_token`形式です。

account Workerは`random_token`を平文保存せず、SHA-256でハッシュ化した`token_hash`をuser-apiの`/remember/create`へ渡します。

remember cookieの有効期限は180日です。

## オフの場合

account WorkerはOTP検証成功後にaccount session cookieだけを発行します。

remember tokenは作成しません。

既存のremember cookieが残っている場合に備え、remember cookieは削除します。

## ログアウト

ログアウト時にremember cookieが存在する場合、account Workerはcookie内の`token_id`を使ってuser-apiの`/remember/delete`を呼びます。

その後、account session cookieとremember cookieを削除します。

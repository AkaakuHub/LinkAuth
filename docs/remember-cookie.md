# remember cookie仕様

## 選択方法

OTP認証画面に`remember_me`チェックボックスを表示します。

初期状態はオンです。

## オンの場合

account WorkerはOTP検証成功後に、account session cookieとremember cookieを発行します。

remember cookieの値は`token_id.random_token`形式です。

account Workerは`random_token`を平文保存せず、SHA-256でハッシュ化した`token_hash`をD1へ保存します。

remember tokenはactiveなユーザーに対してだけ作成します。

remember cookieの有効期限は180日です。

account session cookieが無効でremember cookieが有効な場合、account Workerは`token_id`でremember tokenを取得し、`random_token`のSHA-256ハッシュを保存済みの`token_hash`と照合します。成功した場合、account Workerはaccount session cookieを再発行し、remember cookieの`random_token`を更新します。

復元に失敗したremember cookieは、未認証応答で削除します。

## オフの場合

account WorkerはOTP検証成功後にaccount session cookieだけを発行します。

remember tokenは作成しません。

既存のremember cookieが残っている場合に備え、remember cookieは削除します。

## ログアウト

ログアウト時にremember cookieが存在する場合、account Workerはcookie内の`token_id`を使ってD1のremember tokenを削除します。

その後、account session cookieとremember cookieを削除します。

全端末ログアウトとユーザー削除では、対象ユーザーのremember tokenを全件削除します。

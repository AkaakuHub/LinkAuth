# app callback仕様

## state

app Workerはログイン開始時にstateを発行し、HttpOnly Cookieにも同じ値を保存します。

stateには`return_to`を含め、app session secretで署名します。

callbackではURLのstateとCookieのstateが一致し、署名と期限が有効な場合だけ続行します。

## return_to

app Workerはcallback URLの`return_to`を信用しません。

ログイン成功後は、stateに保存した`return_to`へ戻します。

`return_to`はappと同じoriginだけ許可します。fragmentは削除し、userinfo付きURLは拒否します。

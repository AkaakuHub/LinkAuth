# 内部API仕様

## 署名

Workerからuser-apiへのリクエストはHMAC署名します。

署名対象はmethod、path、query、body hash、key id、nonce、timestampです。

timestampの許容範囲は5分です。

nonceは1回だけ使用できます。

## method

user-apiは署名検証後、POST以外を拒否します。

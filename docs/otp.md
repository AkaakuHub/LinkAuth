# OTP仕様

## 有効期限

OTPの有効期限は5分です。

account WorkerはOTP challenge作成時に`expires_at = now + 300`をuser-apiへ渡します。

## 保存方法

OTPは平文では保存しません。

user-apiは`challenge_id`とOTPをHMAC-SHA-256でハッシュ化し、DynamoDBに`otp_hash`として保存します。

## 消費方法

OTP検証時は、最初にDynamoDBからchallengeを削除します。

削除前の値を使って、次の条件を確認します。

- challengeが存在すること
- `discord_id`が文字列であること
- `otp_hash`が文字列であること
- `expires_at`が現在時刻より後であること
- 入力されたOTPのハッシュが`otp_hash`と一致すること

## 失敗時の扱い

OTPを1回でも間違えると、そのchallengeは失効します。

検証前にchallengeを削除するため、間違えたあとに正しいOTPを入力しても通りません。

期限切れ、使用済み、存在しないchallengeも同じく失敗します。

## TTL

DynamoDB TTLは`expires_at`を見ます。

期限切れitemはDynamoDBのTTL対象になります。ただし、OTP検証時はTTL削除を待たず、`expires_at`を直接確認します。

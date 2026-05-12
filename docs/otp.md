# OTP仕様

## 有効期限

OTPの有効期限は5分です。

account WorkerはOTP challenge作成時に`expires_at = now + 300`をD1へ保存します。

## 保存方法

OTPは平文では保存しません。

account Workerは`challenge_id`とOTPをHMAC-SHA-256でハッシュ化し、D1の`otp_challenges.otp_hash`へ保存します。

`return_to`は絶対URLのみ受け付けます。userinfo付きURLは拒否します。

## 消費方法

OTP検証時は、最初にD1からchallengeを削除します。

削除前の値を使って、次の条件を確認します。

- challengeが存在すること
- `expires_at`が現在時刻より後であること
- 入力されたOTPのハッシュが`otp_hash`と一致すること

## 失敗時の扱い

OTPを1回でも間違えると、そのchallengeは失効します。

検証前にchallengeを削除するため、間違えたあとに正しいOTPを入力しても通りません。

期限切れ、使用済み、存在しないchallengeも同じく失敗します。

## 期限切れデータ

期限切れデータは、検証時に`expires_at`を直接確認して拒否します。

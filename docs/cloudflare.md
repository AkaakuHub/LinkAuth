# Cloudflare運用

## 管理対象

`workers/account/wrangler.toml`はgit管理します。

D1の`database_id`はsecretではありません。共有する本番D1が決まったら、`workers/account/wrangler.toml`へ実IDを入れてcommitします。

secret値はgit管理しません。環境ごとの`.env.*`を一元管理元にし、生成したenvファイルをWranglerへ登録します。

- ローカル: `.env.local`から`pnpm dev:env`で`workers/account/.dev.vars`と`workers/app/.dev.vars`を生成します。
- 本番: `.env.production`から`pnpm prod:env`で`.wrangler/env/production/account.vars`と`.wrangler/env/production/app.vars`を生成します。

## 初回作成順序

初回はWorkerサービスが存在しないため、TerraformではD1とR2だけを先に作成します。

```powershell
pnpm tf:init
pnpm tf:validate
terraform -chdir=infra apply -target=cloudflare_d1_database.auth -target=cloudflare_r2_bucket.assets
terraform -chdir=infra output d1_database_id
```

出力されたD1 IDを`workers/account/wrangler.toml`の`database_id`へ設定します。

`.env.production`へ本番値を設定してから、生成します。`.env.local`はローカル専用です。

```powershell
Copy-Item .env.production.example .env.production
pnpm prod:env
```

account Workerをdeployし、生成済みenvファイルをsecretとして登録します。

```powershell
pnpm exec wrangler deploy --config workers/account/wrangler.toml
pnpm exec wrangler secret bulk .wrangler/env/production/account.vars --config workers/account/wrangler.toml
```

D1 migrationを適用します。

```powershell
pnpm d1:migrations:list
pnpm d1:migrations:apply
```

最後にcustom domainとcron triggerを作成します。

```powershell
terraform -chdir=infra apply
```

## app Worker

`workers/app`はローカル確認用です。Cloudflareへdeployする場合だけ、同じ`.env.production`から生成した`.wrangler/env/production/app.vars`を登録します。

```powershell
pnpm exec wrangler deploy --config workers/app/wrangler.toml
pnpm exec wrangler secret bulk .wrangler/env/production/app.vars --config workers/app/wrangler.toml
```

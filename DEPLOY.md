# Deploy

## Neon

1. Create Neon project.
2. Copy pooled PostgreSQL URL with `sslmode=require`.
3. Run migrations:

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
npm run db:migrate
```

## Fly.io

Install/login:

```powershell
winget install Fly.Flyctl
fly auth login
```

Create app and volume:

```powershell
fly launch --name prospek-admin --region sin --no-deploy
fly volumes create prospek_data --size 3 --region sin
```

Set secrets:

```powershell
fly secrets set DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
fly secrets set ADMIN_EMAIL="you@example.com"
fly secrets set ADMIN_PASSWORD_HASH="salt:hash"
fly secrets set SESSION_SECRET="random-hex"
fly secrets set INGEST_API_KEY="random-hex"
fly secrets set APP_ORIGIN="https://YOUR-VERCEL-APP.vercel.app"
fly secrets set COOKIE_SECURE="1"
fly secrets set HEADLESS="1"
```

Deploy:

```powershell
fly deploy
fly logs
```

Health check:

```powershell
Invoke-RestMethod https://prospek-admin.fly.dev/api/auth/me
```

Expected: `401` with `Silakan login`.

## Vercel

Install/login:

```powershell
npm i -g vercel
vercel login
```

Project settings:

```text
Build Command: npm run build
Output Directory: apps/frontend/dist
Install Command: npm install
```

Deploy:

```powershell
vercel
vercel --prod
```

After final Vercel domain exists, update Fly origin:

```powershell
fly secrets set APP_ORIGIN="https://YOUR-FINAL.vercel.app"
fly deploy
```

## Smoke Test

1. Open Vercel URL.
2. Login.
3. Open `/overview`.
4. Open `/leads`.
5. Open `/scraping`.
6. Start a short scrape.
7. Watch `fly logs`.

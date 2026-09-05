# Deploy japanaddrDB API through Cloudflare Workers

This folder contains a lightweight Worker that proxies requests to your
self-hosted ABR API (default origin: `http://46.250.255.208:3000`).

The Worker provides:
- `/health`
- `/validate`
- existing routes in your backend (`/match`, `/geocode`, `/reverse`, `/normalize`, etc.)

## 1) Deploy with cURL API (no wrangler install required)

Create `deploy.ps1` and fill:
- `$ACCOUNT_ID`
- `$ZONE_ID`
- `$API_TOKEN` (Cloudflare token with Workers + Zone + Route permissions)
- `$SCRIPT_NAME` (for example `japanaddrdb-proxy`)
- `$PATTERN` (for example `api.yourdomain.com/*`)
- optional `$ORIGIN` (default `http://46.250.255.208:3000`)

Run:
```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

## 2) Quick smoke test after deploy
```bash
curl -s https://api.yourdomain.com/health
curl -G "https://api.yourdomain.com/validate" --data-urlencode "address=東京都千代田区紀尾井町1-3"
curl -s "https://api.yourdomain.com/geocode?address=東京都千代田区紀尾井町1-3"
```

If you want pure Worker + D1 later (for request log / cache), I can add a D1 binding version.

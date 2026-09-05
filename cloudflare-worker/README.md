# japanaddrdb Cloudflare gateway

This Worker exposes the self-hosted ABR geocoder at:

- https://japan-addr-db.temazero.ai
- https://japanaddrdb.temazero-ai-visibility.workers.dev

Account: `27d88de2194bdf53430bfc420bb7ac8c` (Temazeroai).
Worker: `japanaddrdb`.
Origin: `http://japanaddrdb-origin.temazero.ai:3000`.
The DNS-only origin A record points to `46.250.255.208`.

The ABR PostgreSQL data and DuckDB query cache remain on the server.
Uploading this Worker does not import the dataset into Cloudflare D1 or start
the server-side geocoder.

## Deployment

Use the connected Cloudflare MCP or run `deploy.ps1` after setting
`CLOUDFLARE_API_TOKEN` in the current process environment. Never save a token
in this repository. The token must have access to this account's Worker
scripts, zone Workers routes, and DNS records.

```powershell
.\cloudflare-worker\deploy.ps1
```

The script checks for conflicting records, creates the DNS-only origin if
missing, uploads the Worker with compatibility metadata, attaches a Custom
Domain (including managed DNS/TLS), and enables workers.dev. It removes only
the legacy exact `japan-addr-db.temazero.ai/*` route owned by this Worker.
Other Workers and their domains are not deployment targets.

Optional parameters include `-AccountId`, `-ZoneId`, `-ScriptName`,
`-Domain`, `-Origin`, and `-OriginIp`. Origin must use a different hostname
from the public Worker domain. Bare-IP fetches returned Cloudflare error 1003
during deployment testing.

## Verification

```bash
# Checks only that the Worker itself executes. It does not check address data.
curl -i https://japan-addr-db.temazero.ai/health/live

# Checks the real backend.
curl -i https://japan-addr-db.temazero.ai/health

# Checks address validation through the real backend.
curl -i -G https://japan-addr-db.temazero.ai/validate \
  --data-urlencode 'address=東京都千代田区紀尾井町1-3'
```

Check the backend's `exists` and `status` fields; HTTP 200 alone is not an
address-existence verdict. Building names and room numbers are outside ABR
coverage. A backend failure returns HTTP 502/504 with `status=unavailable`
and no `exists` field. Do not interpret this as an invalid address.

Requests have a 15-second upstream timeout. Redirects are not automatically
followed. Existing backend routes, including `/match`, `/geocode`,
`/reverse`, and `/normalize`, are forwarded with their path and query intact.

Local proxy regression checks:

```bash
node --test cloudflare-worker/worker.test.cjs
```

These checks mock the backend. They do not replace a live address lookup.

## If the backend is unreachable

On the ABR server, inspect the existing deployment first:

```bash
cd /opt/japanaddrDB
docker compose ps -a
docker compose logs --tail=80 abrg_app
curl -i http://127.0.0.1:3000/health
```

The current Compose service is `abrg_app`, under the `server` profile.
It requires a successfully built DuckDB cache in `abrg_cache`. Bare
`docker compose up -d` does not start that profiled service. Once the cache
has been verified, start the API with `docker compose up -d abrg_app`.
Do not delete Docker volumes or re-import the full dataset to troubleshoot a
network or container-startup problem.

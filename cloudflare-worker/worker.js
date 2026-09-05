addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  const url = new URL(request.url);
  if (url.pathname === "/health/live") {
    return new Response(JSON.stringify({ status: "ok", service: "japanaddrdb", scope: "worker" }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...corsHeaders() },
    });
  }

  // Cloudflare rejects HTTP fetches to a bare IP (1003). This DNS-only
  // hostname points at the ABR server and must not route back to this Worker.
  const upstream = new URL("http://japanaddrdb-origin.temazero.ai:3000");
  // Assign paths separately so an input beginning with // cannot change hosts.
  upstream.pathname = url.pathname;
  upstream.search = url.search;

  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

  const init = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  };

  try {
    const upstreamResponse = await fetch(upstream, init);
    if (upstreamResponse.status >= 500) {
      if (upstreamResponse.body) await upstreamResponse.body.cancel();
      return upstreamError("upstream_unavailable", 502, upstreamResponse.status);
    }
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set("x-proxied-by", "cf-worker");
    const cors = corsHeaders();
    for (const key of Object.keys(cors)) {
      responseHeaders.set(key, cors[key]);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const timedOut = init.signal.aborted;
    return upstreamError(timedOut ? "upstream_timeout" : "upstream_unreachable", timedOut ? 504 : 502);
  }
}

function upstreamError(error, status, upstreamStatus) {
  return new Response(JSON.stringify({
    status: "unavailable",
    error,
    ...(upstreamStatus === undefined ? {} : { upstream_status: upstreamStatus }),
  }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
  };
}

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

  const origin = "http://46.250.255.208:3000";
  const url = new URL(request.url);
  const upstream = new URL(url.pathname + url.search, origin);

  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

  const init = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "follow",
  };

  try {
    const upstreamResponse = await fetch(upstream, init);
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
    const message = error && error.message ? error.message : "upstream error";
    return new Response(
      JSON.stringify({ error: "upstream_unreachable", detail: message }),
      {
        status: 502,
        headers: Object.assign(
          { "content-type": "application/json; charset=utf-8" },
          corsHeaders(),
        ),
      },
    );
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
  };
}

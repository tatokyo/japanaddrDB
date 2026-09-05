export default {
  async fetch(request) {
    const method = request.method;
    if (method === "OPTIONS") {
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
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : request.body,
      redirect: "follow",
    };

    try {
      const upstreamResponse = await fetch(upstream, init);
      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.set("x-proxied-by", "cf-worker");
      for (const [k, v] of Object.entries(corsHeaders())) {
        responseHeaders.set(k, v);
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      const message = err && err.message ? err.message : "upstream error";
      return new Response(
        JSON.stringify({ error: "upstream_unreachable", detail: message }),
        {
          status: 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            ...corsHeaders(),
          },
        },
      );
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
  };
}

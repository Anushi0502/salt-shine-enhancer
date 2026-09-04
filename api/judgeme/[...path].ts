const JUDGEME_UPSTREAM_BASE = "https://api.judge.me/api/v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

const globalCacheKey = "__saltJudgeMeProxyCache";

function getCache() {
  const globalScope = globalThis;
  if (!globalScope[globalCacheKey]) {
    globalScope[globalCacheKey] = new Map();
  }

  return globalScope[globalCacheKey];
}

function normalizeUpstreamPath(rawPath) {
  const clean = String(rawPath || "").replace(/^\/+/, "");
  return clean.replace(/^api\/judgeme\/?/i, "").replace(/^\/+/, "");
}

function buildUpstreamUrl(req) {
  const incoming = new URL(req.url || "/api/judgeme", "http://localhost");
  const upstreamPath = normalizeUpstreamPath(incoming.pathname);
  const upstreamUrl = new URL(`${JUDGEME_UPSTREAM_BASE}/${upstreamPath}`);

  incoming.searchParams.forEach((value, key) => {
    if (key === "t") {
      return;
    }

    upstreamUrl.searchParams.append(key, value);
  });

  return upstreamUrl;
}

function buildCacheKey(method, upstreamUrl) {
  return `${method}:${upstreamUrl.toString()}`;
}

function buildCachedResponse(entry, stale = false) {
  return {
    status: entry.status,
    headers: {
      ...corsHeaders,
      ...entry.headers,
      "X-SALT-JudgeMe-Proxy": stale ? "stale" : "hit",
    },
    body: entry.body,
  };
}

async function readRequestBody(req) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return undefined;
  }

  if (typeof req.body === "string") {
    return req.body;
  }

  if (req.body == null) {
    return undefined;
  }

  return JSON.stringify(req.body);
}

function getBodyHeaders(req) {
  const headers: Record<string, string> = {};
  const contentType = req.headers?.["content-type"];

  if (contentType) {
    headers["Content-Type"] = Array.isArray(contentType) ? contentType[0] : contentType;
  }

  const accept = req.headers?.accept;
  if (accept) {
    headers.Accept = Array.isArray(accept) ? accept[0] : accept;
  }

  return headers;
}

function pickResponseHeaders(response) {
  const headers = {};
  const contentType = response.headers.get("content-type");
  const cacheControl = response.headers.get("cache-control");

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  if (cacheControl) {
    headers["Cache-Control"] = cacheControl;
  }

  return headers;
}

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const upstreamUrl = buildUpstreamUrl(req);
  if (!upstreamUrl.pathname || upstreamUrl.pathname === "/") {
    res.status(400).json({ error: "Missing Judge.me path" });
    return;
  }

  const cache = getCache();
  const cacheKey = buildCacheKey(req.method, upstreamUrl);
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (req.method === "GET" && cached && cached.expiresAt > now) {
    const cachedResponse = buildCachedResponse(cached);
    Object.entries(cachedResponse.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(cachedResponse.status).send(cachedResponse.body);
    return;
  }

  const body = await readRequestBody(req);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: req.method,
    headers: getBodyHeaders(req),
    body,
  });

  const responseText = await upstreamResponse.text();
  const responseHeaders = pickResponseHeaders(upstreamResponse);

  if (req.method === "GET" && upstreamResponse.ok) {
    cache.set(cacheKey, {
      status: upstreamResponse.status,
      headers: responseHeaders,
      body: responseText,
      expiresAt: now + CACHE_TTL_MS,
    });
  }

  if (req.method === "GET" && !upstreamResponse.ok && cached) {
    const staleResponse = buildCachedResponse(cached, true);
    Object.entries(staleResponse.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(staleResponse.status).send(staleResponse.body);
    return;
  }

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }

  Object.entries(responseHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  res.status(upstreamResponse.status).send(responseText);
}

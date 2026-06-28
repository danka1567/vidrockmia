const KEY = new TextEncoder().encode("x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9");

const PROXIES = [
  { host: "31.59.20.176",    port: 6754 },
  { host: "31.56.127.193",   port: 7684 },
  { host: "45.38.107.97",    port: 6014 },
  { host: "38.154.203.95",   port: 5863 },
  { host: "198.105.121.200", port: 6462 },
  { host: "64.137.96.74",    port: 6641 },
  { host: "198.23.243.226",  port: 6361 },
  { host: "38.154.185.97",   port: 6370 },
  { host: "142.111.67.146",  port: 5611 },
  { host: "191.96.254.138",  port: 6185 },
];

const PROXY_USER = "ygxmhkcc";
const PROXY_PASS = "n3batopqanpg";

async function aesEncrypt(plain) {
  const iv = KEY.slice(0, 16);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", KEY, { name: "AES-CBC" }, false, ["encrypt"]
  );

  const padLen = 16 - (plain.length % 16);
  const padded = new Uint8Array(plain.length + padLen);
  padded.set(plain);
  for (let i = plain.length; i < padded.length; i++) {
    padded[i] = padLen;
  }

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv }, cryptoKey, padded
  );

  return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function fetchViaProxy(targetUrl, headers, proxy) {
  // Route through HTTP proxy by calling proxy URL directly
  const proxyAuth = btoa(`${PROXY_USER}:${PROXY_PASS}`);
  const proxyUrl = `http://${proxy.host}:${proxy.port}`;

  const res = await fetch(targetUrl, {
    headers: {
      ...headers,
      "Proxy-Authorization": `Basic ${proxyAuth}`,
    },
    cf: {
      cacheEverything: false,
      resolveOverride: proxy.host,
    }
  });

  return res;
}

async function fetchWithFallback(targetUrl, headers) {
  // Shuffle proxies for load balancing
  const shuffled = [...PROXIES].sort(() => Math.random() - 0.5);

  for (const proxy of shuffled) {
    try {
      const res = await fetchViaProxy(targetUrl, headers, proxy);
      if (res.ok) {
        const data = await res.json();
        // Check if response is valid (not same cached garbage)
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
          return data;
        }
      }
    } catch (e) {
      // Proxy failed, try next
      continue;
    }
  }

  // All proxies failed, try direct as last resort
  const res = await fetch(targetUrl, { headers, cf: { cacheEverything: false } });
  if (!res.ok) throw new Error(`All proxies failed and direct request returned ${res.status}`);
  return await res.json();
}

async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  const plainStr = mediaType === "tv"
    ? `${tmdbId}_${season}_${episode}`
    : String(tmdbId);
  const plain = new TextEncoder().encode(plainStr);
  const token = await aesEncrypt(plain);

  const targetUrl = `https://vidrock.ru/api/${mediaType}/${token}`;
  const headers = {
    "Referer": `https://vidrock.ru/embed/${mediaType}/${tmdbId}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": "https://vidrock.ru",
    "Accept": "application/json, text/plain, */*",
  };

  return await fetchWithFallback(targetUrl, headers);
}

export default {
  async fetch(request) {
    const { searchParams } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        }
      });
    }

    const tmdbId = searchParams.get("tmdb_id");
    const mediaType = searchParams.get("media_type") || "movie";
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");

    if (!tmdbId) {
      return new Response(JSON.stringify({ error: "tmdb_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    try {
      const data = await getStreams(tmdbId, mediaType, season, episode);

      const streams = {};
      for (const [name, info] of Object.entries(data)) {
        if (info?.url) streams[name] = info.url;
      }

      const responseBody = Object.keys(streams).length > 0
        ? streams
        : { debug_raw: data };

      return new Response(JSON.stringify(responseBody), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};

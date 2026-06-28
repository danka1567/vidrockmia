const KEY = new TextEncoder().encode("x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9");

async function aesEncrypt(plain) {
  const iv = KEY.slice(0, 16);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", KEY, { name: "AES-CBC" }, false, ["encrypt"]
  );

  const padLen = 16 - (plain.length % 16);
  const padded = new Uint8Array(plain.length + padLen);
  padded.set(plain);
  padded.fill(padLen, plain.length);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv }, cryptoKey, padded
  );

  return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  const plainStr = mediaType === "tv"
    ? `${tmdbId}_${season}_${episode}`
    : String(tmdbId);
  const plain = new TextEncoder().encode(plainStr);
  const token = await aesEncrypt(plain);

  const url = `https://vidrock.ru/api/${mediaType}/${token}`;
  const res = await fetch(url, {
    headers: {
      "Referer": `https://vidrock.ru/embed/${mediaType}/${tmdbId}`,
      "User-Agent": "Mozilla/5.0"
    }
  });

  return await res.json();
}

export default {
  async fetch(request) {
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdb_id");
    const mediaType = searchParams.get("media_type") || "movie";
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");

    if (!tmdbId) {
      return new Response(JSON.stringify({ error: "tmdb_id is required" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    try {
      const data = await getStreams(tmdbId, mediaType, season, episode);

      // Filter to only entries with a url
      const streams = {};
      for (const [name, info] of Object.entries(data)) {
        if (info?.url) streams[name] = info.url;
      }

      return new Response(JSON.stringify(streams), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
  }
};

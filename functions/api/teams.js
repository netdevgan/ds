const CACHE_TTL = 86400; // 24h

export async function onRequestGet(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  const competition = (url.searchParams.get("competition") || "WC").toUpperCase();

  try {
    const cacheKey = `teams_${competition}_v1`;
    const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });
    let teams;
    let fromCache = false;

    if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL * 1000)) {
      teams = cached.data;
      fromCache = true;
    } else {
      const fdKey = env.FOOTBALL_DATA_KEY;
      if (!fdKey) throw new Error("Missing FOOTBALL_DATA_KEY");

      const resp = await fetch(`https://api.football-data.org/v4/competitions/${competition}/teams`, {
        headers: { "X-Auth-Token": fdKey },
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`API error (${resp.status}): ${errText || resp.statusText}`);
      }

      const data = await resp.json();
      const apiTeams = Array.isArray(data.teams) ? data.teams : [];
      teams = normalizeTeams(apiTeams);

      await env.WORLDCUP_KV.put(
        cacheKey,
        JSON.stringify({ data: teams, timestamp: Date.now() })
      );
    }

    return jsonResponse({
      success: true,
      competition,
      total: teams.length,
      cached: fromCache,
      generatedAt: new Date().toISOString(),
      data: teams,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function normalizeTeams(items) {
  return items
    .map((t) => ({
      id: t.id?.toString(),
      name: t.name || "Unknown",
      shortName: t.shortName || t.tla || t.name,
      badge: t.crest || null,
      country: t.area?.name || null,
      venue: t.venue || null,
      founded: t.founded || null,
      website: t.website || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=1800",
    },
  });
}

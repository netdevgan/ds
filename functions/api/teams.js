const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json";
const CACHE_TTL_SECONDS = 86400; // 24 hours

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const cacheKey = "teams_worldcup_2026";
    const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });

    let teams;
    let fromCache = false;

    if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL_SECONDS * 1000)) {
      teams = cached.data;
      fromCache = true;
    } else {
      const key = env.TSDB_KEY || "3";
      // List all teams in the FIFA World Cup 2026
      const apiUrl = `${TSDB_BASE}/${key}/lookup_all_teams.php?id=4424`;

      const upstream = await fetch(apiUrl, {
        headers: { Accept: "application/json" },
        cf: { cacheTtl: 3600 },
      });

      if (!upstream.ok) {
        throw new Error(`Upstream API error: ${upstream.status}`);
      }

      const data = await upstream.json();
      const items = Array.isArray(data.teams) ? data.teams : [];
      teams = normalizeTeams(items);

      await env.WORLDCUP_KV.put(
        cacheKey,
        JSON.stringify({ data: teams, timestamp: Date.now() })
      );
    }

    return jsonResponse({
      success: true,
      total: teams.length,
      cached: fromCache,
      generatedAt: new Date().toISOString(),
      data: teams,
    });
  } catch (error) {
    return jsonResponse(
      { success: false, error: error.message },
      500
    );
  }
}

function normalizeTeams(items) {
  return items
    .map((t) => ({
      id: t.idTeam,
      name: t.strTeam,
      shortName: t.strTeamShort || t.strTeam,
      badge: t.strTeamBadge,
      country: t.strCountry,
      formed: t.intFormedYear,
      stadium: t.strStadium,
      website: t.strWebsite,
      description: t.strDescriptionEN,
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

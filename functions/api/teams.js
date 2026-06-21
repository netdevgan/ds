const CACHE_TTL_SECONDS = 86400; // 24 hours

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const cacheKey = `teams_fd_wc2026_v1`;
    const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });
    let teams;
    let fromCache = false;

    if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL_SECONDS * 1000)) {
      teams = cached.data;
      fromCache = true;
    } else {
      const fdKey = env.FOOTBALL_DATA_KEY;
      if (!fdKey) {
        throw new Error("Missing FOOTBALL_DATA_KEY env variable. Get free key at https://www.football-data.org/client/register");
      }

      const upstream = await fetch("https://api.football-data.org/v4/competitions/WC/teams", {
        headers: { "X-Auth-Token": fdKey },
      });

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => "");
        throw new Error(`Football-Data.org API error (${upstream.status}): ${errText || upstream.statusText}`);
      }

      const data = await upstream.json();
      const apiTeams = Array.isArray(data.teams) ? data.teams : [];
      teams = normalizeTeams(apiTeams);

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
      id: t.id?.toString(),
      name: t.name || "Unknown",
      shortName: t.shortName || t.tla || t.name,
      badge: t.crest || null,
      country: t.area?.name || t.country || null,
      venue: t.venue || null,
      founded: t.founded || null,
      website: t.website || null,
      clubColors: t.clubColors || null,
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

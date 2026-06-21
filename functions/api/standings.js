const CACHE_TTL = 1800; // 30 min

export async function onRequestGet(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  const competition = (url.searchParams.get("competition") || "WC").toUpperCase();
  const group = url.searchParams.get("group") || null;

  try {
    const cacheKey = `standings_${competition}_v1`;
    const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });
    let standings;
    let fromCache = false;

    if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL * 1000)) {
      standings = cached.data;
      fromCache = true;
    } else {
      const fdKey = env.FOOTBALL_DATA_KEY;
      if (!fdKey) throw new Error("Missing FOOTBALL_DATA_KEY");

      const resp = await fetch(`https://api.football-data.org/v4/competitions/${competition}/standings`, {
        headers: { "X-Auth-Token": fdKey },
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`API error (${resp.status}): ${errText || resp.statusText}`);
      }

      const data = await resp.json();
      standings = normalizeStandings(data, competition);

      await env.WORLDCUP_KV.put(
        cacheKey,
        JSON.stringify({ data: standings, timestamp: Date.now() })
      );
    }

    let result = standings;
    if (group) result = result.filter((s) => s.group === group.toUpperCase());

    return jsonResponse({
      success: true,
      competition,
      group,
      total: result.length,
      cached: fromCache,
      generatedAt: new Date().toISOString(),
      data: result,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function normalizeStandings(data, competition) {
  const result = [];
  const st = data?.standings || [];

  for (const s of st) {
    if (s.type !== "TOTAL") continue;

    let groupLabel = null;
    if (s.group) {
      const m = s.group.match(/GROUP[_\s]?([A-Z])/i);
      groupLabel = m ? m[1].toUpperCase() : s.group.toUpperCase();
    }

    const rows = s.table || [];
    for (const row of rows) {
      result.push({
        rank: row.position,
        team: row.team?.name || "Unknown",
        teamBadge: row.team?.crest || null,
        group: groupLabel,
        competition,
        played: row.playedGames,
        won: row.won,
        drawn: row.draw,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        points: row.points,
        form: row.form || "",
      });
    }
  }

  result.sort((a, b) => {
    if (a.group !== b.group) return (a.group || "").localeCompare(b.group || "");
    if (b.points !== a.points) return b.points - a.points;
    return b.goalDifference - a.goalDifference;
  });

  return result;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=120, s-maxage=600",
    },
  });
}

const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json";
const CACHE_TTL_SECONDS = 7200; // 2 hours (standings update less frequently)

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const group = url.searchParams.get("group");

  try {
    const cacheKey = group ? `standings_group_${group}_2026` : `standings_all_2026`;
    const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });

    let standings;
    let fromCache = false;

    if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL_SECONDS * 1000)) {
      standings = cached.data;
      fromCache = true;
    } else {
      const key = env.TSDB_KEY || "3";
      // TheSportsDB league ID for FIFA World Cup may vary; 4424 is commonly referenced.
      const apiUrl = `${TSDB_BASE}/${key}/lookuptable.php?l=4424&s=2026-2027`;

      const upstream = await fetch(apiUrl, {
        headers: { Accept: "application/json" },
        cf: { cacheTtl: 600 },
      });

      if (!upstream.ok) {
        throw new Error(`Upstream API error: ${upstream.status}`);
      }

      const data = await upstream.json();
      const table = Array.isArray(data.table) ? data.table : [];
      standings = normalizeStandings(table);

      await env.WORLDCUP_KV.put(
        cacheKey,
        JSON.stringify({ data: standings, timestamp: Date.now() })
      );
    }

    let result = standings;
    if (group) {
      result = standings.filter((s) => s.group === group.toUpperCase());
    }

    // Sort by group name ASC, then points DESC, then goal difference DESC
    result.sort((a, b) => {
      if (a.group !== b.group) return (a.group || "").localeCompare(b.group || "");
      if (b.points !== a.points) return b.points - a.points;
      return b.goalDifference - a.goalDifference;
    });

    return jsonResponse({
      success: true,
      group,
      total: result.length,
      cached: fromCache,
      generatedAt: new Date().toISOString(),
      data: result,
    });
  } catch (error) {
    return jsonResponse(
      { success: false, error: error.message },
      500
    );
  }
}

function normalizeStandings(rows) {
  return rows.map((row) => ({
    rank: parseInt(row.intRank, 10) || null,
    team: row.strTeam,
    teamBadge: row.strTeamBadge || null,
    group: row.strGroup?.replace(/Group /i, "").toUpperCase() || null,
    played: parseInt(row.intPlayed, 10) || 0,
    won: parseInt(row.intWin, 10) || 0,
    drawn: parseInt(row.intDraw, 10) || 0,
    lost: parseInt(row.intLoss, 10) || 0,
    goalsFor: parseInt(row.intGoalsFor, 10) || 0,
    goalsAgainst: parseInt(row.intGoalsAgainst, 10) || 0,
    goalDifference: parseInt(row.intGoalDifference, 10) || 0,
    points: parseInt(row.intPoints, 10) || 0,
    form: row.strForm || "",
  }));
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

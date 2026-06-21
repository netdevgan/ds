const CACHE_TTL_SECONDS = 7200; // 2 hours

export async function onRequestGet(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  const group = url.searchParams.get("group") || null;

  try {
    const cacheKey = `standings_fd_wc2026_v1`;
    const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });
    let standings;
    let fromCache = false;

    if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL_SECONDS * 1000)) {
      standings = cached.data;
      fromCache = true;
    } else {
      const fdKey = env.FOOTBALL_DATA_KEY;
      if (!fdKey) {
        throw new Error("Missing FOOTBALL_DATA_KEY env variable. Get free key at https://www.football-data.org/client/register");
      }

      const upstream = await fetch("https://api.football-data.org/v4/competitions/WC/standings", {
        headers: { "X-Auth-Token": fdKey },
      });

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => "");
        throw new Error(`Football-Data.org API error (${upstream.status}): ${errText || upstream.statusText}`);
      }

      const data = await upstream.json();
      standings = normalizeStandings(data);

      await env.WORLDCUP_KV.put(
        cacheKey,
        JSON.stringify({ data: standings, timestamp: Date.now() })
      );
    }

    let result = standings;
    if (group) {
      result = standings.filter((s) => s.group === group.toUpperCase());
    }

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

function normalizeStandings(data) {
  const result = [];
  const standings = data?.standings || [];

  for (const st of standings) {
    if (st.type !== "TOTAL" && st.type !== "HOME" && st.type !== "AWAY") continue;
    if (st.type !== "TOTAL") continue; // only TOTAL tables

    let groupLabel = null;
    if (st.group) {
      const m = st.group.match(/GROUP[_\s]?([A-Z])/i);
      groupLabel = m ? m[1].toUpperCase() : st.group.toUpperCase();
    }
    if (!groupLabel && st.stage === "GROUP_STAGE") groupLabel = "A";
    if (!groupLabel) continue;

    const rows = st.table || [];
    for (const row of rows) {
      result.push({
        rank: row.position,
        team: row.team?.name || "Unknown",
        teamBadge: row.team?.crest || null,
        group: groupLabel,
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

  // Sort by group name ASC, points DESC, GD DESC
  result.sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group);
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

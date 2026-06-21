const FD_BASE = "https://api.football-data.org/v4";
const FD_TTL_SECONDS = 1800; // 30 min
const CACHE_TTL_SECONDS = 1800;

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "all";
  const group = url.searchParams.get("group") || null;

  try {
    const cacheKey = `matches_fd_wc2026_v1`;
    const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });
    let matches;
    let fromCache = false;

    if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL_SECONDS * 1000)) {
      matches = cached.data;
      fromCache = true;
    } else {
      const fdKey = env.FOOTBALL_DATA_KEY;
      if (!fdKey) {
        throw new Error("Missing FOOTBALL_DATA_KEY env variable. Get free key at https://www.football-data.org/client/register");
      }

      // Fetch World Cup matches (competition code WC for FIFA World Cup)
      const upstream = await fetch(`${FD_BASE}/competitions/WC/matches`, {
        headers: { "X-Auth-Token": fdKey },
      });

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => "");
        throw new Error(`Football-Data.org API error (${upstream.status}): ${errText || upstream.statusText}`);
      }

      const data = await upstream.json();
      const apiMatches = Array.isArray(data.matches) ? data.matches : [];
      matches = normalizeMatches(apiMatches);

      await env.WORLDCUP_KV.put(
        cacheKey,
        JSON.stringify({ data: matches, timestamp: Date.now() })
      );
    }

    let filtered = applyFilter(matches, filter, group);

    return jsonResponse({
      success: true,
      filter,
      group,
      total: filtered.length,
      cached: fromCache,
      generatedAt: new Date().toISOString(),
      data: filtered,
    });
  } catch (error) {
    return jsonResponse(
      { success: false, error: error.message },
      500
    );
  }
}

function normalizeMatches(apiMatches) {
  return apiMatches
    .map((m) => {
      const now = new Date();
      const kickoff = m.utcDate ? new Date(m.utcDate) : null;
      const status = inferStatus(m, kickoff, now);
      const homeScore = m.score?.fullTime?.home;
      const awayScore = m.score?.fullTime?.away;

      return {
        id: m.id?.toString(),
        homeTeam: m.homeTeam?.name || "TBD",
        awayTeam: m.awayTeam?.name || "TBD",
        homeScore: homeScore !== null && homeScore !== undefined ? homeScore : null,
        awayScore: awayScore !== null && awayScore !== undefined ? awayScore : null,
        date: kickoff ? formatDate(kickoff) : null,
        timeLocal: kickoff ? formatTime(kickoff) : null,
        datetimeUtc: kickoff ? kickoff.toISOString() : null,
        round: m.stage || m.matchday ? `Matchday ${m.matchday}` : null,
        group: extractGroup(m),
        venue: m.venue || null,
        city: null,
        country: null,
        status,
        homeBadge: null,
        awayBadge: null,
        video: null,
        season: m.season?.id?.toString(),
      };
    })
    .sort((a, b) => {
      if (!a.datetimeUtc) return 1;
      if (!b.datetimeUtc) return -1;
      return new Date(a.datetimeUtc) - new Date(b.datetimeUtc);
    });
}

function formatDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(d) {
  return d.toISOString().slice(11, 19);
}

function extractGroup(m) {
  if (!m.group) return null;
  // Football-Data returns "GROUP_A" or "GROUP A" format
  const match = m.group.match(/GROUP[_\s]?([A-Z])/i);
  return match ? match[1].toUpperCase() : null;
}

function inferStatus(m, kickoff, now) {
  // Football-Data statuses: SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, POSTPONED, CANCELLED, AWARDED
  const s = (m.status || "").toUpperCase();

  if (s === "FINISHED" || s === "AWARDED") return "finished";
  if (s === "IN_PLAY" || s === "PAUSED") return "live";
  if (s === "POSTPONED" || s === "CANCELLED") return "finished"; // treat as finished for UI
  if (s === "SCHEDULED" || s === "TIMED") {
    if (!kickoff) return "upcoming";
    const diffMin = (now - kickoff) / 60000;
    if (diffMin >= -5 && diffMin < 110) return "live";
    return "upcoming";
  }
  return "upcoming";
}

function applyFilter(matches, filter, group) {
  let result = matches;

  if (group) {
    result = result.filter((m) => m.group === group.toUpperCase());
  }

  if (filter === "upcoming") {
    result = result.filter((m) => m.status === "upcoming" || m.status === "live");
  } else if (filter === "finished") {
    result = result.filter((m) => m.status === "finished");
  } else if (filter === "live") {
    result = result.filter((m) => m.status === "live");
  }

  return result;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}

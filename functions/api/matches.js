const FD_BASE = "https://api.football-data.org/v4";
const CACHE_TTL = 600; // 10 min per competition

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const competition = (url.searchParams.get("competition") || "WC").toUpperCase();
  const filter = url.searchParams.get("filter") || "all";
  const group = url.searchParams.get("group") || null;

  try {
    const cacheKey = `matches_${competition}_v1`;
    const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });

    let matches;
    let fromCache = false;

    if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL * 1000)) {
      matches = cached.data;
      fromCache = true;
    } else {
      const fdKey = env.FOOTBALL_DATA_KEY;
      if (!fdKey) {
        throw new Error("Missing FOOTBALL_DATA_KEY");
      }

      const matchesResp = await fetch(`${FD_BASE}/competitions/${competition}/matches`, {
        headers: { "X-Auth-Token": fdKey },
      });

      if (!matchesResp.ok) {
        const errText = await matchesResp.text().catch(() => "");
        throw new Error(`API error (${matchesResp.status}): ${errText || matchesResp.statusText}`);
      }

      const data = await matchesResp.json();
      const apiMatches = Array.isArray(data.matches) ? data.matches : [];
      const crestMap = await fetchTeamCrests(env, fdKey, competition);
      matches = normalizeMatches(apiMatches, crestMap, competition);

      await env.WORLDCUP_KV.put(
        cacheKey,
        JSON.stringify({ data: matches, timestamp: Date.now() })
      );
    }

    let filtered = applyFilter(matches, filter, group);

    return jsonResponse({
      success: true,
      competition,
      filter,
      group,
      total: filtered.length,
      cached: fromCache,
      generatedAt: new Date().toISOString(),
      data: filtered,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

async function fetchTeamCrests(env, fdKey, competition) {
  const cacheKey = `crests_${competition}_v1`;
  const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });
  if (cached && cached.timestamp && (Date.now() - cached.timestamp < 86400000)) {
    return cached.data;
  }

  try {
    const resp = await fetch(`${FD_BASE}/competitions/${competition}/teams`, {
      headers: { "X-Auth-Token": fdKey },
    });
    if (!resp.ok) return {};

    const data = await resp.json();
    const teams = Array.isArray(data.teams) ? data.teams : [];
    const map = {};
    for (const t of teams) {
      const crest = t.crest;
      if (!crest) continue;
      if (t.name) map[t.name.toLowerCase()] = crest;
      if (t.shortName) map[t.shortName.toLowerCase()] = crest;
      if (t.tla) map[t.tla.toLowerCase()] = crest;
    }

    await env.WORLDCUP_KV.put(cacheKey, JSON.stringify({ data: map, timestamp: Date.now() }));
    return map;
  } catch {
    return {};
  }
}

function normalizeMatches(apiMatches, crestMap = {}, competition = "WC") {
  return apiMatches
    .map((m) => {
      const now = new Date();
      const kickoff = m.utcDate ? new Date(m.utcDate) : null;
      const status = inferStatus(m, kickoff, now);
      const homeScore = m.score?.fullTime?.home;
      const awayScore = m.score?.fullTime?.away;
      const homeTeam = m.homeTeam?.name || "TBD";
      const awayTeam = m.awayTeam?.name || "TBD";

      return {
        id: m.id?.toString(),
        competition,
        homeTeam,
        awayTeam,
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
        stage: m.stage || null,
        status,
        homeBadge: crestMap[homeTeam.toLowerCase()] || crestMap[m.homeTeam?.shortName?.toLowerCase()] || null,
        awayBadge: crestMap[awayTeam.toLowerCase()] || crestMap[m.awayTeam?.shortName?.toLowerCase()] || null,
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
  const match = m.group.match(/GROUP[_\s]?([A-Z])/i);
  return match ? match[1].toUpperCase() : null;
}

function inferStatus(m, kickoff, now) {
  const s = (m.status || "").toUpperCase();
  if (s === "FINISHED" || s === "AWARDED") return "finished";
  if (s === "IN_PLAY" || s === "PAUSED") return "live";
  if (s === "POSTPONED" || s === "CANCELLED") return "finished";
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
  if (group) result = result.filter((m) => m.group === group.toUpperCase());
  if (filter === "upcoming") result = result.filter((m) => m.status === "upcoming" || m.status === "live");
  else if (filter === "finished") result = result.filter((m) => m.status === "finished");
  else if (filter === "live") result = result.filter((m) => m.status === "live");
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

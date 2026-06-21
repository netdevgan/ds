const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json";
const CACHE_TTL_SECONDS = 1800; // 30 minutes (matches change often during tournament)

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "all"; // all | upcoming | finished
  const group = url.searchParams.get("group") || null;

  try {
    const cacheKey = `matches_2026_v2`;
    const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });

    let matches;
    let fromCache = false;

    if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL_SECONDS * 1000)) {
      matches = cached.data;
      fromCache = true;
    } else {
      const key = env.TSDB_KEY || "3";
      const apiUrl = `${TSDB_BASE}/${key}/search_all_events.php?l=FIFA%20World%20Cup&s=2026`;

      const upstream = await fetch(apiUrl, {
        headers: { Accept: "application/json" },
        cf: { cacheTtl: 300 },
      });

      if (!upstream.ok) {
        throw new Error(`Upstream API error: ${upstream.status}`);
      }

      const data = await upstream.json();
      const events = Array.isArray(data.event) ? data.event : [];
      matches = normalizeMatches(events);

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

function normalizeMatches(events) {
  return events
    .map((ev) => {
      const matchDateTime = toDateTime(ev.dateEvent, ev.strTime);
      const now = new Date();
      const status = inferStatus(ev, matchDateTime, now);

      return {
        id: ev.idEvent,
        homeTeam: ev.strHomeTeam,
        awayTeam: ev.strAwayTeam,
        homeScore: parseScore(ev.intHomeScore),
        awayScore: parseScore(ev.intAwayScore),
        date: ev.dateEvent,
        timeLocal: ev.strTime,
        datetimeUtc: matchDateTime ? matchDateTime.toISOString() : null,
        round: ev.strRound,
        group: extractGroup(ev.strRound),
        venue: ev.strVenue,
        city: ev.strCity,
        country: ev.strCountry,
        status,
        homeBadge: ev.strHomeTeamBadge || null,
        awayBadge: ev.strAwayTeamBadge || null,
        video: ev.strVideo || null,
      };
    })
    .sort((a, b) => new Date(a.datetimeUtc || 0) - new Date(b.datetimeUtc || 0));
}

function toDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const time = timeStr || "00:00:00";
  return new Date(`${dateStr}T${time}Z`);
}

function inferStatus(ev, matchDateTime, now) {
  if (ev.strStatus && ev.strStatus.toLowerCase() === "match finished") {
    return "finished";
  }
  if (ev.intHomeScore !== null && ev.intAwayScore !== null) {
    return "finished";
  }
  if (!matchDateTime) return "upcoming";

  const diffMinutes = (now - matchDateTime) / (1000 * 60);

  if (diffMinutes >= -5 && diffMinutes < 105) {
    return "live";
  }
  if (diffMinutes >= 105) {
    return "finished";
  }
  return "upcoming";
}

function parseScore(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

function extractGroup(roundStr) {
  if (!roundStr) return null;
  const normalized = roundStr.replace(/ Round/gi, "").trim();
  const mapping = {
    "Group A": "A",
    "Group B": "B",
    "Group C": "C",
    "Group D": "D",
    "Group E": "E",
    "Group F": "F",
    "Group G": "G",
    "Group H": "H",
  };
  return mapping[normalized] || null;
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

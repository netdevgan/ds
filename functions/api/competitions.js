const CACHE_TTL = 86400; // 24 hours

const POPULAR_CODES = [
  "WC", "CL", "EL", "EC", "PL", "PD", "BL1", "SA", "FL1",
  "DED", "PPL", "BSA", "MLS", "ALL", "CDL", "CC", "DFB",
  "FAC", "KNV", "ACL", "AFC"
];

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const cacheKey = "competitions_list_v1";
    const cached = await env.WORLDCUP_KV.get(cacheKey, { type: "json" });

    if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL * 1000)) {
      return jsonResponse({ success: true, data: cached.data, cached: true });
    }

    const fdKey = env.FOOTBALL_DATA_KEY;
    if (!fdKey) {
      return jsonResponse({ success: true, data: fallbackCompetitions(), cached: false });
    }

    const resp = await fetch("https://api.football-data.org/v4/competitions", {
      headers: { "X-Auth-Token": fdKey },
    });

    if (!resp.ok) {
      return jsonResponse({ success: true, data: fallbackCompetitions(), cached: false });
    }

    const data = await resp.json();
    const all = Array.isArray(data.competitions) ? data.competitions : [];
    const popular = all
      .filter(c => POPULAR_CODES.includes(c.code))
      .map(normalizeCompetition)
      .sort((a, b) => a.name.localeCompare(b.name));

    const custom = fallbackCompetitions();
    const merged = [...popular];
    for (const fb of custom) {
      if (!merged.find(m => m.code === fb.code)) {
        merged.push(fb);
      }
    }

    await env.WORLDCUP_KV.put(
      cacheKey,
      JSON.stringify({ data: merged, timestamp: Date.now() })
    );

    return jsonResponse({ success: true, data: merged, cached: false });
  } catch (err) {
    return jsonResponse({ success: true, data: fallbackCompetitions() });
  }
}

function normalizeCompetition(c) {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    emblem: c.emblem || null,
    area: c.area?.name || null,
    flag: c.area?.flag || null,
    type: c.type || "LEAGUE",
    currentSeason: c.currentSeason?.startDate
      ? `${c.currentSeason.startDate.slice(0, 4)}`
      : null,
  };
}

function fallbackCompetitions() {
  return [
    { id: 2000, code: "WC", name: "FIFA World Cup", emblem: null, area: "International", flag: null, type: "CUP", currentSeason: "2026" },
    { id: 2001, code: "CL", name: "UEFA Champions League", emblem: null, area: "Europe", flag: null, type: "CUP", currentSeason: "2026" },
    { id: 2002, code: "BL1", name: "Bundesliga", emblem: null, area: "Germany", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2003, code: "EL", name: "UEFA Europa League", emblem: null, area: "Europe", flag: null, type: "CUP", currentSeason: "2026" },
    { id: 2013, code: "SA", name: "Serie A", emblem: null, area: "Italy", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2014, code: "PD", name: "La Liga", emblem: null, area: "Spain", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2015, code: "FL1", name: "Ligue 1", emblem: null, area: "France", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2016, code: "ELC", name: "EFL Championship", emblem: null, area: "England", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2018, code: "EC", name: "European Championship", emblem: null, area: "Europe", flag: null, type: "CUP", currentSeason: "2024" },
    { id: 2019, code: "CLI", name: "Copa Libertadores", emblem: null, area: "South America", flag: null, type: "CUP", currentSeason: "2026" },
    { id: 2021, code: "PL", name: "Premier League", emblem: null, area: "England", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2072, code: "MLS", name: "Major League Soccer", emblem: null, area: "USA", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2027, code: "BSA", name: "Campeonato Brasileiro Série A", emblem: null, area: "Brazil", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2120, code: "ALL", name: "Copa de la Liga Profesional", emblem: null, area: "Argentina", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2008, code: "DED", name: "Eredivisie", emblem: null, area: "Netherlands", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2017, code: "PPL", name: "Primeira Liga", emblem: null, area: "Portugal", flag: null, type: "LEAGUE", currentSeason: "2026" },
    { id: 2149, code: "CDL", name: "English Football League Cup", emblem: null, area: "England", flag: null, type: "CUP", currentSeason: "2026" },
    { id: 2033, code: "DFB", name: "DFB-Pokal", emblem: null, area: "Germany", flag: null, type: "CUP", currentSeason: "2026" },
    { id: 2032, code: "CC", name: "Coppa Italia", emblem: null, area: "Italy", flag: null, type: "CUP", currentSeason: "2026" },
    { id: 2169, code: "ACL", name: "AFC Champions League", emblem: null, area: "Asia", flag: null, type: "CUP", currentSeason: "2026" },
  ];
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600, s-maxage=7200",
    },
  });
}

const FALLBACK_COMPETITIONS = [
  { id: 2000, code: "WC", name: "FIFA World Cup", emblem: null, area: "International", flag: null, type: "CUP", currentSeason: "2026" },
  { id: 2001, code: "CL", name: "UEFA Champions League", emblem: null, area: "Europe", flag: null, type: "CUP", currentSeason: "2026" },
  { id: 2002, code: "BL1", name: "Bundesliga", emblem: null, area: "Germany", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2013, code: "SA", name: "Serie A", emblem: null, area: "Italy", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2014, code: "PD", name: "La Liga", emblem: null, area: "Spain", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2015, code: "FL1", name: "Ligue 1", emblem: null, area: "France", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2008, code: "DED", name: "Eredivisie", emblem: null, area: "Netherlands", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2017, code: "PPL", name: "Primeira Liga", emblem: null, area: "Portugal", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2021, code: "PL", name: "Premier League", emblem: null, area: "England", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2027, code: "BSA", name: "Campeonato Brasileiro Série A", emblem: null, area: "Brazil", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2019, code: "CLI", name: "Copa Libertadores", emblem: null, area: "South America", flag: null, type: "CUP", currentSeason: "2026" },
  { id: 2072, code: "MLS", name: "Major League Soccer", emblem: null, area: "USA", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2018, code: "EC", name: "European Championship", emblem: null, area: "Europe", flag: null, type: "CUP", currentSeason: "2024" },
  { id: 2003, code: "EL", name: "UEFA Europa League", emblem: null, area: "Europe", flag: null, type: "CUP", currentSeason: "2026" },
  { id: 2016, code: "ELC", name: "EFL Championship", emblem: null, area: "England", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2149, code: "CDL", name: "English Football League Cup", emblem: null, area: "England", flag: null, type: "CUP", currentSeason: "2026" },
  { id: 2033, code: "DFB", name: "DFB-Pokal", emblem: null, area: "Germany", flag: null, type: "CUP", currentSeason: "2026" },
  { id: 2032, code: "CC", name: "Coppa Italia", emblem: null, area: "Italy", flag: null, type: "CUP", currentSeason: "2026" },
  { id: 2120, code: "ALL", name: "Copa de la Liga Profesional", emblem: null, area: "Argentina", flag: null, type: "LEAGUE", currentSeason: "2026" },
  { id: 2169, code: "ACL", name: "AFC Champions League", emblem: null, area: "Asia", flag: null, type: "CUP", currentSeason: "2026" },
];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Only intercept root path
  if (url.pathname !== "/") {
    return env.ASSETS.fetch(request);
  }

  try {
    // Read competition query param (e.g., ?c=PL)
    const selectedCode = (url.searchParams.get("c") || "WC").toUpperCase();

    // Get static HTML template
    const assetResp = await env.ASSETS.fetch(request);
    if (!assetResp.ok) {
      return env.ASSETS.fetch(request);
    }
    let html = await assetResp.text();

    // Gather inline data for SSR
    const inlineData = await gatherInlineData(env, selectedCode);

    // Inject inline JSON into the placeholder
    html = html.replace(
      '<script id="inline-data" type="application/json">{}</script>',
      `<script id="inline-data" type="application/json">${JSON.stringify(inlineData)}</script>`
    );

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=300",
      },
    });
  } catch (err) {
    // Fallback to static HTML
    return env.ASSETS.fetch(request);
  }
}

async function gatherInlineData(env, selectedCode = "WC") {
  const data = { competitions: [], matches: [], standings: [], teams: [], selectedCode };

  // 1. Competitions list
  const { competitions } = data;
  try {
    const cachedComp = await env.WORLDCUP_KV.get("competitions_list_v1", { type: "json" });
    if (cachedComp && cachedComp.data && cachedComp.data.length) {
      data.competitions = cachedComp.data;
    } else {
      data.competitions = fallbackCompetitions();
    }
  } catch {
    data.competitions = fallbackCompetitions();
  }

  // 2. Matches for selected competition
  const compUpper = selectedCode.toUpperCase();
  try {
    const cachedMatches = await env.WORLDCUP_KV.get(`matches_${compUpper}_v1`, { type: "json" });
    if (cachedMatches && cachedMatches.data) {
      data.matches = cachedMatches.data;
    }
  } catch {}

  // 3. Standings for selected competition
  try {
    const cachedStandings = await env.WORLDCUP_KV.get(`standings_${compUpper}_v1`, { type: "json" });
    if (cachedStandings && cachedStandings.data) {
      data.standings = cachedStandings.data;
    }
  } catch {}

  // 4. Teams for selected competition
  try {
    const cachedTeams = await env.WORLDCUP_KV.get(`teams_${compUpper}_v1`, { type: "json" });
    if (cachedTeams && cachedTeams.data) {
      data.teams = cachedTeams.data;
    }
  } catch {}

  return data;
}

function fallbackCompetitions() {
  return FALLBACK_COMPETITIONS;
}

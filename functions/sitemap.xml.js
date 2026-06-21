const CACHE_TTL = 86400;

const POPULAR_CODES = [
  "WC", "CL", "EL", "EC", "PL", "PD", "BL1", "SA", "FL1",
  "DED", "PPL", "BSA", "MLS", "ALL", "CDL", "CC", "DFB",
  "FAC", "KNV", "ACL", "AFC"
];

const COMPETITION_NAMES = {
  WC: "fifa-world-cup-2026", CL: "uefa-champions-league", EL: "uefa-europa-league",
  EC: "european-championship", PL: "premier-league", PD: "la-liga",
  BL1: "bundesliga", SA: "serie-a", FL1: "ligue-1", DED: "eredivisie",
  PPL: "primeira-liga", BSA: "campeonato-brasileiro", MLS: "major-league-soccer",
  ALL: "copa-de-la-liga", CDL: "efl-cup", CC: "coppa-italia",
  DFB: "dfb-pokal", FAC: "fa-cup", KNV: "knvb-cup", ACL: "afc-champions-league",
  AFC: "asian-cup", ELC: "efl-championship", CLI: "copa-libertadores",
};

const FALLBACK_CODES = [
  { code: "WC", name: "FIFA World Cup" },
  { code: "CL", name: "UEFA Champions League" },
  { code: "PL", name: "Premier League" },
  { code: "BL1", name: "Bundesliga" },
  { code: "SA", name: "Serie A" },
  { code: "PD", name: "La Liga" },
  { code: "FL1", name: "Ligue 1" },
  { code: "EL", name: "UEFA Europa League" },
  { code: "ELC", name: "EFL Championship" },
  { code: "EC", name: "European Championship" },
  { code: "CLI", name: "Copa Libertadores" },
  { code: "MLS", name: "Major League Soccer" },
  { code: "BSA", name: "Campeonato Brasileiro Série A" },
  { code: "DED", name: "Eredivisie" },
  { code: "PPL", name: "Primeira Liga" },
  { code: "ALL", name: "Copa de la Liga Profesional" },
  { code: "CDL", name: "English Football League Cup" },
  { code: "CC", name: "Coppa Italia" },
  { code: "DFB", name: "DFB-Pokal" },
  { code: "ACL", name: "AFC Champions League" },
];

export async function onRequest(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  const siteUrl = `${url.protocol}//${url.host}`;

  let codes;
  try {
    const cached = await env.WORLDCUP_KV.get("competitions_list_v1", { type: "json" });
    if (cached && cached.data && cached.data.length) {
      codes = cached.data.map(c => ({ code: c.code, name: c.name }));
    } else {
      codes = FALLBACK_CODES;
    }
  } catch {
    codes = FALLBACK_CODES;
  }

  const lastmod = new Date().toISOString().slice(0, 10);

  const urls = codes.map(c => `  <url>
    <loc>${siteUrl}/?c=${c.code}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=7200",
    },
  });
}

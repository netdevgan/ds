export async function onRequest(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  const siteUrl = `${url.protocol}//${url.host}`;

  const body = `User-agent: *
Allow: /
Sitemap: ${siteUrl}/sitemap.xml
`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}

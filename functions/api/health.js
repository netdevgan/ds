export async function onRequestGet(context) {
  const { env } = context;

  let kvStatus = "unknown";
  try {
    if (env.WORLDCUP_KV) {
      await env.WORLDCUP_KV.put("__health_check__", "ok", { expirationTtl: 60 });
      const value = await env.WORLDCUP_KV.get("__health_check__");
      kvStatus = value === "ok" ? "connected" : "error";
    } else {
      kvStatus = "not_bound";
    }
  } catch (error) {
    kvStatus = `error: ${error.message}`;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      timestamp: new Date().toISOString(),
      kv: kvStatus,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
}

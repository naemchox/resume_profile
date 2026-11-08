import type { Env } from "./types";
import { handleWebhook } from "./webhook";
import { runSchedule } from "./schedule";
import { resolveSymbol } from "./yahoo";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/webhook") return handleWebhook(req, env);
    // ไว้เช็กว่า Yahoo ยังดึงได้จาก Cloudflare เช่น /quote?s=PTT
    if (url.pathname === "/quote") return Response.json(await resolveSymbol(url.searchParams.get("s") ?? "PTT"));
    return new Response("stock-line-bot ok");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSchedule(env, new Date(event.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;

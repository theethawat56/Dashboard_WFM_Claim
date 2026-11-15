import { default as handler } from "../.open-next/worker.js";

export default {
  fetch: handler.fetch,
  async scheduled(_event, env, ctx) {
    const headers = new Headers();
    if (env.CRON_SECRET) headers.set("authorization", `Bearer ${env.CRON_SECRET}`);
    const request = new Request("https://factory-portal.internal/api/cron/notify", { headers });
    ctx.waitUntil(handler.fetch(request, env, ctx));
  },
};

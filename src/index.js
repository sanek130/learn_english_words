import "dotenv/config";
import express from "express";
import { connectDb } from "./db.js";
import { createBot } from "./bot.js";

const { BOT_TOKEN, MONGODB_URI, WEBAPP_URL, PORT = 3000 } = process.env;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is required");
  process.exit(1);
}

await connectDb(MONGODB_URI);

const bot = createBot(BOT_TOKEN);
const app = express();

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="ru"><meta charset="utf-8"><title>Learn Words Bot</title>
<body style="font-family:system-ui;padding:2rem">
<h1>Learn Words Bot</h1>
<p>Бот запущен. Откройте его в Telegram.</p>
</body></html>`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function webhookDomain(url) {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.origin;
  } catch {
    return String(url || "").replace(/\/$/, "");
  }
}

if (WEBAPP_URL) {
  const origin = webhookDomain(WEBAPP_URL);
  const domain = origin.replace(/^https?:\/\//, "");
  const secretPath = `/tg/${BOT_TOKEN.split(":")[0]}`;
  app.use(await bot.createWebhook({ domain, path: secretPath }));
  console.log(`Webhook: https://${domain}${secretPath}`);
} else {
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  bot.launch();
  console.log("Bot polling (no WEBAPP_URL)");
}

app.listen(PORT, () => {
  console.log(`HTTP on ${PORT}`);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

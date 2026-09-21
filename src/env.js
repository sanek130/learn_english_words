function unwrap(value) {
  const raw = String(value ?? "").trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

export const env = {
  BOT_TOKEN: unwrap(process.env.BOT_TOKEN),
  MONGODB_URI: unwrap(process.env.MONGODB_URI),
  WEBAPP_URL: unwrap(process.env.WEBAPP_URL),
  PORT: unwrap(process.env.PORT) || "3000",
};

/** Atlas-строка без имени БД в пути ломает auth у части драйверов — подставляем learn_words. */
export function mongoUri(uri) {
  const cleaned = unwrap(uri);
  if (!cleaned) return cleaned;
  try {
    const parsed = new URL(cleaned);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/learn_words";
    }
    return parsed.toString();
  } catch {
    return cleaned;
  }
}

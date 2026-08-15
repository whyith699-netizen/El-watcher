// Redaksi log: jangan pernah bocorin username/password/token/cookie/session.
const SECRET_PATTERNS = [
  /MoodleSession=[^;\s"']+/gi,
  /logintoken[^&\s"']*/gi,
  /(username|password|token|secret|apikey|api_key)["'=: ]+[^"',;\s]+/gi,
  /https?:\/\/[^\/]+\/login\/index\.php\?[^\s"']*/gi, // URL login bawa param sensitif
];

export function redact(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

// Logger sederhana format terstruktur.
export function log(level, msg, extra) {
  const line = {
    t: new Date().toISOString(),
    level,
    msg: redact(String(msg)),
  };
  if (extra !== undefined) {
    try {
      line.extra = JSON.parse(redact(JSON.stringify(extra)));
    } catch {
      line.extra = redact(String(extra));
    }
  }
  process.stdout.write(JSON.stringify(line) + "\n");
}

export const logger = {
  info: (msg, extra) => log("info", msg, extra),
  warn: (msg, extra) => log("warn", msg, extra),
  error: (msg, extra) => log("error", msg, extra),
  debug: (msg, extra) => {
    if (process.env.ELW_DEBUG === "1") log("debug", msg, extra);
  },
};

// Normalisasi item aktivitas Moodle → bentuk konsisten (PRD FR-05).

export function normalizeTitle(t) {
  return String(t || "")
    .replace(/\s+/g, " ")
    .trim();
}

// "12 Aug", "12 Aug 09:00" dsb → ISO +07:00 bila lengkap; null bila tak terparse.
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7,
  aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  // Moodle locale id? fallback inggris sudah cukup untuk fixture kita.
};

export function parseMoodleDate(s) {
  if (!s) return null;
  const str = normalizeTitle(s);
  // Format umum Moodle EN: "12 Aug", "12 Aug, 09:00", "12 Aug 09:00", "12 Aug 2026, 09:00"
  let m = str.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?(?:\s+(\d{4}))?(?:[, ]+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mon) return null;
    const year = m[3] ? Number(m[3]) : guessYear(mon);
    const iso = buildJakartaIso(year, mon, Number(m[1]), m[4] ? Number(m[4]) : null, m[5] ? Number(m[5]) : null);
    return iso;
  }
  // Format EN alternatif: "9:00 AM - 12 Aug" jarang di timeline; abaikan.
  return null;
}

function guessYear(mon) {
  const now = new Date();
  const curMon = now.getUTCMonth() + 1;
  // Tahun ajaran Indonesia: jika bulan Jul-Des pakai tahun ini, Jan-Jun pakai tahun depan? Salah —
  // event e-learning biasanya dekat. Pakai heuristik: kalau bulan event < bulan sekarang - 6, tahun depan.
  const y = now.getUTCFullYear();
  return mon < curMon - 6 ? y + 1 : y;
}

function buildJakartaIso(y, mon, day, hh, mm) {
  const p = (n) => String(n).padStart(2, "0");
  const date = `${y}-${p(mon)}-${p(day)}`;
  if (hh === null) return `${date}T00:00:00+07:00`;
  return `${date}T${p(hh)}:${p(mm)}:00+07:00`;
}

// Tipe aktivitas dari URL Moodle /mod/<modname>/...
export function typeFromUrl(url) {
  if (!url) return "other";
  const m = String(url).match(/\/mod\/([a-z0-9_]+)\//i);
  const mod = m ? m[1].toLowerCase() : "";
  if (mod === "quiz") return "quiz";
  if (mod === "assign") return "assignment";
  if (mod === "forum") return "announcement";
  if (["choice", "feedback", "survey", "glossary", "wiki", "data"].includes(mod)) return "other";
  if (mod) return "other";
  return "other";
}

export function normalizeItem(accountId, sourceClass, raw) {
  const title = normalizeTitle(raw.title);
  const url = raw.url ? String(raw.url).split("#")[0] : "";
  return {
    accountId,
    sourceClass,
    course: normalizeTitle(raw.course) || null,
    type: typeFromUrl(url) || raw.type || "other",
    title,
    status: raw.status ? normalizeTitle(raw.status) : null,
    availableFrom: raw.availableFrom || null,
    dueAt: raw.dueAt || null,
    url: url || null,
  };
}

// Fingerprint stabil (PRD FR-06): accountId + course + type + normalizedTitle + activityUrl
import { createHash } from "node:crypto";
export function fingerprint(item) {
  const basis = [item.accountId, item.course || "", item.type, item.title, item.url || ""].join("|");
  return createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

export function metadataHash(item) {
  const { accountId, ...rest } = item;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex").slice(0, 16);
}

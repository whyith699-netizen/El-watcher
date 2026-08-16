// Telegram Notifier (PRD FR-08).
import { logger } from "./redact.js";
import { TELEGRAM } from "./config.js";
import fs from "fs";

const API = "https://api.telegram.org";

async function send(text, opts = {}) {
  if (!TELEGRAM.token || !TELEGRAM.chatId) {
    logger.warn("telegram: token/chatId kosong, notifikasi dilewati");
    return { ok: false, skipped: true };
  }
  const res = await fetch(`${API}/bot${TELEGRAM.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM.chatId,
      text,
      disable_web_page_preview: true,
      ...opts,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok !== true) {
    logger.error("telegram: kirim gagal", { status: res.status });
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

export async function sendPhoto(photoPath, caption = "", opts = {}) {
  if (!TELEGRAM.token || !TELEGRAM.chatId) {
    logger.warn("telegram: token/chatId kosong, sendPhoto dilewati");
    return { ok: false, skipped: true };
  }
  if (!fs.existsSync(photoPath)) {
    logger.error(`telegram: file foto tidak ditemukan: ${photoPath}`);
    return { ok: false, error: "file_not_found" };
  }
  const formData = new FormData();
  formData.append("chat_id", TELEGRAM.chatId);
  const fileBlob = new Blob([fs.readFileSync(photoPath)]);
  formData.append("photo", fileBlob, "screenshot.png");
  if (caption) formData.append("caption", caption);

  const res = await fetch(`${API}/bot${TELEGRAM.token}/sendPhoto`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok !== true) {
    logger.error("telegram: sendPhoto gagal", { status: res.status, data });
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d) + " WIB";
}

// Prioritas (PRD FR-08): 🚨 UH/kuis > 📝 tugas/deadline > 📢 pengumuman > ⚠️ sistem.
export async function notifyEvent(ev, accountLabel, isForeign) {
  const i = ev.item;
  const src = isForeign ? `\nCatatan: sumber kelas lain (${accountLabel}) — belum tentu berlaku untuk kelasmu.` : "";
  let emoji, header;
  switch (ev.kind) {
    case "created":
      if (i.type === "quiz") { emoji = "🚨"; header = "UH/KUIS BARU TERDETEKSI"; }
      else if (i.type === "assignment") { emoji = "📝"; header = "TUGAS BARU"; }
      else if (i.type === "announcement") { emoji = "📢"; header = "PENGUMUMAN BARU"; }
      else { emoji = "🔔"; header = "AKTIVITAS BARU"; }
      break;
    case "available":
      emoji = "🚨"; header = "AKTIVITAS BARU TERSEDIA / STATUS BERUBAH";
      break;
    case "updated":
      emoji = "📝"; header = "PERUBAHAN ITEM";
      break;
    case "removed":
      emoji = "👁️"; header = "ITEM TIDAK LAGI TERLIHAT";
      break;
    default:
      emoji = "🔔"; header = "AKTIVITAS";
  }
  const lines = [
    `${emoji} ${header}`,
    `Mapel: ${i.course || "—"}`,
    `Kelas sumber: ${i.sourceClass || accountLabel}`,
    `Judul: ${i.title}`,
  ];
  if (ev.kind !== "created") lines.push(`Perubahan: ${ev.changedFields.join(", ") || "—"}`);
  if (i.dueAt) lines.push(`Batas waktu: ${fmtTime(i.dueAt)}`);
  if (i.availableFrom) lines.push(`Tersedia mulai: ${fmtTime(i.availableFrom)}`);
  lines.push(`Terdeteksi: ${fmtTime(ev.detectedAt)}`);
  if (i.url) lines.push(`Buka: ${i.url}`);
  if (src) lines.push(src);
  return send(lines.join("\n"));
}

export async function notifyAlert(msg) {
  return send(`⚠️ EL WATCHER ALERT\n${msg}`);
}

export async function notifyHealth(summary) {
  const lines = [
    "🩺 EL WATCHER — RINGKASAN HARIAN",
    ...summary.accounts.map(
      (a) => `• ${a.label}: ${a.ok ? "✅" : "❌"} ${a.itemCount} item, ${a.eventCount} event`
    ),
    `Waktu: ${fmtTime(new Date().toISOString())}`,
  ];
  return send(lines.join("\n"));
}

// Retry terbatas untuk notifikasi — jangan hilangkan event sebelum notif sukses (PRD §15).
export async function sendWithRetry(text, opts) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await send(text, opts);
    if (r.ok) return r;
    if (r.skipped) return r;
    await new Promise((r2) => setTimeout(r2, 3000 * attempt));
  }
  return { ok: false };
}

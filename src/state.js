// State store — file JSON lokal, tulis atomik (PRD FR-07).
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { logger } from "./redact.js";
import { STATE_PATH, STATE_COMMIT } from "./config.js";

const EMPTY = { version: 1, items: [], meta: {} };

export async function loadState() {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
      throw new Error("schema state rusak");
    }
    return parsed;
  } catch (e) {
    logger.warn("state: load gagal, pakai backup/empty", { err: String(e.message) });
    // Coba backup terakhir.
    try {
      const raw = await readFile(STATE_PATH + ".bak", "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items)) return parsed;
    } catch {}
    return structuredClone(EMPTY);
  }
}

export async function saveState(state) {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  const tmp = STATE_PATH + ".tmp";
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, STATE_PATH);
  // Rotasi backup sederhana.
  try {
    await writeFile(STATE_PATH + ".bak", JSON.stringify(state, null, 2));
  } catch {}
  if (STATE_COMMIT) {
    // Commit opsional ke repo (branch state) — dijalankan via git di monitor.
    logger.info("state: ELW_STATE_COMMIT=1 — commit state (best effort)");
    // Implementasi commit ada di monitor.js (butuh akses git CLI).
  }
  return true;
}

// Diff & dedup — bandingkan item baru vs state lama (PRD FR-06).
import { fingerprint, metadataHash } from "./normalize.js";

// Field yang perubahannya = event "updated".
const WATCHED_FIELDS = ["dueAt", "status", "availableFrom", "title", "course"];

export function diffItems(prevItems, nextItems, nowIso) {
  const prev = new Map(prevItems.map((i) => [i.fingerprint, i]));
  const next = new Map(nextItems.map((i) => [i.fingerprint, i]));

  const events = [];
  for (const item of nextItems) {
    const old = prev.get(item.fingerprint);
    if (!old) {
      events.push({ kind: "created", item, changedFields: [], detectedAt: nowIso });
    } else {
      const changed = WATCHED_FIELDS.filter(
        (f) => (old[f] ?? null) !== (item[f] ?? null)
      );
      if (changed.length) {
        events.push({
          kind: changed.includes("status") || changed.includes("availableFrom") ? "available" : "updated",
          item,
          changedFields: changed,
          detectedAt: nowIso,
        });
      }
    }
  }
  for (const old of prevItems) {
    if (!next.has(old.fingerprint)) {
      events.push({ kind: "removed", item: old, changedFields: [], detectedAt: nowIso });
  }
  }
  return events;
}

// Sanity guard: kembalikan {ok, reason} — false = tahan notif user, kirim alert parser.
export function sanityCheck(prevItems, nextItems, sanityCfg) {
  if (!prevItems.length) {
    return { ok: true, reason: "first-run" };
  }
  if (nextItems.length === 0) {
    return { ok: false, reason: `dashboard kosong (sebelumnya ${prevItems.length} item)` };
  }
  if (prevItems.length >= sanityCfg.minBaseline) {
    const drop = (prevItems.length - nextItems.length) / prevItems.length;
    if (drop > sanityCfg.maxDropRatio) {
      return { ok: false, reason: `item turun drastis ${prevItems.length}→${nextItems.length}` };
    }
  }
  const newCount = nextItems.filter((n) => !prevItems.some((p) => p.fingerprint === n.fingerprint)).length;
  if (newCount > sanityCfg.maxNewBurst) {
    return { ok: false, reason: `${newCount} item baru sekaligus (>${sanityCfg.maxNewBurst})` };
  }
  return { ok: true, reason: "ok" };
}

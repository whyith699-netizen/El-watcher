// State → per-account diff + sanity check.
// export: applyChanges(state, accountId, nextItems) → { events, newAccountState }
import { fingerprint, metadataHash } from "./normalize.js";
import { sanityCheck } from "./diff.js";

const WATCHED_FIELDS = ["dueAt", "status", "availableFrom", "title", "course"];

export function applyChanges(globalState, accountId, nextItems, sanityCfg) {
  const nowIso = new Date().toISOString();
  const prevItems = globalState.items?.filter((i) => i.accountId === accountId) ?? [];

  // Sanity guard
  const guard = sanityCheck(prevItems, nextItems, sanityCfg);
  if (!guard.ok) {
    return {
      events: [{ kind: "GUARD_BLOCKED", item: null, reason: guard.reason, detectedAt: nowIso }],
      newAccountState: globalState.accounts?.[accountId] ?? { items: {}, meta: {} },
      guardBlocked: true,
    };
  }

  const events = diffItems(prevItems, nextItems, nowIso);

  // Update per-account state
  const newItems = nextItems.map((item) => ({
    ...item,
    fingerprint: item.fingerprint || fingerprint(item),
    metadataHash: metadataHash(item),
  }));

  return { events, newAccountState: { items: newItems, meta: {} } };
}

function diffItems(prevItems, nextItems, nowIso) {
  const prevMap = new Map(prevItems.map((i) => [i.fingerprint, i]));
  const nextMap = new Map(nextItems.map((i) => [i.fingerprint, i]));
  const events = [];

  for (const item of nextItems) {
    const old = prevMap.get(item.fingerprint);
    if (!old) {
      events.push({ kind: "created", item, changedFields: [], detectedAt: nowIso });
    } else {
      const changed = WATCHED_FIELDS.filter((f) => (old[f] ?? null) !== (item[f] ?? null));
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
    if (!nextMap.has(old.fingerprint)) {
      events.push({ kind: "removed", item: old, changedFields: [], detectedAt: nowIso });
    }
  }
  return events;
}
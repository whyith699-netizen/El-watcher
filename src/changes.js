// State → per-account diff + sanity check.
import { fingerprint, metadataHash } from "./normalize.js";
import { diffItems, sanityCheck } from "./diff.js";

export function applyChanges(globalState, accountId, nextItems, sanityCfg, options = {}) {
  const nowIso = new Date().toISOString();
  const prevItems = globalState.items?.filter((i) => i.accountId === accountId) ?? [];

  const guard = sanityCheck(prevItems, nextItems, sanityCfg);
  if (!guard.ok) {
    const previousAccount = globalState.accounts?.[accountId];
    return {
      events: [{ kind: "GUARD_BLOCKED", item: null, reason: guard.reason, detectedAt: nowIso }],
      newAccountState: previousAccount ?? { items: prevItems, meta: {} },
      guardBlocked: true,
    };
  }

  let events = diffItems(prevItems, nextItems, nowIso);
  const baselineCreated = prevItems.length === 0 && nextItems.length > 0;
  if (baselineCreated && !options.notifyInitial) {
    events = [];
  }

  const newItems = nextItems.map((item) => ({
    ...item,
    fingerprint: item.fingerprint || fingerprint(item),
    metadataHash: metadataHash(item),
  }));

  return {
    events,
    baselineCreated,
    newAccountState: { items: newItems, meta: {} },
    guardBlocked: false,
  };
}

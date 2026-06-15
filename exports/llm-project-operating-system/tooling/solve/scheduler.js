// Scheduler — picks which open frontier to work on next, by max value/cost.
// Returning null means no open frontier remains, which the loop reads as EXHAUSTED.
// The pick function is deliberately tiny and pluggable so the value signal can grow
// (blast radius, dependency count, ...) without touching the loop.

import {STATUS_OPEN} from './constants.js';

const DEFAULT_PRIORITY = 1;

export function valueCost(quest, frontierDef, frontierState) {
  const questPriority = Number(quest.priority) || DEFAULT_PRIORITY;
  const frontierPriority = Number(frontierDef.priority) || DEFAULT_PRIORITY;
  const parked = frontierState ? frontierState.parkedCount : 0;
  return (questPriority * frontierPriority) / (1 + parked);
}

export function pickFrontier(quest, state, scoreFn = valueCost) {
  const stateById = new Map(state.frontiers.map((f) => [f.id, f]));
  let best = null;
  let bestScore = -Infinity;
  for (const def of quest.frontiers) {
    const fState = stateById.get(def.id);
    if (!fState || fState.status !== STATUS_OPEN) continue;
    const score = scoreFn(quest, def, fState);
    if (score > bestScore) {
      bestScore = score;
      best = {def, state: fState};
    }
  }
  return best;
}

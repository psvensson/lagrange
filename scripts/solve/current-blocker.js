import {
  EVENT_EVIDENCE_INGESTED,
  EVENT_FINDING,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_RESULT,
  EVENT_THEORY_SELECTED,
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_SUPPORTED,
} from './constants.js';

const MOVEMENT_NO_EVIDENCE = 'no_evidence';
const MOVEMENT_NO_PREVIOUS = 'no_previous';
export const BLOCKER_MOVEMENT_SAME = 'same';
export const BLOCKER_MOVEMENT_MOVED_OWNER = 'moved_owner';
export const BLOCKER_MOVEMENT_MOVED_BOUNDARY = 'moved_boundary';
export const BLOCKER_MOVEMENT_NARROWED = 'narrowed';
export const BLOCKER_MOVEMENT_SOLVED = 'solved';
export const BLOCKER_MOVEMENT_INVALID = 'invalid';
export const BLOCKER_MOVEMENT_UNKNOWN = 'unknown';

const SELECTABLE_THEORY_STATUSES = Object.freeze([
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_SUPPORTED,
]);

function last(items) {
  return items.length > 0 ? items[items.length - 1] : null;
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return value.join('|') || null;
  return String(value);
}

function eventTime(event) {
  const ts = new Date(event?.ts || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function evidenceEvents(log, frontierId = null) {
  return log.filter((event) =>
    event.type === EVENT_EVIDENCE_INGESTED &&
    (!frontierId || event.frontier === frontierId));
}

export function blockerFromEvidence(event = null) {
  if (!event) return null;
  return {
    frontier: event.frontier || null,
    evidence: event.evidence || null,
    ts: event.ts || null,
    owner: normalizeValue(event.owner),
    boundary: normalizeValue(event.boundary),
    dominantReason: normalizeValue(event.dominantReason),
    rootCauseClass: normalizeValue(event.rootCauseClass),
    mechanism: normalizeValue(event.mechanism),
    waitMode: normalizeValue(event.waitMode),
    nextAction: normalizeValue(event.nextAction),
    verdict: normalizeValue(event.verdict),
    verdictReason: normalizeValue(event.verdictReason),
    metric: event.metric ?? null,
    done: event.done === true,
    invalidSample: event.invalidSample === true || event.metric === null,
    summary: normalizeValue(event.summary),
  };
}

export function blockerLabel(blocker) {
  if (!blocker) return 'none';
  return [
    blocker.owner,
    blocker.boundary,
    blocker.dominantReason,
  ].filter(Boolean).join(' / ') || blocker.dominantReason ||
    blocker.rootCauseClass || blocker.verdict || 'unknown';
}

const UNRESOLVED_LABELS = Object.freeze(['none', 'unknown']);

// Ordered, de-duplicated history of distinct blocker labels observed across all
// measured evidence events for a frontier, plus the set of labels that were left
// and later returned to (a revisit). This is the engine for oscillation /
// whack-a-mole detection: a forward-only comparison cannot see a return.
export function blockerHistory(log, frontierId = null) {
  const labels = evidenceEvents(log, frontierId)
    .map((event) => blockerFromEvidence(event))
    .filter((blocker) => blocker && !blocker.invalidSample && !blocker.done)
    .map((blocker) => blockerLabel(blocker))
    .filter((label) => label && !UNRESOLVED_LABELS.includes(label));
  const transitions = [];
  for (const label of labels) {
    if (transitions.length === 0 || transitions[transitions.length - 1] !== label) {
      transitions.push(label);
    }
  }
  const seen = new Set();
  const revisits = new Set();
  for (const label of transitions) {
    if (seen.has(label)) revisits.add(label);
    seen.add(label);
  }
  return {
    labels,
    transitions,
    distinct: [...seen],
    revisits: [...revisits],
  };
}

// True when the *current* blocker is a label the frontier had already left at
// least once before — i.e. the loop is cycling back to a previously-abandoned
// blocker rather than converging.
export function detectOscillation(log, frontierId = null) {
  const {transitions, revisits} = blockerHistory(log, frontierId);
  const current = transitions.length > 0 ? transitions[transitions.length - 1] : null;
  const oscillating = Boolean(current && revisits.includes(current));
  const count = current ?
    transitions.filter((label) => label === current).length :
    0;
  return {
    oscillating,
    label: oscillating ? current : null,
    count,
    revisits,
  };
}

export function classifyBlockerMovement(previous, current) {
  if (!current) return MOVEMENT_NO_EVIDENCE;
  if (current.done) return BLOCKER_MOVEMENT_SOLVED;
  if (current.invalidSample) return BLOCKER_MOVEMENT_INVALID;
  if (!previous) return MOVEMENT_NO_PREVIOUS;
  if (previous.owner && current.owner && previous.owner !== current.owner) {
    return BLOCKER_MOVEMENT_MOVED_OWNER;
  }
  if (previous.boundary && current.boundary &&
    previous.boundary !== current.boundary) {
    return BLOCKER_MOVEMENT_MOVED_BOUNDARY;
  }
  if (previous.dominantReason && current.dominantReason &&
    previous.dominantReason !== current.dominantReason) {
    return BLOCKER_MOVEMENT_NARROWED;
  }
  if (previous.rootCauseClass && current.rootCauseClass &&
    previous.rootCauseClass !== current.rootCauseClass) {
    return BLOCKER_MOVEMENT_NARROWED;
  }
  if (previous.mechanism && current.mechanism &&
    previous.mechanism !== current.mechanism) {
    return BLOCKER_MOVEMENT_NARROWED;
  }
  if (blockerLabel(previous) === blockerLabel(current)) {
    return BLOCKER_MOVEMENT_SAME;
  }
  return BLOCKER_MOVEMENT_UNKNOWN;
}

function movementSummary(previous, current, movement) {
  if (!current) return 'no evidence recorded';
  if (!previous) return `first blocker observed: ${blockerLabel(current)}`;
  if (movement === BLOCKER_MOVEMENT_SAME) {
    return `same blocker remains: ${blockerLabel(current)}`;
  }
  return `${movement}: ${blockerLabel(previous)} -> ${blockerLabel(current)}`;
}

export function diagnosticMovementFor(log, frontierId = null) {
  const events = evidenceEvents(log, frontierId);
  const current = blockerFromEvidence(last(events));
  const previous = blockerFromEvidence(events.length > 1 ?
    events[events.length - 2] :
    null);
  const movement = classifyBlockerMovement(previous, current);
  return {
    movement,
    previous,
    current,
    summary: movementSummary(previous, current, movement),
  };
}

function latestEvidence(log, frontierId = null) {
  return last(evidenceEvents(log, frontierId));
}

function latestFindingLines(log, frontierId, limit = 3) {
  return log.filter((event) =>
    event.type === EVENT_FINDING &&
    (!frontierId || event.frontier === frontierId))
    .slice(-limit)
    .map((event) => ({
      claim: event.claim || null,
      rulesOut: event.rulesOut || null,
      evidence: event.evidence || null,
    }));
}

function selectedTheory(state, frontierId) {
  const id = state.theories?.selectedByFrontier?.[frontierId];
  return id ? state.theories.byId[id] || null : null;
}

function selectedTheoryEvent(log, frontierId, theoryId) {
  return [...log].reverse().find((event) =>
    event.type === EVENT_THEORY_SELECTED &&
    event.frontier === frontierId &&
    event.theory === theoryId) || null;
}

function theoryResultAfter(log, theoryId, afterIndex) {
  return log.some((event, index) =>
    event.type === EVENT_THEORY_RESULT &&
    event.theory === theoryId &&
    index > afterIndex);
}

function theoryDeclaredEvent(log, theoryId) {
  return log.find((event) =>
    event.type === EVENT_THEORY_OPTION_DECLARED &&
    event.theory === theoryId) || null;
}

function theoryOwnerMismatch(theory, current) {
  if (!theory || !current) return false;
  const theoryOwner = normalizeValue(theory.owner || theory.decidingOwner);
  const theoryBoundary = normalizeValue(theory.boundary || theory.ownerBoundary);
  if (theoryOwner && current.owner && theoryOwner !== current.owner) return true;
  if (theoryBoundary && current.boundary && theoryBoundary !== current.boundary) {
    return true;
  }
  return false;
}

export function selectedTheoryStaleness(log, state, frontierId) {
  const theory = selectedTheory(state, frontierId);
  if (!theory) return {stale: false, theory: null, reason: null};
  if (!SELECTABLE_THEORY_STATUSES.includes(theory.status)) {
    return {
      stale: true,
      theory,
      reason: `selected theory status is ${theory.status}`,
    };
  }
  const movement = diagnosticMovementFor(log, frontierId);
  const currentEvidence = latestEvidence(log, frontierId);
  const selectedEvent = selectedTheoryEvent(log, frontierId, theory.id) ||
    theoryDeclaredEvent(log, theory.id);
  if (theoryOwnerMismatch(theory, movement.current)) {
    return {
      stale: true,
      theory,
      reason: 'selected theory owner/boundary no longer matches latest evidence',
      movement,
    };
  }
  if (!currentEvidence || !selectedEvent) {
    return {stale: false, theory, reason: null, movement};
  }
  const currentIndex = log.indexOf(currentEvidence);
  const selectedIndex = log.indexOf(selectedEvent);
  const currentTs = eventTime(currentEvidence);
  const selectedTs = eventTime(selectedEvent);
  const movementChanged = [
    BLOCKER_MOVEMENT_MOVED_OWNER,
    BLOCKER_MOVEMENT_MOVED_BOUNDARY,
    BLOCKER_MOVEMENT_NARROWED,
    BLOCKER_MOVEMENT_SOLVED,
  ].includes(movement.movement);
  if (
    (currentIndex > selectedIndex || currentTs > selectedTs) &&
    movementChanged &&
    !theoryResultAfter(log, theory.id, currentIndex)
  ) {
    return {
      stale: true,
      theory,
      reason: `latest evidence changed blocker (${movement.movement}) after selection`,
      movement,
    };
  }
  return {stale: false, theory, reason: null, movement};
}

function nextMove(frontier, staleness, movement) {
  if (!frontier) return 'No open frontier remains; inspect solve report.';
  if (staleness.stale) {
    return `record or select a fresh frontier theory for ${frontier.id}`;
  }
  if (movement?.current?.nextAction) {
    return `${frontier.id}: ${movement.current.nextAction}`;
  }
  if (movement?.current?.owner || movement?.current?.boundary) {
    return `${frontier.id}: inspect ${[
      movement.current.owner,
      movement.current.boundary,
    ].filter(Boolean).join(' / ')}`;
  }
  return `continue supervised step for ${frontier.id}`;
}

export function buildCurrentBlocker({quest, log, state, frontierId = null}) {
  const evidence = latestEvidence(log, frontierId);
  const effectiveFrontierId = frontierId || evidence?.frontier ||
    state.frontiers.find((frontier) => frontier.status === 'open')?.id ||
    quest.frontiers[0]?.id ||
    null;
  const movement = diagnosticMovementFor(log, effectiveFrontierId);
  const frontier = state.frontiers.find((item) => item.id === effectiveFrontierId) ||
    null;
  const staleness = effectiveFrontierId ?
    selectedTheoryStaleness(log, state, effectiveFrontierId) :
    {stale: false, theory: null, reason: null};
  const findings = latestFindingLines(log, effectiveFrontierId);
  const oscillation = effectiveFrontierId ?
    detectOscillation(log, effectiveFrontierId) :
    {oscillating: false, label: null, count: 0, revisits: []};
  const noLongerCurrentBlockers = [];
  if (movement.previous &&
    movement.movement !== BLOCKER_MOVEMENT_SAME &&
    movement.movement !== MOVEMENT_NO_PREVIOUS &&
    movement.movement !== MOVEMENT_NO_EVIDENCE) {
    noLongerCurrentBlockers.push(blockerLabel(movement.previous));
  }
  for (const finding of findings) {
    if (finding.rulesOut) noLongerCurrentBlockers.push(finding.rulesOut);
  }
  return {
    questId: quest.id,
    frontier: effectiveFrontierId,
    rungIndex: frontier?.rungIndex ?? null,
    latestEvidence: movement.current?.evidence || evidence?.evidence || null,
    owner: movement.current?.owner || null,
    boundary: movement.current?.boundary || null,
    dominantReason: movement.current?.dominantReason || null,
    rootCauseClass: movement.current?.rootCauseClass || null,
    mechanism: movement.current?.mechanism || null,
    nextAction: nextMove(frontier, staleness, movement),
    movement: movement.movement,
    movementSummary: movement.summary,
    selectedTheory: staleness.theory?.id || null,
    selectedTheoryStale: staleness.stale,
    selectedTheoryStaleReason: staleness.reason,
    oscillating: oscillation.oscillating,
    oscillationLabel: oscillation.label,
    oscillationCount: oscillation.count,
    noLongerCurrentBlockers: [...new Set(noLongerCurrentBlockers)].filter(Boolean),
  };
}

export function renderCurrentBlocker(blocker) {
  const lines = ['## Current Blocker'];
  lines.push(`- Frontier: ${blocker.frontier || 'none'}`);
  lines.push(`- Owner: ${blocker.owner || 'unknown'}`);
  lines.push(`- Boundary: ${blocker.boundary || 'unknown'}`);
  lines.push(`- Dominant reason: ${blocker.dominantReason || 'unknown'}`);
  lines.push(`- Mechanism: ${blocker.mechanism || 'unknown'}`);
  lines.push(`- Movement: ${blocker.movementSummary}`);
  lines.push(`- Latest evidence: ${blocker.latestEvidence || 'none'}`);
  lines.push(`- Selected theory: ${blocker.selectedTheory || 'none'}${
    blocker.selectedTheoryStale ?
      ` (stale: ${blocker.selectedTheoryStaleReason})` :
      ''
  }`);
  lines.push(`- Next move: ${blocker.nextAction}`);
  if (blocker.oscillating) {
    lines.push(`- Oscillation: blocker "${blocker.oscillationLabel}" revisited ` +
      `${blocker.oscillationCount}x (whack-a-mole; change strategy)`);
  }
  if (blocker.noLongerCurrentBlockers.length > 0) {
    lines.push('- No longer current: ' +
      blocker.noLongerCurrentBlockers.join('; '));
  }
  return lines;
}

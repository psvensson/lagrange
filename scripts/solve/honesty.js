// Honesty checks — the ONLY process the solver enforces. Autonomy is only safe if
// the signals it steers on are trustworthy, so these checks guarantee that progress
// is real (bound to artifacts), goalposts never move, and a strategy rung is only
// reset by a genuine metric improvement. Qualitative judgment is handled
// structurally by the finite ladder.
//
// Pure functions: filesystem/VCS lookups are injected via `ctx` so they can be unit
// tested without touching disk.

export const METRIC_DIRECTION_LOWER_IS_BETTER = 'lower-is-better';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Check 1 + 2: metrics are real numbers read from an existing evidence artifact, and
// the metric direction is explicitly the supported monotone one (so "progress" can
// not be redefined per attempt).
function checkMetricEvidence(event, ctx) {
  const violations = [];
  if (!isFiniteNumber(event.metricBefore) || !isFiniteNumber(event.metricAfter)) {
    violations.push('metricBefore/metricAfter must be finite numbers from a probe');
  }
  if (event.metricDirection !== METRIC_DIRECTION_LOWER_IS_BETTER) {
    violations.push(
      `metricDirection must be "${METRIC_DIRECTION_LOWER_IS_BETTER}"`,
    );
  }
  if (!event.evidence || !ctx.fileExists(event.evidence)) {
    violations.push(`evidence artifact missing: ${event.evidence || '(none)'}`);
  }
  return violations;
}

// Check 3: the recorded change actually exists as a diff artifact.
function checkChangeRef(event, ctx) {
  if (!event.changeRef || !ctx.changeRefResolves(event.changeRef)) {
    return [`changeRef does not resolve: ${event.changeRef || '(none)'}`];
  }
  return [];
}

// Check 5: a rung may only be lowered (reset toward local-fix) when the metric
// strictly improved. Climbing the ladder on a stall is always allowed.
function checkRungReset(event) {
  const lowered = Number.isInteger(event.prevRungIndex) &&
    Number.isInteger(event.rungIndex) &&
    event.rungIndex < event.prevRungIndex;
  if (lowered && !(event.metricAfter < event.metricBefore)) {
    return ['rung reset without a strict metric improvement'];
  }
  return [];
}

export function validateAttempt(event, ctx) {
  return [
    ...checkMetricEvidence(event, ctx),
    ...checkChangeRef(event, ctx),
    ...checkRungReset(event),
  ];
}

// Check 4: done_when and the metric definition are byte-identical to the sealed
// declaration captured when the quest was first declared. No moving goalposts.
export function validateGoalpostsImmutable(quest, declaredEvent) {
  if (!declaredEvent || !declaredEvent.sealed) {
    return ['no sealed quest declaration to compare against'];
  }
  const violations = [];
  if (JSON.stringify(quest.doneWhen) !== JSON.stringify(declaredEvent.sealed.doneWhen)) {
    violations.push('quest.doneWhen changed after declaration');
  }
  const metricsNow = JSON.stringify(quest.frontiers.map((f) => f.metric));
  const metricsSealed = JSON.stringify(declaredEvent.sealed.frontierMetrics);
  if (metricsNow !== metricsSealed) {
    violations.push('frontier metric definitions changed after declaration');
  }
  return violations;
}

// Honesty checks — the ONLY process the solver enforces. Autonomy is only safe if
// the signals it steers on are trustworthy, so these checks guarantee that progress
// is real (bound to artifacts), goalposts never move, and a strategy rung is only
// reset by a genuine metric improvement. Qualitative judgment is handled
// structurally by the finite ladder.
//
// Pure functions: filesystem/VCS lookups are injected via `ctx` so they can be unit
// tested without touching disk.

import {applyAmendments} from './amend.js';
import {
  CONVERGENCE_GUARDS,
  GRADIENT_REFINEMENT_METRICS,
} from './constants.js';

const LOCAL_STR_OWNED_001 = 'quest authoring contract version changed after declaration';
const LOCAL_STR_OWNED_002 = 'quest statement changed after declaration';
const LOCAL_STR_OWNED_003 = 'quest class changed after declaration';
const LOCAL_STR_OWNED_004 = 'quest constraints changed after declaration';
const LOCAL_STR_OWNED_005 = 'frontier identities changed after declaration';
const LOCAL_STR_OWNED_006 =
  'quest.verificationTemplates changed after declaration';
const LANDING_REQUIREMENTS_CHANGED =
  'quest.landingRequirements changed after declaration';

export const METRIC_DIRECTION_LOWER_IS_BETTER = 'lower-is-better';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidMetricValue(value, invalidSample) {
  return isFiniteNumber(value) || (invalidSample && value === null);
}

// A BASELINE-ABSENT attempt is the honest first measurement of a frontier: the
// before-probe found no prior run to baseline against, but the attempt itself
// measured cleanly. That is categorically different from a NON-MEASURING attempt
// (the run produced no trustworthy metric), and conflating the two cost real work
// in both directions — a dropped baseline flag manufactured integrity violations,
// while an honoured one demoted successful attempts into the cannot-measure park
// budget. The absent baseline is absolved only when the after-sample genuinely
// measured; progress still requires a finite metricBefore (see decideAndRecord),
// so an absent baseline can never be spent as an unearned improvement.
export function baselineAbsentSample(before, after) {
  return before.metric === null &&
    Boolean(before.invalidSample) &&
    !after.invalidSample &&
    isFiniteNumber(after.metric);
}

// Check 1 + 2: metrics are real numbers read from an existing evidence artifact, and
// the metric direction is explicitly the supported monotone one (so "progress" can
// not be redefined per attempt).
function checkMetricEvidence(event, ctx) {
  const violations = [];
  // An invalid sample is an honest "no measurement": the probe run was blocked or
  // incomplete, so it reported a null metric rather than fabricating a number. We
  // still demand a real evidence artifact and the sealed metric direction, but a
  // null metricBefore/metricAfter is permitted (the ladder treats it as a stall and
  // climbs). Without this exemption an honest blocked run would be punished as if it
  // were dishonest, which is exactly the false-floor bug this guards against.
  // A baseline-absent attempt exempts metricBefore ONLY. metricAfter must still be
  // a real measured number, the evidence artifact is still required below, and the
  // exemption cannot be self-declared: finalizeAttempt derives it from the two probe
  // samples, never from operator input.
  const baselineExempt = event.baselineAbsent === true &&
    event.metricBefore === null;
  if (!(baselineExempt ||
      isValidMetricValue(event.metricBefore, event.invalidSample)) ||
    !isValidMetricValue(event.metricAfter, event.invalidSample)) {
    violations.push('metricBefore/metricAfter must be finite numbers from a probe');
  }
  const hasNullMetric =
    (event.metricBefore === null && !baselineExempt) ||
    event.metricAfter === null;
  if (hasNullMetric && event.invalidSample !== true) {
    violations.push('null metrics require invalidSample=true');
  }
  if (event.beforeProbeKey && event.afterProbeKey &&
    event.beforeProbeKey !== event.afterProbeKey) {
    violations.push('metricBefore/metricAfter must come from the same probe identity');
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
  if (ctx.inspectChangeRef) {
    const inspection = ctx.inspectChangeRef(event.changeRef);
    if (!inspection.valid) {
      return inspection.problems;
    }
    return [];
  }
  if (!event.changeRef || !ctx.changeRefResolves(event.changeRef, event)) {
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

// rr-B: a frontier's metric is the SEARCH GRADIENT the scheduler climbs, not the quest
// closure (that is doneWhen, sealed separately and checked above). Sharpening the
// gradient — e.g. swapping the scalar `priority` count for the composite `distance` that
// also penalises red sub-invariants — must not be punished as goalpost movement: it makes
// the frontier strictly harder to satisfy, never easier, and the sealed doneWhen is
// untouched. A change qualifies as a gradient refinement only when the probe and every
// metric arg except the `metric` kind are byte-identical and both kinds are recognised
// interchangeable gradients. Anything else (different probe, scenario, reportDir, or a
// reworded closure) is still a goalpost violation.
function isGradientRefinement(now, sealed) {
  if (!CONVERGENCE_GUARDS.gradientRefinement) return false;
  if (!now || !sealed || now.probe !== sealed.probe) return false;
  const nowArgs = now.args || {};
  const sealedArgs = sealed.args || {};
  const nowKind = nowArgs.metric;
  const sealedKind = sealedArgs.metric;
  if (!GRADIENT_REFINEMENT_METRICS.includes(nowKind) ||
    !GRADIENT_REFINEMENT_METRICS.includes(sealedKind)) {
    return false;
  }
  const nowRest = {...nowArgs};
  const sealedRest = {...sealedArgs};
  delete nowRest.metric;
  delete sealedRest.metric;
  return JSON.stringify(nowRest) === JSON.stringify(sealedRest);
}

// Check 4: done_when and the metric definition are byte-identical to the sealed
// declaration captured when the quest was first declared. No moving goalposts — except a
// frontier metric may be refined to a sharper search gradient (see isGradientRefinement),
// which leaves the sealed closure intact.
// `amendments` are recorded quest-amended events (see amend.js): the quest
// file is compared against sealed ⊕ amendments, so a recorded narrow
// correction is legal while the same edit without its amendment event still
// violates. Amendments never touch the doneWhen probe, frontier identity, or
// metrics — those comparisons always run against the amended projection.
export function validateGoalpostsImmutable(quest, declaredEvent, amendments = []) {
  if (!declaredEvent || !declaredEvent.sealed) {
    return ['no sealed quest declaration to compare against'];
  }
  const sealed = amendments.length > 0 ?
    applyAmendments(declaredEvent.sealed, amendments) : declaredEvent.sealed;
  const effectiveDeclaration = {...declaredEvent, sealed};
  return goalpostViolationsAgainst(quest, effectiveDeclaration);
}

function goalpostViolationsAgainst(quest, declaredEvent) {
  const violations = [];
  if (JSON.stringify(quest.doneWhen) !== JSON.stringify(declaredEvent.sealed.doneWhen)) {
    violations.push('quest.doneWhen changed after declaration');
  }
  const metricsNow = quest.frontiers.map((f) => f.metric);
  const metricsSealed = declaredEvent.sealed.frontierMetrics || [];
  const sameLength = metricsNow.length === metricsSealed.length;
  const allMetricsImmutableOrRefined = sameLength &&
    metricsNow.every((metric, index) => {
      const sealed = metricsSealed[index];
      return JSON.stringify(metric) === JSON.stringify(sealed) ||
        isGradientRefinement(metric, sealed);
    });
  if (!allMetricsImmutableOrRefined) {
    violations.push('frontier metric definitions changed after declaration');
  }
  const sealedVersion = declaredEvent.sealed.authoringContractVersion;
  if (sealedVersion !== undefined) {
    if (quest.authoringContractVersion !== sealedVersion) {
      violations.push(LOCAL_STR_OWNED_001);
    }
    if (JSON.stringify(quest.statement) !==
      JSON.stringify(declaredEvent.sealed.statement)) {
      violations.push(LOCAL_STR_OWNED_002);
    }
    if (JSON.stringify(quest.class) !== JSON.stringify(declaredEvent.sealed.class)) {
      violations.push(LOCAL_STR_OWNED_003);
    }
    // Declarations sealed before the title field existed (sealed.title
    // undefined) are exempt; anything sealed since compares exactly, so the
    // commit subject a title feeds cannot be edited after declaration.
    if (declaredEvent.sealed.title !== undefined &&
      JSON.stringify(quest.title || null) !==
        JSON.stringify(declaredEvent.sealed.title || null)) {
      violations.push('quest.title changed after declaration');
    }
    if (JSON.stringify(quest.constraints || []) !==
      JSON.stringify(declaredEvent.sealed.constraints || [])) {
      violations.push(LOCAL_STR_OWNED_004);
    }
    const frontierIds = quest.frontiers.map((frontier) => frontier.id);
    if (JSON.stringify(frontierIds) !==
      JSON.stringify(declaredEvent.sealed.frontierIds || [])) {
      violations.push(LOCAL_STR_OWNED_005);
    }
    // Declarations sealed before the verification bar existed (undefined)
    // are exempt; anything sealed since compares exactly, so the rejection
    // bar cannot be widened by editing the quest file instead of the
    // amendment path.
    if (declaredEvent.sealed.verificationTemplates !== undefined &&
      JSON.stringify(quest.verificationTemplates || []) !==
        JSON.stringify(declaredEvent.sealed.verificationTemplates || [])) {
      violations.push(LOCAL_STR_OWNED_006);
    }
    if (declaredEvent.sealed.landingRequirements !== undefined &&
      JSON.stringify(quest.landingRequirements || null) !==
        JSON.stringify(declaredEvent.sealed.landingRequirements || null)) {
      violations.push(LANDING_REQUIREMENTS_CHANGED);
    }
  }
  return violations;
}

// Attempt-cost rollup — what each quest in the window actually cost to run.
//
// meta-friction ranks WHAT fired; this answers WHERE the attempts, rejection
// rounds, and measured wall-clock went, per quest, so a retrospective reads a
// table instead of hand-mining ndjson. Everything here is already in the event
// logs; nothing is measured anew. Telemetry is partial by design (the corpus
// predates it, and only executor/step/attempt paths record it), so measured
// coverage is always shown next to any duration sum — a blank and a zero mean
// opposite things.

import {
  EVENT_ATTEMPT,
  EVENT_FINDING,
  EVENT_SOLVED,
  EVENT_VIOLATION,
} from './constants.js';
import {readFrictionWindow} from './meta-friction.js';
import {loadQuest, readLog} from './store.js';

const DEFAULT_WINDOW_DAYS = 7;
const TOP_ROWS = 15;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const UNMEASURED_CELL = '—';
const NEWLINE = '\n';
const VERIFIER_REJECTION_FINDING_KIND = 'verifier-rejection';
const TABLE_HEADER = '| quest | fresh attempts | inherited | rejected candidates | ' +
  'rejection events | violations | measured fresh | duration | span | lineage |';
const TABLE_RULE = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
const SHA256_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/u;
// These two suffixes name a verifier-driven replacement specifically. Generic
// successor names (`-v2`, `-final`, `-clean-replay`) do not prove duplicated
// ceremony and therefore never classify a respin on their own.
const REJECTION_RESPIN_SUFFIX_PATTERN =
  /-(verifier-fix|validation-fix)(?:-v\d+)?$/u;
const LINEAGE_PLANNED_CHILD = 'planned-child';
const LINEAGE_REJECTION_RESPIN = 'rejection-respin';
const ATTEMPT_PROVENANCE = Object.freeze({
  FRESH: 'fresh',
  INHERITED: 'inherited',
  MALFORMED: 'malformed',
});
const INFERRED_LINEAGE_SUFFIX = ', inferred';
const MALFORMED_PROVENANCE_SUMMARY =
  'malformed inherited provenance and are excluded from fresh cost.';
const RESPIN_LINEAGE_SUMMARY =
  'rejection respin(s). Only the latter indicate repeated rejection ceremony.';
const EVENT_FIELD = Object.freeze({
  TYPE: 'type',
  KIND: 'kind',
  INHERITED: 'inherited',
  FROM_QUEST: 'fromQuest',
  TELEMETRY: 'telemetry',
  AGENT_DURATION_MS: 'agentDurationMs',
  VERIFICATION: 'verification',
  FINGERPRINT: 'fingerprint',
  TIMESTAMP: 'ts',
  LINKS: 'links',
  PARENT_QUEST: 'parentQuest',
  PARENT_RELATION: 'parentRelation',
});
const DURATION_FIELD = Object.freeze({
  FRESH_COUNT: 'measuredAttempts',
  FRESH_TOTAL: 'durationMs',
  INHERITED_COUNT: 'inheritedMeasuredAttempts',
  INHERITED_TOTAL: 'inheritedDurationMs',
});
// Capture the validation intrinsics once. Event records are JSON, but this
// retrospective must not change meaning if ambient prototypes are polluted
// after module load by another diagnostic or test.
const objectHasOwn = Object.hasOwn;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const dateParse = Date.parse;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringLocaleCompare = Function.call.bind(String.prototype.localeCompare);
const arrayEntries = Function.call.bind(Array.prototype.entries);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayReduce = Function.call.bind(Array.prototype.reduce);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const mapEntries = Function.call.bind(Map.prototype.entries);
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const setSize = Object.getOwnPropertyDescriptor(Set.prototype, 'size').get;
const INTRINSIC_MAP = Map;
const INTRINSIC_SET = Set;

function ownValue(record, key) {
  return record !== null && typeof record === 'object' &&
    objectHasOwn(record, key) ? record[key] : undefined;
}

function rejectionRespinBase(questId) {
  return stringReplace(String(questId || ''),
    REJECTION_RESPIN_SUFFIX_PATTERN, '');
}

function questRow() {
  return {
    attempts: 0,
    totalAttemptEvents: 0,
    inheritedAttempts: 0,
    inheritedMeasuredAttempts: 0,
    inheritedDurationMs: 0,
    malformedInheritedAttempts: 0,
    rejections: 0,
    rejectionEvents: 0,
    violations: 0,
    measuredAttempts: 0,
    durationMs: 0,
    firstTs: Number.POSITIVE_INFINITY,
    lastTs: Number.NEGATIVE_INFINITY,
    solved: false,
  };
}

function inheritedAttemptKind(event) {
  const inherited = ownValue(event, EVENT_FIELD.INHERITED);
  if (inherited === undefined || inherited === null || inherited === false) {
    return ATTEMPT_PROVENANCE.FRESH;
  }
  const fromQuest = ownValue(inherited, EVENT_FIELD.FROM_QUEST);
  if (typeof fromQuest === 'string' && stringTrim(fromQuest)) {
    return ATTEMPT_PROVENANCE.INHERITED;
  }
  return ATTEMPT_PROVENANCE.MALFORMED;
}

function measuredDuration(event) {
  const telemetry = ownValue(event, EVENT_FIELD.TELEMETRY);
  const duration = ownValue(telemetry, EVENT_FIELD.AGENT_DURATION_MS);
  return numberIsSafeInteger(duration) && duration >= 0 ? duration : null;
}

function addMeasuredDuration(row, duration, countField, totalField) {
  if (duration === null) return;
  const next = row[totalField] + duration;
  // Each input can be safe while their derived sum is not. In that case the
  // overflowing sample stays unmeasured instead of publishing an unsafe total.
  if (!numberIsSafeInteger(next)) return;
  row[countField] += 1;
  row[totalField] = next;
}

function rejectionKey(event, ordinal) {
  const verification = ownValue(event, EVENT_FIELD.VERIFICATION);
  const fingerprint = ownValue(verification, EVENT_FIELD.FINGERPRINT);
  return typeof fingerprint === 'string' &&
    regexpTest(SHA256_FINGERPRINT_PATTERN, fingerprint) ? fingerprint :
    `unfingerprinted-event:${ordinal}`;
}

export function tallyCostEntries(entries) {
  const byQuest = new INTRINSIC_MAP();
  const rejectionKeysByQuest = new INTRINSIC_MAP();
  for (const [ordinal, {questId, event}] of arrayEntries(entries)) {
    const row = mapGet(byQuest, questId) || questRow();
    mapSet(byQuest, questId, row);
    const ts = dateParse(ownValue(event, EVENT_FIELD.TIMESTAMP) || '');
    if (numberIsFinite(ts)) {
      row.firstTs = Math.min(row.firstTs, ts);
      row.lastTs = Math.max(row.lastTs, ts);
    }
    const eventType = ownValue(event, EVENT_FIELD.TYPE);
    if (eventType === EVENT_ATTEMPT) {
      row.totalAttemptEvents += 1;
      const kind = inheritedAttemptKind(event);
      const duration = measuredDuration(event);
      if (kind === ATTEMPT_PROVENANCE.INHERITED) {
        row.inheritedAttempts += 1;
        addMeasuredDuration(row, duration,
          DURATION_FIELD.INHERITED_COUNT, DURATION_FIELD.INHERITED_TOTAL);
      } else if (kind === ATTEMPT_PROVENANCE.MALFORMED) {
        // A malformed truthy provenance marker is not safe to charge as fresh
        // work. Surface it explicitly so a journal repair can classify it.
        row.malformedInheritedAttempts += 1;
      } else {
        row.attempts += 1;
      }
      if (kind === ATTEMPT_PROVENANCE.FRESH) {
        addMeasuredDuration(row, duration,
          DURATION_FIELD.FRESH_COUNT, DURATION_FIELD.FRESH_TOTAL);
      }
    }
    if (eventType === EVENT_FINDING &&
      ownValue(event, EVENT_FIELD.KIND) === VERIFIER_REJECTION_FINDING_KIND) {
      row.rejectionEvents += 1;
      const keys = mapGet(rejectionKeysByQuest, questId) || new INTRINSIC_SET();
      setAdd(keys, rejectionKey(event, ordinal));
      mapSet(rejectionKeysByQuest, questId, keys);
      row.rejections = Reflect.apply(setSize, keys, []);
    }
    if (eventType === EVENT_VIOLATION) row.violations += 1;
    if (eventType === EVENT_SOLVED) row.solved = true;
  }
  return byQuest;
}

function loadQuestOrNull(root, questId) {
  if (!questId) return null;
  try {
    return loadQuest(root, questId);
  } catch {
    return null;
  }
}

// Parent links are planning lineage, not evidence of rejected work. Structured
// relation metadata wins when present; otherwise only verifier-specific naming
// with a resolvable parent/base can infer a rejection respin.
export function classifyCostLineage(root, questId) {
  const quest = loadQuestOrNull(root, questId);
  const links = ownValue(quest, EVENT_FIELD.LINKS);
  const parent = ownValue(links, EVENT_FIELD.PARENT_QUEST);
  const hasExplicitParent = parent !== undefined && parent !== null;
  const validParent = typeof parent === 'string' && Boolean(parent) &&
    parent !== questId && Boolean(loadQuestOrNull(root, parent));
  let cursor = parent;
  const seen = new INTRINSIC_SET();
  setAdd(seen, questId);
  let cyclic = false;
  while (validParent && typeof cursor === 'string' && cursor) {
    if (setHas(seen, cursor)) {
      cyclic = true;
      break;
    }
    setAdd(seen, cursor);
    const cursorLinks = ownValue(loadQuestOrNull(root, cursor), EVENT_FIELD.LINKS);
    cursor = ownValue(cursorLinks, EVENT_FIELD.PARENT_QUEST);
  }
  const explicit = ownValue(links, EVENT_FIELD.PARENT_RELATION);
  const parentHasVerifiedRejection = validParent && !cyclic &&
    arraySome(readLog(root, parent), (event) =>
      event.type === EVENT_FINDING &&
      event.kind === VERIFIER_REJECTION_FINDING_KIND &&
      validVerificationRejectionFingerprint(event));
  if (parentHasVerifiedRejection && explicit === LINEAGE_REJECTION_RESPIN) {
    return {kind: LINEAGE_REJECTION_RESPIN, parent, inferred: false};
  }
  if (validParent && !cyclic && explicit === LINEAGE_PLANNED_CHILD) {
    return {kind: LINEAGE_PLANNED_CHILD, parent, inferred: false};
  }
  if (validParent) {
    const strongName = !cyclic &&
      regexpTest(REJECTION_RESPIN_SUFFIX_PATTERN, questId);
    return {
      kind: strongName ? LINEAGE_REJECTION_RESPIN : LINEAGE_PLANNED_CHILD,
      parent,
      inferred: strongName,
    };
  }
  // A declared-but-invalid parent is evidence of malformed lineage, not
  // permission to reinterpret the quest name and find a different parent.
  if (hasExplicitParent) return null;
  if (regexpTest(REJECTION_RESPIN_SUFFIX_PATTERN, questId)) {
    const inferredParent = rejectionRespinBase(questId);
    if (inferredParent !== questId && loadQuestOrNull(root, inferredParent)) {
      return {
        kind: LINEAGE_REJECTION_RESPIN,
        parent: inferredParent,
        inferred: true,
      };
    }
  }
  return null;
}

function validVerificationRejectionFingerprint(event) {
  const verification = ownValue(event, EVENT_FIELD.VERIFICATION);
  const fingerprint = ownValue(verification, EVENT_FIELD.FINGERPRINT);
  return typeof fingerprint === 'string' &&
    regexpTest(SHA256_FINGERPRINT_PATTERN, fingerprint);
}

function lineageLabel(root, questId) {
  const lineage = classifyCostLineage(root, questId);
  if (!lineage) return {label: null, kind: null, parent: null};
  return {
    label: `${lineage.parent} (${lineage.kind}${
      lineage.inferred ? INFERRED_LINEAGE_SUFFIX : ''})`,
    kind: lineage.kind,
    parent: lineage.parent,
  };
}

function globalRejectionTotals(entries) {
  const keys = new INTRINSIC_SET();
  let events = 0;
  for (const [ordinal, {event}] of arrayEntries(entries)) {
    if (ownValue(event, EVENT_FIELD.TYPE) !== EVENT_FINDING ||
      ownValue(event, EVENT_FIELD.KIND) !== VERIFIER_REJECTION_FINDING_KIND) continue;
    events += 1;
    setAdd(keys, rejectionKey(event, ordinal));
  }
  return {
    rejections: Reflect.apply(setSize, keys, []),
    rejectionEvents: events,
  };
}

function normalizedRow(row) {
  const attempts = numberIsFinite(row.attempts) ? row.attempts : 0;
  const inheritedAttempts = numberIsFinite(row.inheritedAttempts) ?
    row.inheritedAttempts : 0;
  return {
    ...row,
    attempts,
    measuredAttempts: numberIsFinite(row.measuredAttempts) ?
      row.measuredAttempts : 0,
    durationMs: numberIsFinite(row.durationMs) ? row.durationMs : 0,
    inheritedAttempts,
    totalAttemptEvents: numberIsFinite(row.totalAttemptEvents) ?
      row.totalAttemptEvents : attempts + inheritedAttempts,
    rejectionEvents: numberIsFinite(row.rejectionEvents) ?
      row.rejectionEvents : (numberIsFinite(row.rejections) ? row.rejections : 0),
    malformedInheritedAttempts: numberIsFinite(row.malformedInheritedAttempts) ?
      row.malformedInheritedAttempts : 0,
    rejections: numberIsFinite(row.rejections) ? row.rejections : 0,
    violations: numberIsFinite(row.violations) ? row.violations : 0,
    lineage: row.lineage || row.chain || null,
  };
}

function reportTotals(report, active) {
  const inheritedAttempts = arrayReduce(active, (sum, row) =>
    sum + row.inheritedAttempts, 0);
  return {
    attempts: arrayReduce(active, (sum, row) => sum + row.attempts, 0),
    inheritedAttempts,
    rejections: numberIsFinite(report.totals?.rejections) ?
      report.totals.rejections :
      arrayReduce(active, (sum, row) => sum + (row.rejections || 0), 0),
    rejectionEvents: numberIsFinite(report.totals?.rejectionEvents) ?
      report.totals.rejectionEvents :
      arrayReduce(active, (sum, row) => sum + row.rejectionEvents, 0),
    measured: arrayReduce(active, (sum, row) => sum + row.measuredAttempts, 0),
    malformedInheritedAttempts: arrayReduce(active, (sum, row) =>
      sum + row.malformedInheritedAttempts, 0),
  };
}

function formatDuration(row) {
  if (!row.measuredAttempts) return UNMEASURED_CELL;
  const seconds = Math.round(row.durationMs / MS_PER_SECOND);
  return seconds >= SECONDS_PER_MINUTE ?
    `${Math.round(seconds / SECONDS_PER_MINUTE)}m` : `${seconds}s`;
}

function formatSpan(row) {
  if (!numberIsFinite(row.firstTs) || !numberIsFinite(row.lastTs) ||
    row.lastTs <= row.firstTs) return UNMEASURED_CELL;
  const minutes = Math.round(
    (row.lastTs - row.firstTs) / MS_PER_SECOND / SECONDS_PER_MINUTE);
  return `${minutes}m`;
}

function measuredColumn(row) {
  if (row.attempts === 0) return UNMEASURED_CELL;
  return `${row.measuredAttempts}/${row.attempts}`;
}

export function buildCostReport(root, {days = DEFAULT_WINDOW_DAYS, now} = {}) {
  const entries = readFrictionWindow(root, {days, now: now ?? Date.now()});
  const byQuest = tallyCostEntries(entries);
  const rows = arrayMap([...mapEntries(byQuest)], ([questId, row]) => {
    const lineage = lineageLabel(root, questId);
    return {
      questId,
      ...row,
      lineage: lineage.label,
      lineageKind: lineage.kind,
      // Preserve the old raw-parent field for programmatic callers; the new
      // lineage fields carry the human-readable classification.
      chain: lineage.parent,
    };
  });
  arraySort(rows, (a, b) => b.attempts - a.attempts ||
    b.rejections - a.rejections ||
    stringLocaleCompare(a.questId, b.questId));
  return {days, rows, totals: globalRejectionTotals(entries)};
}

export function renderCostReport(report) {
  const {days} = report;
  const active = arrayFilter(arrayMap(report.rows, normalizedRow), (row) =>
    row.totalAttemptEvents > 0 || row.rejectionEvents > 0 || row.violations > 0);
  const lines = [
    `# Attempt cost — last ${days} day(s), ` +
      `${active.length} quest(s) with recorded work`,
    '',
  ];
  if (active.length === 0) {
    lines.push('No attempts, rejections, or violations in the window.', '');
    return lines.join(NEWLINE);
  }
  lines.push(TABLE_HEADER, TABLE_RULE);
  for (const row of active.slice(0, TOP_ROWS)) {
    lines.push(`| ${row.questId} | ${row.attempts} | ${row.inheritedAttempts} | ` +
      `${row.rejections} | ${row.rejectionEvents} | ${row.violations} | ` +
      `${measuredColumn(row)} | ${formatDuration(row)} | ${formatSpan(row)} | ` +
      `${row.lineage || UNMEASURED_CELL} |`);
  }
  lines.push('');
  if (active.length > TOP_ROWS) {
    lines.push(`> ${active.length - TOP_ROWS} further quest(s) not shown ` +
      `(showing the top ${TOP_ROWS} by attempts).`, '');
  }
  const totals = reportTotals(report, active);
  lines.push(`> Totals: ${totals.attempts} fresh attempt(s), ` +
    `${totals.inheritedAttempts} inherited attempt(s), ` +
    `${totals.rejections} unique rejected candidate(s) across ` +
    `${totals.rejectionEvents} rejection event(s); telemetry measured on ` +
    `${totals.measured}/${totals.attempts} attempt(s).`, '');
  if (totals.malformedInheritedAttempts > 0) {
    lines.push(`> ${totals.malformedInheritedAttempts} attempt event(s) carry ` +
      MALFORMED_PROVENANCE_SUMMARY, '');
  }
  const planned = arrayFilter(active, (row) =>
    row.lineageKind === LINEAGE_PLANNED_CHILD).length;
  const respins = arrayFilter(active, (row) =>
    row.lineageKind === LINEAGE_REJECTION_RESPIN).length;
  if (planned > 0 || respins > 0) {
    lines.push(`> Lineage: ${planned} planned child quest(s), ${respins} ` +
      RESPIN_LINEAGE_SUMMARY, '');
  }
  return lines.join(NEWLINE);
}

export function runCostCommand(root, args = {}) {
  const days = Number(args.days) > 0 ? Number(args.days) : DEFAULT_WINDOW_DAYS;
  return renderCostReport(buildCostReport(root, {days}));
}

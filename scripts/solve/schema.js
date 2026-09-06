// v2 quest and epic records: shapes, vocabularies and validation. One
// location per concept: a quest is a directory with quest.json + log.ndjson
// (+ evidence/ while open); an epic is a markdown file with YAML front-matter.
// _Scope authority (docs/steering/agpl-feature-map.md)._ Roadmap rows live
// there; an epic cites one through `roadmapRow`.

const QUEST_SCHEMA = 'solve-quest/2';
const QUEST_FILE = 'quest.json';
const LOG_FILE = 'log.ndjson';
const EVIDENCE_DIR = 'evidence';
const QUESTS_DIR = 'solve/quests';
const EPICS_DIR = 'solve/epics';
const CHECKS_DIR = 'scripts/checks';
const CLASS_FIX = 'fix';

const ENTRY_TYPE = Object.freeze({
  FINDING: 'finding',
  ATTEMPT: 'attempt',
  VERIFICATION: 'verification',
  TERMINAL: 'terminal',
});
const ENTRY_TYPES = Object.freeze(Object.values(ENTRY_TYPE));

const FINDING_KIND = Object.freeze({
  THEORY: 'theory',
  ALTITUDE_CHECK: 'altitude-check',
  DECISION: 'decision',
  RULED_OUT: 'ruled-out',
  EVIDENCE: 'evidence',
});
const FINDING_KINDS = Object.freeze(Object.values(FINDING_KIND));

const THEORY_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUPPORTED: 'supported',
  FALSIFIED: 'falsified',
  SUPERSEDED: 'superseded',
});
const THEORY_STATUSES = Object.freeze(Object.values(THEORY_STATUS));

const VERDICT = Object.freeze({APPROVE: 'approve', REJECT: 'reject'});
const VERDICTS = Object.freeze(Object.values(VERDICT));
const VERIFIER_PREFIX = 'subagent:';

const QUEST_STATUS = Object.freeze({
  OPEN: 'open',
  SOLVED: 'solved',
  EXHAUSTED: 'exhausted',
  SUPERSEDED: 'superseded',
  BLOCKED: 'blocked',
});
const TERMINAL_STATUSES = Object.freeze([
  QUEST_STATUS.SOLVED, QUEST_STATUS.EXHAUSTED, QUEST_STATUS.SUPERSEDED,
]);
const NEXT_OWNER = Object.freeze({
  JUDGMENT: 'judgment',
  VERIFICATION: 'verification',
  AUTHORIZATION: 'authorization',
});
const NEXT_OWNERS = Object.freeze(Object.values(NEXT_OWNER));

const EPIC_STATUS = Object.freeze({
  OPEN: 'open', DONE: 'done', SUPERSEDED: 'superseded',
});
const EPIC_STATUSES = Object.freeze(Object.values(EPIC_STATUS));
const EPIC_PROOF = Object.freeze({
  DETERMINISTIC: 'deterministic',
  SIMULATION: 'simulation',
  CERTIFICATION: 'certification',
});
const EPIC_PROOFS = Object.freeze(Object.values(EPIC_PROOF));

const PROBE = Object.freeze({
  TEST_RECEIPT: 'test-receipt',
  SCENARIO_HARNESS: 'scenario-harness',
  ORACLE: 'oracle',
  SCRIPT: 'script',
});
const PROBES = Object.freeze(Object.values(PROBE));
// A live scenario report is terminal evidence only under a certification
// epic; elsewhere it is a signal.
const CERTIFICATION_ONLY_PROBES = Object.freeze([PROBE.SCENARIO_HARNESS]);

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,120}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const LIST_SEPARATOR = ', ';
const ALTERNATIVE_SEPARATOR = '|';
const OR_SEPARATOR = ' or ';
const PROBLEM = Object.freeze({
  QUEST_NOT_OBJECT: 'quest.json is not an object',
  ID: 'id must be a kebab-case slug',
  STATEMENT: 'statement is required',
  EPIC: 'epic is required unless class is fix',
  CONSTRAINTS: 'constraints must be [{id, statement}]',
  SEALED_AT: 'sealedAt must be the full sealing commit sha',
  FRONTIERS: 'frontiers are not a v2 concept: one surface per quest',
  ENTRY_NOT_OBJECT: 'entry is not an object',
  TEXT: 'text is required',
  FRONT_MISSING: 'epic front-matter missing',
  EPIC_DONE_WHEN: 'an open epic needs doneWhen {probe, args}',
  QUESTS_LIST: 'quests must be a list',
  AUTHORIZES_LIST: 'authorizes must be a list',
  SCHEMA_PREFIX: 'schema must be ',
  DONE_WHEN_PREFIX: 'doneWhen must be {probe: ',
  DONE_WHEN_SUFFIX: ', args: {}}',
  KIND_PREFIX: 'finding kind must be one of ',
  THEORY_STATUS_PREFIX: 'theory status must be one of ',
  VERIFIER_PREFIX: 'verification needs verifier ',
  VERIFIER_SUFFIX: '<id>',
  VERDICT_PREFIX: 'verdict must be ',
  TERMINAL_PREFIX: 'terminal status must be one of ',
  NEXT_OWNER_PREFIX: 'blocked needs nextOwner ',
  TYPE_PREFIX: 'type must be one of ',
  STATUS_PREFIX: 'status must be one of ',
  PROOF_PREFIX: 'proof must be one of ',
});

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validProbe(spec) {
  return isPlainObject(spec) && PROBES.includes(spec.probe) &&
    isPlainObject(spec.args);
}

/**
 * Problems with a quest record; an empty list means the record is valid.
 * `sealedAt` is required only once the quest is sealed (`options.sealed`).
 * @param {Object} quest
 * @param {{sealed?: boolean}} [options]
 * @return {string[]}
 */
function validConstraints(constraints) {
  return constraints === undefined || (Array.isArray(constraints) &&
    constraints.every((item) => isPlainObject(item) &&
      text(item.id) && text(item.statement)));
}

// Each rule answers a problem string when the quest breaks it.
const QUEST_RULES = Object.freeze([
  (quest) => quest.schema === QUEST_SCHEMA ? null : `${PROBLEM.SCHEMA_PREFIX}${QUEST_SCHEMA}`,
  (quest) => ID_PATTERN.test(text(quest.id)) ? null : PROBLEM.ID,
  (quest) => text(quest.statement) ? null : PROBLEM.STATEMENT,
  (quest) => quest.class === CLASS_FIX || ID_PATTERN.test(text(quest.epic)) ?
    null : PROBLEM.EPIC,
  (quest) => validProbe(quest.doneWhen) ? null :
    `${PROBLEM.DONE_WHEN_PREFIX}${PROBES.join(ALTERNATIVE_SEPARATOR)}${PROBLEM.DONE_WHEN_SUFFIX}`,
  (quest) => validConstraints(quest.constraints) ? null : PROBLEM.CONSTRAINTS,
  (quest, options) => !options.sealed || SHA_PATTERN.test(text(quest.sealedAt)) ?
    null : PROBLEM.SEALED_AT,
  (quest) => quest.frontiers === undefined ? null : PROBLEM.FRONTIERS,
]);

function questProblems(quest, options = {}) {
  if (!isPlainObject(quest)) return [PROBLEM.QUEST_NOT_OBJECT];
  return QUEST_RULES.map((rule) => rule(quest, options)).filter(Boolean);
}

function problemsForFinding(entry) {
  const problems = [];
  if (entry.kind !== undefined && !FINDING_KINDS.includes(entry.kind)) {
    problems.push(`${PROBLEM.KIND_PREFIX}${FINDING_KINDS.join(LIST_SEPARATOR)}`);
  }
  if (entry.kind === FINDING_KIND.THEORY &&
    !THEORY_STATUSES.includes(entry.status)) {
    problems.push(`${PROBLEM.THEORY_STATUS_PREFIX}${THEORY_STATUSES.join(LIST_SEPARATOR)}`);
  }
  return problems;
}

function problemsForVerification(entry) {
  const problems = [];
  if (!text(entry.verifier).startsWith(VERIFIER_PREFIX)) {
    problems.push(`${PROBLEM.VERIFIER_PREFIX}${VERIFIER_PREFIX}${PROBLEM.VERIFIER_SUFFIX}`);
  }
  if (!VERDICTS.includes(entry.verdict)) {
    problems.push(`${PROBLEM.VERDICT_PREFIX}${VERDICTS.join(OR_SEPARATOR)}`);
  }
  return problems;
}

function problemsForTerminal(entry) {
  const problems = [];
  const statuses = [...TERMINAL_STATUSES, QUEST_STATUS.BLOCKED];
  if (!statuses.includes(entry.status)) {
    problems.push(`${PROBLEM.TERMINAL_PREFIX}${statuses.join(LIST_SEPARATOR)}`);
  }
  if (entry.status === QUEST_STATUS.BLOCKED &&
    !NEXT_OWNERS.includes(entry.nextOwner)) {
    problems.push(`${PROBLEM.NEXT_OWNER_PREFIX}${NEXT_OWNERS.join(ALTERNATIVE_SEPARATOR)}`);
  }
  return problems;
}

const ENTRY_RULES = Object.freeze({
  [ENTRY_TYPE.FINDING]: problemsForFinding,
  [ENTRY_TYPE.ATTEMPT]: () => [],
  [ENTRY_TYPE.VERIFICATION]: problemsForVerification,
  [ENTRY_TYPE.TERMINAL]: problemsForTerminal,
});

/**
 * Problems with one log entry a v2 command is about to append. Legacy
 * entries copied verbatim by the migration are never validated here.
 * @param {Object} entry
 * @return {string[]}
 */
function entryProblems(entry) {
  if (!isPlainObject(entry)) return [PROBLEM.ENTRY_NOT_OBJECT];
  if (!ENTRY_TYPES.includes(entry.type)) {
    return [`${PROBLEM.TYPE_PREFIX}${ENTRY_TYPES.join(LIST_SEPARATOR)}`];
  }
  const problems = [];
  if (!text(entry.text)) problems.push(PROBLEM.TEXT);
  problems.push(...ENTRY_RULES[entry.type](entry));
  return problems;
}

/**
 * Problems with an epic's front-matter.
 * @param {Object} front
 * @return {string[]}
 */
function epicProblems(front) {
  const problems = [];
  if (!isPlainObject(front)) return [PROBLEM.FRONT_MISSING];
  if (!ID_PATTERN.test(text(front.id))) problems.push(PROBLEM.ID);
  if (!EPIC_STATUSES.includes(front.status)) {
    problems.push(`${PROBLEM.STATUS_PREFIX}${EPIC_STATUSES.join(LIST_SEPARATOR)}`);
  }
  if (!EPIC_PROOFS.includes(front.proof)) {
    problems.push(`${PROBLEM.PROOF_PREFIX}${EPIC_PROOFS.join(LIST_SEPARATOR)}`);
  }
  if (front.status === EPIC_STATUS.OPEN && front.legacy !== true &&
    !validProbe(front.doneWhen)) {
    problems.push(PROBLEM.EPIC_DONE_WHEN);
  }
  if (!Array.isArray(front.quests)) problems.push(PROBLEM.QUESTS_LIST);
  if (!Array.isArray(front.authorizes)) problems.push(PROBLEM.AUTHORIZES_LIST);
  return problems;
}

export {
  ALTERNATIVE_SEPARATOR, CERTIFICATION_ONLY_PROBES, CHECKS_DIR, CLASS_FIX, ENTRY_TYPE, ENTRY_TYPES,
  EPICS_DIR, EPIC_PROOF, EPIC_PROOFS, EPIC_STATUS, EPIC_STATUSES,
  EVIDENCE_DIR, FINDING_KIND, FINDING_KINDS, ID_PATTERN, LOG_FILE,
  NEXT_OWNER, NEXT_OWNERS, PROBE, PROBES, QUESTS_DIR, QUEST_FILE,
  QUEST_SCHEMA, QUEST_STATUS, SHA_PATTERN, TERMINAL_STATUSES, THEORY_STATUS,
  THEORY_STATUSES, VERDICT, VERDICTS, VERIFIER_PREFIX, entryProblems,
  epicProblems, isPlainObject, questProblems, text,
};

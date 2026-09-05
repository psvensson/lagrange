// Narrow amendments to a sealed quest declaration.
//
// Goalpost immutability exists so a quest cannot drift toward whatever its
// attempts happen to produce. But three correction shapes kept forcing a full
// park-and-redeclare cycle in the 2026-07-25..27 window (7 respin chains, 16
// quest files) even though the correction was known, narrow, and evidence-
// backed: a wrong sealed `class`, a validation-command wording inside
// doneWhen args, and statement strengthening demanded by a verifier finding.
// An amendment records exactly those three, append-only, evidence-linked, and
// capped — everything else still requires a successor quest.
//
// The enforcement seam stays validateGoalpostsImmutable: it compares the
// quest file against sealed ⊕ amendments, so an unamended edit of the same
// fields still violates, and amendments never touch `doneWhen.probe`,
// frontier identity, or metrics.

import {
  EVENT_FINDING,
  EVENT_QUEST_DECLARED,
  QUEST_CLASSES,
} from './constants.js';
import {
  appendEvent,
  loadQuest,
  readLog,
  saveQuest,
} from './store.js';
import {lintQuest} from './quest-lint.js';

export const EVENT_QUEST_AMENDED = 'quest-amended';
export const AMENDMENT_KIND_CLASS = 'class-correction';
export const AMENDMENT_KIND_ORACLE_COMMAND = 'oracle-command-correction';
export const AMENDMENT_KIND_STATEMENT = 'statement-strengthen';
// Widens the sealed verification bar by one template category after a
// verifier surfaced a genuinely new attack category (recorded once as an
// out-of-bar rejection finding). Requirements discovered at verification time
// land in the declaration this way instead of extending an unbounded
// rejection sequence.
const LOCAL_STR_OWNED_001 = 'verification-bar-expansion';
const BAR_EXPANSION_TEMPLATE_USAGE =
  'amend: verification-bar-expansion requires --template ' +
  '<kebab-case-category>';
export const AMENDMENT_KIND_BAR_EXPANSION = LOCAL_STR_OWNED_001;
// Raises the receipt bar and nothing else. oracle-command-correction can
// rewrite doneWhen args arbitrarily, so it is gated behind a recorded verifier
// rejection; but ADDING required receipts is monotone — it can only make the
// quest harder to close — so routing it through that gate created a dead end:
// the rejection that demands new receipts can only be recorded against the
// bytes it rejected, and repairing them is what invalidates those bytes. This
// kind is safe by construction (strict superset, same probe, same receipt
// file) and therefore needs no rejection finding at all.
const LOCAL_STR_OWNED_002 = 'receipt-bar-strengthen';
export const AMENDMENT_KIND_RECEIPT_BAR = LOCAL_STR_OWNED_002;
export const AMENDMENT_KINDS = Object.freeze([
  AMENDMENT_KIND_CLASS,
  AMENDMENT_KIND_ORACLE_COMMAND,
  AMENDMENT_KIND_STATEMENT,
  AMENDMENT_KIND_BAR_EXPANSION,
  AMENDMENT_KIND_RECEIPT_BAR,
]);
// Kinds that do NOT require a recorded verifier-rejection finding:
// class-correction (its verdict is a command output, and lintQuest re-checks
// the result) and receipt-bar-strengthen (monotone by validation).
const UNGATED_AMENDMENT_KINDS = Object.freeze([
  AMENDMENT_KIND_CLASS,
  AMENDMENT_KIND_RECEIPT_BAR,
]);
// The 3rd correction is not a correction — it is drift. The successor path
// (park + `solve new --from`) stays the answer, same shape as the
// SAME_GUARD_OVERRIDE_LIMIT rule for guards that keep firing.
export const QUEST_AMENDMENT_LIMIT = 2;
// Monotone kinds only ever make the quest harder (a wider sealed bar, a
// stronger receipt requirement), so the drift argument does not apply; they
// carry their own, separate lifetime cap and never spend a correction.
export const MONOTONE_AMENDMENT_KINDS = Object.freeze([
  AMENDMENT_KIND_BAR_EXPANSION,
  AMENDMENT_KIND_RECEIPT_BAR,
]);
const LOCAL_NUM_MONOTONE_AMENDMENT_LIMIT = 4;
const LOCAL_STR_MONOTONE_LABEL = 'monotone amendment(s)';
const LOCAL_STR_CORRECTION_LABEL = 'amendment(s)';
export const MONOTONE_AMENDMENT_LIMIT = LOCAL_NUM_MONOTONE_AMENDMENT_LIMIT;

function amendmentBudget(kind, amendments) {
  const monotone = MONOTONE_AMENDMENT_KINDS.includes(kind);
  const counted = amendments.filter((amendment) =>
    MONOTONE_AMENDMENT_KINDS.includes(amendment.amendmentKind) === monotone);
  return {
    counted,
    limit: monotone ? MONOTONE_AMENDMENT_LIMIT : QUEST_AMENDMENT_LIMIT,
    label: monotone ? LOCAL_STR_MONOTONE_LABEL : LOCAL_STR_CORRECTION_LABEL,
  };
}

export function questAmendments(log) {
  return log.filter((event) => event.type === EVENT_QUEST_AMENDED &&
    AMENDMENT_KINDS.includes(event.amendmentKind));
}

// sealed ⊕ ordered amendments. Pure; both honesty checking and the amend verb
// derive the effective declaration through this one function.
export function applyAmendments(sealed, amendments) {
  const effective = {...sealed};
  for (const amendment of amendments) {
    if (amendment.amendmentKind === AMENDMENT_KIND_CLASS) {
      effective.class = amendment.class;
    }
    if (amendment.amendmentKind === AMENDMENT_KIND_STATEMENT) {
      effective.statement = amendment.statement;
    }
    if (amendment.amendmentKind === AMENDMENT_KIND_ORACLE_COMMAND &&
      effective.doneWhen) {
      effective.doneWhen = {
        ...effective.doneWhen,
        args: amendment.doneWhenArgs,
      };
    }
    if (amendment.amendmentKind === AMENDMENT_KIND_BAR_EXPANSION) {
      effective.verificationTemplates = [
        ...(effective.verificationTemplates || []),
        amendment.template,
      ];
    }
    if (amendment.amendmentKind === AMENDMENT_KIND_RECEIPT_BAR &&
      effective.doneWhen) {
      effective.doneWhen = {
        ...effective.doneWhen,
        args: amendment.doneWhenArgs,
      };
      // The sealed projection carries frontierMetrics (not frontiers), and
      // validateGoalpostsImmutable compares against it, so the raised bar has
      // to land there or an honest amendment would read as goalpost drift.
      effective.frontierMetrics = strengthenedMetrics(
        effective.frontierMetrics, effective.doneWhen.probe,
        amendment.doneWhenArgs);
    }
  }
  return effective;
}

// The test-receipt probe measures ONLY requiredReceipts, so a bar raised in
// doneWhen alone would be a bar nothing measures. A metric that shares the
// probe AND the receipt file is the one doneWhen speaks for; any other metric
// measures something else and is left untouched.
function strengthenMetric(metric, probe, doneWhenArgs) {
  if (!metric || metric.probe !== probe ||
    metric.args?.file !== doneWhenArgs.file) {
    return metric;
  }
  return {...metric, args: doneWhenArgs};
}

function strengthenedMetrics(metrics, probe, doneWhenArgs) {
  if (!Array.isArray(metrics)) return metrics;
  return metrics.map((metric) =>
    strengthenMetric(metric, probe, doneWhenArgs));
}

// The verifier-driven kinds require a VERIFIER finding, referenced exactly
// (its ts or subagent evidence ref) or by a substantial claim excerpt. A
// substring over any finding kind would let a self-authored one-word finding
// launder any amendment — the excerpt floor and the kind restriction are the
// teeth of the evidence-linkage rule.
const VERIFIER_REJECTION_FINDING_KIND = 'verifier-rejection';
const AMEND_PREFIX = 'amend: ';
const LIST_SEP = ', ';
const MIN_CLAIM_EXCERPT_LENGTH = 12;

function verifierFindingReferenced(log, reference) {
  const needle = String(reference || '').trim();
  if (!needle) return false;
  return log.some((event) => event.type === EVENT_FINDING &&
    event.kind === VERIFIER_REJECTION_FINDING_KIND &&
    (String(event.ts) === needle ||
      String(event.evidence || '') === needle ||
      (needle.length >= MIN_CLAIM_EXCERPT_LENGTH &&
        String(event.claim || '').includes(needle))));
}

function amendedQuestFile(quest, amendment, effective) {
  const next = {...quest};
  if (amendment.amendmentKind === AMENDMENT_KIND_CLASS) {
    next.class = amendment.class;
  }
  if (amendment.amendmentKind === AMENDMENT_KIND_STATEMENT) {
    next.statement = amendment.statement;
  }
  if (amendment.amendmentKind === AMENDMENT_KIND_ORACLE_COMMAND) {
    next.doneWhen = {...next.doneWhen, args: amendment.doneWhenArgs};
  }
  if (amendment.amendmentKind === AMENDMENT_KIND_RECEIPT_BAR) {
    next.doneWhen = {...next.doneWhen, args: amendment.doneWhenArgs};
    // The file carries whole frontiers; the sealed projection carries only
    // their metrics. Both move, through the same rule.
    next.frontiers = Array.isArray(next.frontiers) ?
      next.frontiers.map((frontier) => ({
        ...frontier,
        metric: strengthenMetric(
          frontier?.metric, next.doneWhen.probe, amendment.doneWhenArgs),
      })) :
      next.frontiers;
  }
  if (amendment.amendmentKind === AMENDMENT_KIND_BAR_EXPANSION) {
    // Rebuild from the sealed-effective list, never the file's own: a file
    // that drifted from the declaration must not compound through amendment.
    next.verificationTemplates = [
      ...(effective.verificationTemplates || []),
      amendment.template,
    ];
  }
  return next;
}

const RECEIPT_BAR_FILE_CHANGE_PROBLEM =
  'amend: receipt-bar-strengthen cannot change the receipt file (sealed ';
const RECEIPT_BAR_FILE_CHANGE_SUFFIX =
  '); a different oracle is a successor quest';
const RECEIPT_BAR_DROP_PROBLEM =
  'amend: receipt-bar-strengthen only ADDS receipts — it cannot drop ';
const RECEIPT_BAR_DROP_SUFFIX =
  '. Removing or rewriting a sealed receipt is oracle-command-correction ' +
  '(which requires a verifier-rejection finding), or a successor quest';
const REQUIRED_RECEIPTS_KEY = 'requiredReceipts';
const FILE_KEY = 'file';
const RECEIPT_BAR_KEY_SET_PROBLEM =
  'amend: receipt-bar-strengthen must restate the sealed doneWhen args ' +
  'exactly, changing only requiredReceipts; expected key(s): ';
const RECEIPT_BAR_KEY_SET_GOT = '; got: ';
const RECEIPT_BAR_SIBLING_KEY_PROBLEM =
  'amend: receipt-bar-strengthen cannot change the sealed doneWhen arg ';
const RECEIPT_BAR_ID_PROBLEM =
  'amend: receipt-bar-strengthen requires unique, non-empty receipt ids; a ' +
  'duplicate or non-string id would raise the count without raising the bar ' +
  'and could never be removed';
const RECEIPT_BAR_NO_OP_PROBLEM =
  'amend: receipt-bar-strengthen must add at least one receipt; the sealed ' +
  'bar already requires every receipt listed';
const REJECTION_FINDING_GUIDANCE =
  ' Record one with: solve finding --id <quest> --frontier <frontier> ' +
  '--kind verifier-rejection --evidence subagent:<id> --review <reviewId> ' +
  '--verification-scope attempt|candidate --verification-fingerprint <the ' +
  'review manifest fingerprint> --finding "<category>: <what concretely ' +
  'failed>" --claim "<summary>". If you only need to ADD required receipts, ' +
  'use --kind receipt-bar-strengthen, which needs no rejection finding.';
const AMEND_EVIDENCE_PROBLEM_SUFFIX =
  ' requires --evidence referencing a recorded verifier-rejection finding ' +
  '(its ts, its evidence ref, or a claim excerpt of at least ';
const AMEND_EVIDENCE_PROBLEM_TAIL = ' characters).';
const RECEIPT_BAR_USAGE =
  'amend: receipt-bar-strengthen requires --done-when-args ' +
  '\'{"file":"<same receipt file>","requiredReceipts":[...]}\' whose ' +
  'requiredReceipts is a strict SUPERSET of the sealed list (the probe and ' +
  'the receipt file are immutable)';

function parseDoneWhenArgs(args) {
  try {
    const parsed = JSON.parse(String(args['done-when-args'] || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ?
      parsed :
      null;
  } catch {
    return null;
  }
}

// Monotone by validation, checked as SETS and in BOTH directions. Every read
// is an own-property read: a polluted Object.prototype must not be able to
// supply a `file` the caller never wrote.
function ownValue(record, key) {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function uniqueStrings(values) {
  const seen = new Set();
  for (const value of values) {
    // Whitespace padding yields an id no receipt can match and which this
    // kind can never drop: fail closed rather than brick the oracle.
    if (typeof value !== 'string' || value.trim().length === 0 ||
      value !== value.trim()) {
      return null;
    }
    if (seen.has(value)) return null;
    seen.add(value);
  }
  return seen;
}

// Keys other than requiredReceipts are part of the sealed oracle: this kind
// may add receipts and change nothing else, so they must be present and
// byte-identical. Checking only for UNEXPECTED keys let a sealed key be
// dropped or rewritten with no verifier gate at all.
function unchangedSiblingKeyProblem(sealedArgs, doneWhenArgs) {
  const sealedKeys = Object.keys(sealedArgs).sort();
  const nextKeys = Object.keys(doneWhenArgs).sort();
  if (sealedKeys.length !== nextKeys.length ||
    sealedKeys.some((key, index) => key !== nextKeys[index])) {
    return RECEIPT_BAR_KEY_SET_PROBLEM + sealedKeys.join(LIST_SEP) +
      RECEIPT_BAR_KEY_SET_GOT + nextKeys.join(LIST_SEP);
  }
  for (const key of sealedKeys) {
    if (key === REQUIRED_RECEIPTS_KEY) continue;
    if (JSON.stringify(ownValue(sealedArgs, key)) !==
      JSON.stringify(ownValue(doneWhenArgs, key))) {
      return RECEIPT_BAR_SIBLING_KEY_PROBLEM + key;
    }
  }
  return null;
}

function buildReceiptBarAmendment(effective, args) {
  const doneWhenArgs = parseDoneWhenArgs(args);
  if (!doneWhenArgs) {
    throw new Error(RECEIPT_BAR_USAGE);
  }
  const sealedArgs = effective.doneWhen?.args || {};
  const sealedList = ownValue(sealedArgs, REQUIRED_RECEIPTS_KEY);
  const nextList = ownValue(doneWhenArgs, REQUIRED_RECEIPTS_KEY);
  if (!Array.isArray(sealedList) || !Array.isArray(nextList)) {
    throw new Error(RECEIPT_BAR_USAGE);
  }
  if (ownValue(doneWhenArgs, FILE_KEY) !== ownValue(sealedArgs, FILE_KEY)) {
    throw new Error(RECEIPT_BAR_FILE_CHANGE_PROBLEM +
      ownValue(sealedArgs, FILE_KEY) + RECEIPT_BAR_FILE_CHANGE_SUFFIX);
  }
  const keyProblem = unchangedSiblingKeyProblem(sealedArgs, doneWhenArgs);
  if (keyProblem) {
    throw new Error(keyProblem);
  }
  const nextSet = uniqueStrings(nextList);
  if (nextSet === null) {
    throw new Error(RECEIPT_BAR_ID_PROBLEM);
  }
  const dropped = sealedList.filter((receipt) => !nextSet.has(receipt));
  if (dropped.length > 0) {
    throw new Error(RECEIPT_BAR_DROP_PROBLEM + dropped.join(LIST_SEP) +
      RECEIPT_BAR_DROP_SUFFIX);
  }
  // Set-wise, not length-wise: [a,b] -> [a,b,b] is longer but adds nothing.
  const sealedSet = new Set(sealedList);
  if (nextSet.size <= sealedSet.size) {
    throw new Error(RECEIPT_BAR_NO_OP_PROBLEM);
  }
  return {amendmentKind: AMENDMENT_KIND_RECEIPT_BAR, doneWhenArgs,
    prior: {doneWhenArgs: sealedArgs}};
}

function buildAmendment(effective, args) {
  const kind = String(args.kind || '');
  if (kind === AMENDMENT_KIND_CLASS) {
    const nextClass = String(args.class || '');
    if (!QUEST_CLASSES.includes(nextClass)) {
      throw new Error(
        `amend: --class must be one of ${QUEST_CLASSES.join('|')}`);
    }
    if (nextClass === effective.class) {
      throw new Error(`amend: class is already "${nextClass}"`);
    }
    return {amendmentKind: kind, class: nextClass,
      prior: {class: effective.class}};
  }
  if (kind === AMENDMENT_KIND_STATEMENT) {
    const statement = String(args.statement || '');
    const prior = String(effective.statement || '');
    if (!statement.startsWith(prior) || statement.length <= prior.length) {
      throw new Error(
        'amend: statement-strengthen only appends — the new statement must ' +
        'begin with the sealed statement and add to it; anything else is a ' +
        'successor quest');
    }
    return {amendmentKind: kind, statement,
      prior: {statement: prior}};
  }
  if (kind === AMENDMENT_KIND_ORACLE_COMMAND) {
    let doneWhenArgs = null;
    try {
      doneWhenArgs = JSON.parse(String(args['done-when-args'] || ''));
    } catch {
      doneWhenArgs = null;
    }
    if (!doneWhenArgs || typeof doneWhenArgs !== 'object' ||
      Array.isArray(doneWhenArgs)) {
      throw new Error(
        'amend: oracle-command-correction requires --done-when-args ' +
        '\'<json object>\' (the probe itself is immutable)');
    }
    return {amendmentKind: kind, doneWhenArgs,
      prior: {doneWhenArgs: effective.doneWhen?.args || null}};
  }
  if (kind === AMENDMENT_KIND_RECEIPT_BAR) {
    return buildReceiptBarAmendment(effective, args);
  }
  if (kind === AMENDMENT_KIND_BAR_EXPANSION) {
    const template = String(args.template || '').trim();
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(template)) {
      throw new Error(BAR_EXPANSION_TEMPLATE_USAGE);
    }
    const current = effective.verificationTemplates || [];
    if (current.includes(template)) {
      throw new Error(
        `amend: template "${template}" is already in the sealed bar`);
    }
    return {amendmentKind: kind, template,
      prior: {verificationTemplates: current}};
  }
  throw new Error(`amend: --kind must be one of ${AMENDMENT_KINDS.join('|')}`);
}

export function runAmendCommand(root, args) {
  const questId = args.id || args._?.[0];
  if (!questId) throw new Error('amend: --id <questId> is required');
  const quest = loadQuest(root, questId);
  const log = readLog(root, questId);
  const declared = log.find((event) => event.type === EVENT_QUEST_DECLARED);
  if (!declared) {
    throw new Error(
      'amend: quest is not sealed yet — edit the draft file directly');
  }
  const amendments = questAmendments(log);
  const budget = amendmentBudget(String(args.kind || ''), amendments);
  if (budget.counted.length >= budget.limit) {
    throw new Error(
      `amend: refused — ${budget.counted.length} ${budget.label} already ` +
      `recorded (limit ${budget.limit}). A quest that keeps needing ` +
      'correction is mis-scoped: park it and author a successor with ' +
      '`solve new --from`.');
  }
  const evidence = String(args.evidence || '').trim();
  if (!evidence) {
    throw new Error('amend: --evidence <reference> is required');
  }
  const effective = applyAmendments(declared.sealed, amendments);
  const amendment = buildAmendment(effective, args);
  // class-correction evidence stays free-text by design: the lint/classifier
  // verdict it cites is a command output, not a log event, and the amended
  // class is machine-re-checked by lintQuest below anyway. The verifier-driven
  // kinds must reference an actual recorded verifier finding.
  if (!UNGATED_AMENDMENT_KINDS.includes(amendment.amendmentKind) &&
    !verifierFindingReferenced(log, evidence)) {
    throw new Error(AMEND_PREFIX + amendment.amendmentKind +
      AMEND_EVIDENCE_PROBLEM_SUFFIX + MIN_CLAIM_EXCERPT_LENGTH +
      AMEND_EVIDENCE_PROBLEM_TAIL + REJECTION_FINDING_GUIDANCE);
  }
  const nextQuest = amendedQuestFile(quest, amendment, effective);
  const lint = lintQuest(nextQuest, {root});
  if (lint.errors.length > 0) {
    throw new Error(
      'amend: refused — the amended quest fails authoring lint: ' +
      lint.errors.join('; '));
  }
  // File first, event second. If the event append fails the file briefly
  // disagrees with sealed ⊕ amendments and ensureSealedGoal reports a goalpost
  // violation whose message offers this verb — and re-running amend converges:
  // buildAmendment compares the request against the EFFECTIVE declaration (not
  // the file), so the retry records the missing event and re-saves the same
  // file. The reverse order would burn one of the two lifetime amendments on
  // a lost file write.
  saveQuest(root, nextQuest);
  const stamped = appendEvent(root, questId, {
    type: EVENT_QUEST_AMENDED,
    ...amendment,
    evidence,
  });
  return `amended ${questId} (${amendment.amendmentKind}, ` +
    `${budget.counted.length + 1}/${budget.limit}) at ${stamped.ts}`;
}

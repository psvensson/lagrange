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
export const AMENDMENT_KINDS = Object.freeze([
  AMENDMENT_KIND_CLASS,
  AMENDMENT_KIND_ORACLE_COMMAND,
  AMENDMENT_KIND_STATEMENT,
]);
// The 3rd correction is not a correction — it is drift. The successor path
// (park + `solve new --from`) stays the answer, same shape as the
// SAME_GUARD_OVERRIDE_LIMIT rule for guards that keep firing.
export const QUEST_AMENDMENT_LIMIT = 2;

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
  }
  return effective;
}

// The verifier-driven kinds require a VERIFIER finding, referenced exactly
// (its ts or subagent evidence ref) or by a substantial claim excerpt. A
// substring over any finding kind would let a self-authored one-word finding
// launder any amendment — the excerpt floor and the kind restriction are the
// teeth of the evidence-linkage rule.
const VERIFIER_REJECTION_FINDING_KIND = 'verifier-rejection';
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

function amendedQuestFile(quest, amendment) {
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
  return next;
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
  if (amendments.length >= QUEST_AMENDMENT_LIMIT) {
    throw new Error(
      `amend: refused — ${amendments.length} amendment(s) already recorded ` +
      `(limit ${QUEST_AMENDMENT_LIMIT}). A quest that keeps needing ` +
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
  if (amendment.amendmentKind !== AMENDMENT_KIND_CLASS &&
    !verifierFindingReferenced(log, evidence)) {
    throw new Error(
      `amend: ${amendment.amendmentKind} requires --evidence referencing a ` +
      'recorded verifier-rejection finding (its ts, its evidence ref, or a ' +
      `claim excerpt of at least ${MIN_CLAIM_EXCERPT_LENGTH} characters)`);
  }
  const nextQuest = amendedQuestFile(quest, amendment);
  const lint = lintQuest(nextQuest);
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
    `${amendments.length + 1}/${QUEST_AMENDMENT_LIMIT}) at ${stamped.ts}`;
}

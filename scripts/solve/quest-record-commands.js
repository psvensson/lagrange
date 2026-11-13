// Quest record commands and their shared identity/error ownership. Landing
// imports these same bindings; this owner never imports the landing commands.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  CERTIFICATION_ONLY_PROBES, CLASS_FIX, ENTRY_TYPE, EPIC_PROOF, EPIC_STATUS,
  FINDING_KIND, QUEST_SCHEMA, QUEST_STATUS, TERMINAL_STATUSES,
  entryProblems, epicProblems, questProblems, text,
} from './schema.js';
import {
  appendEntry, evidenceDir, isOpenEpic, listEpics, listQuestIds, questDir,
  questExists, questState, readEpic, readLog, readQuest, writeQuest,
} from './store.js';
import {measure} from './probes.js';
import {SOLVE_PREFIX, changedPaths, headSha} from './guards.js';
import {
  EVIDENCE_REF_PREFIX, deleteSharedEvidenceAsset, uploadAndVerify,
} from './evidence-store.js';

const RECENT_ENTRIES = 3;
const QUESTS_SUBDIR = 'quests';
// The commit is the change record; the log records what happened. A change
// set is named by its size and a bounded sample, never carried whole: a
// cutover-sized attempt would otherwise write half a megabyte per entry into
// durable memory that git already holds exactly.
const CHANGE_SET_SAMPLE = 50;
const PROBLEM_SEPARATOR = '; ';
const SUMMARY_LENGTH = 160;
const SUMMARY_SEPARATOR = ' ';
const MESSAGE = Object.freeze({
  ID_REQUIRED: '--id <quest> is required',
  SOLVED_BY_LAND: 'solved is recorded by land, never by note',
  REJECTION_STANDS: 'the newest verification is a rejection and no attempt is newer than it',
  VERIFICATION_MISSING: 'src/ changes need a verification entry (verifier subagent:<id>)',
  VERIFICATION_STALE: 'src/ changes need a verification entry newer than the last attempt',
  VERIFICATION_NOT_APPROVED: 'src/ changes need an approving verification',
  VERIFICATION_CONTENT_MISMATCH:
    'verification candidate digest does not match the reviewed candidate (reviewed content or proof input was mutated after verification)',
  LAND_REFUSED: 'land refused:',
  PRE_COMMIT_REFUSED:
    'land: the commit-time checks refused the staged tree before any test ran:',
  PROBE_IMMUTABLE: 'the probe is immutable after start (supersede the quest to change it)',
  PROBLEM_BULLET: '- ',
});
const CANDIDATE_HASH_ALGORITHM = 'sha256';
const CANDIDATE_HASH_ENCODING = 'hex';

class SolveError extends Error {}

function refuse(message) {
  throw new SolveError(message);
}

function loadQuestOrRefuse(root, id) {
  if (!text(id)) refuse(MESSAGE.ID_REQUIRED);
  if (!questExists(root, id)) refuse(`no quest ${id} under ${questDir(root, id)}`);
  return readQuest(root, id);
}

function loadEpic(root, quest) {
  if (quest.class === CLASS_FIX || !quest.epic) return null;
  const epic = readEpic(root, quest.epic);
  if (!epic || !epic.front) refuse(`quest ${quest.id} names epic ${quest.epic}, which has no front-matter`);
  const problems = epicProblems(epic.front);
  if (problems.length > 0) refuse(`epic ${quest.epic}: ${problems.join(PROBLEM_SEPARATOR)}`);
  return epic;
}

function openState(root, id) {
  const quest = loadQuestOrRefuse(root, id);
  const log = readLog(root, id);
  const state = questState(log);
  if (state.terminal) refuse(`quest ${id} is ${state.status}; a terminal quest takes no entries`);
  return {quest, log, state};
}

// --- start ---------------------------------------------------------------------

/**
 * Seal a quest: validate quest.json, check the epic, measure the probe and
 * refuse unless it is red, then record the seal with the seal-time value.
 * @param {string} root
 * @param {{id: string}} options
 * @return {Object}
 */
function start(root, options) {
  const quest = loadQuestOrRefuse(root, options.id);
  const problems = questProblems(quest);
  if (problems.length > 0) refuse(`quest ${quest.id}: ${problems.join(PROBLEM_SEPARATOR)}`);
  const log = readLog(root, quest.id);
  const state = questState(log);
  if (state.seal) refuse(`quest ${quest.id} is already sealed at ${state.seal.seal.sealedAt}`);
  if (state.terminal) refuse(`quest ${quest.id} is ${state.status}`);
  const epic = loadEpic(root, quest);
  if (epic && !isOpenEpic(epic)) refuse(`epic ${epic.id} is ${epic.front.status}, not open`);
  if (epic && epic.front.proof !== EPIC_PROOF.CERTIFICATION &&
    CERTIFICATION_ONLY_PROBES.includes(quest.doneWhen.probe)) {
    refuse(`probe ${quest.doneWhen.probe} is terminal evidence only under a ` +
      `certification epic; ${epic.id} is ${epic.front.proof}`);
  }
  const measured = measure(root, quest.doneWhen);
  if (!measured.measuring) {
    refuse(`quest ${quest.id} cannot start on a probe that does not measure ` +
      `(${measured.reason}); make the probe red first`);
  }
  if (measured.done) {
    refuse(`quest ${quest.id} cannot start on a green probe (metric ` +
      `${measured.metric} <= ${measured.target}); write a probe that is red now`);
  }
  const sealedAt = headSha(root);
  const sealed = {...quest, schema: QUEST_SCHEMA, sealedAt};
  writeQuest(root, sealed);
  fs.mkdirSync(evidenceDir(root, quest.id), {recursive: true});
  const entry = appendEntry(root, quest.id, {
    type: ENTRY_TYPE.FINDING,
    kind: FINDING_KIND.DECISION,
    text: `sealed at ${sealedAt}; seal-time probe ${quest.doneWhen.probe} ` +
      `metric=${measured.metric} target=${measured.target} measuring=${measured.measuring}`,
    seal: {sealedAt, statement: quest.statement, doneWhen: quest.doneWhen,
      metric: measured.metric, target: measured.target, measuring: measured.measuring,
      reason: measured.reason},
  });
  return {id: quest.id, sealedAt, probe: measured, entry};
}

// --- note ----------------------------------------------------------------------

function changeSetRecord(paths) {
  const record = {pathCount: paths.length, paths: paths.slice(0, CHANGE_SET_SAMPLE)};
  return paths.length > CHANGE_SET_SAMPLE ? {...record, truncated: true} : record;
}

// The change set a quest is judged on: everything but its own directory.
function pathsOutsideQuest(root, id) {
  return changedPaths(root).filter((filePath) =>
    !filePath.startsWith(`${SOLVE_PREFIX}${QUESTS_SUBDIR}/${id}/`));
}

function computeCandidateDigest(root, quest) {
  const hash = crypto.createHash(CANDIDATE_HASH_ALGORITHM);
  const head = headSha(root);
  hash.update(`head:${head}\n`);

  const changed = pathsOutsideQuest(root, quest.id);
  for (const filePath of changed) {
    const fullPath = path.resolve(root, filePath);
    try {
      if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
        const fileBytes = fs.readFileSync(fullPath);
        const fileHash = crypto.createHash(CANDIDATE_HASH_ALGORITHM)
          .update(fileBytes).digest(CANDIDATE_HASH_ENCODING);
        hash.update(`file:${filePath}:${fileHash}\n`);
      } else {
        hash.update(`deleted:${filePath}\n`);
      }
    } catch {
      hash.update(`unreadable:${filePath}\n`);
    }
  }

  const receiptRelative = quest?.doneWhen?.args?.file;
  if (receiptRelative) {
    const receiptPath = path.resolve(root, receiptRelative);
    try {
      if (fs.existsSync(receiptPath)) {
        const data = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
        const witnessFiles = new Set();
        if (data.testFileDigests && typeof data.testFileDigests === 'object') {
          for (const testFile of Object.keys(data.testFileDigests)) {
            witnessFiles.add(testFile);
          }
        }
        if (Array.isArray(data.receipts)) {
          for (const r of data.receipts) {
            if (r.testFile) witnessFiles.add(r.testFile);
          }
        }
        for (const witnessFile of [...witnessFiles].sort()) {
          const fullWitnessPath = path.resolve(root, witnessFile);
          try {
            if (fs.existsSync(fullWitnessPath) && fs.lstatSync(fullWitnessPath).isFile()) {
              const fileBytes = fs.readFileSync(fullWitnessPath);
              const fileHash = crypto.createHash(CANDIDATE_HASH_ALGORITHM)
                .update(fileBytes).digest(CANDIDATE_HASH_ENCODING);
              hash.update(`witness:${witnessFile}:${fileHash}\n`);
            } else {
              hash.update(`witness-missing:${witnessFile}\n`);
            }
          } catch {
            hash.update(`witness-unreadable:${witnessFile}\n`);
          }
        }
      }
    } catch {
      // receipt not readable yet
    }
  }

  hash.update(`doneWhen:${JSON.stringify(quest?.doneWhen || {})}\n`);
  return hash.digest(CANDIDATE_HASH_ENCODING);
}

function defined(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

// The fields each entry type takes from the note options.
const ENTRY_FIELDS = Object.freeze({
  [ENTRY_TYPE.FINDING]: (options) => defined({kind: options.kind, status: options.status,
    evidence: options.evidence}),
  [ENTRY_TYPE.ATTEMPT]: () => ({}),
  [ENTRY_TYPE.VERIFICATION]: (options) => ({verifier: options.verifier, verdict: options.verdict}),
  [ENTRY_TYPE.TERMINAL]: (options) => defined({status: options.status,
    nextOwner: options.nextOwner, supersededBy: options.supersededBy}),
});

function noteEntry(options) {
  const fields = ENTRY_FIELDS[options.type];
  return {type: options.type, text: text(options.text), ...(fields ? fields(options) : {})};
}

/**
 * Append one entry: finding (kinds), attempt, verification, or a terminal
 * entry other than solved (solved is only ever written by land).
 * @param {string} root
 * @param {Object} options
 * @return {Object}
 */
function note(root, options) {
  const {quest, state} = openState(root, options.id);
  const entry = noteEntry(options);
  const problems = entryProblems(entry);
  if (problems.length > 0) refuse(`note: ${problems.join(PROBLEM_SEPARATOR)}`);
  if (entry.type === ENTRY_TYPE.TERMINAL && entry.status === QUEST_STATUS.SOLVED) {
    refuse(MESSAGE.SOLVED_BY_LAND);
  }
  if (entry.type === ENTRY_TYPE.ATTEMPT && !state.seal) {
    refuse(`quest ${quest.id} is not sealed; run start first`);
  }
  if (entry.type === ENTRY_TYPE.ATTEMPT) {
    entry.at = headSha(root);
    Object.assign(entry, changeSetRecord(pathsOutsideQuest(root, quest.id)));
  }
  if (entry.type === ENTRY_TYPE.VERIFICATION) {
    entry.at = headSha(root);
    entry.candidateDigest = computeCandidateDigest(root, quest);
  }
  return {id: quest.id, entry: appendEntry(root, quest.id, entry)};
}

// --- probe ---------------------------------------------------------------------

function summarize(entry) {
  const head = [entry.ts, entry.type, entry.kind || entry.verdict || entry.status]
    .filter(Boolean).join(SUMMARY_SEPARATOR);
  return `${head}: ${String(entry.text || entry.summary || '').slice(0, SUMMARY_LENGTH)}`;
}

/**
 * Measure a quest's (or, with --epic, an epic's) doneWhen and show the delta
 * from the seal-time value and the last three log entries.
 * @param {string} root
 * @param {{id?: string, epic?: string}} options
 * @return {Object}
 */
function probe(root, options) {
  if (options.epic) {
    const epic = readEpic(root, options.epic);
    if (!epic || !epic.front) refuse(`no epic ${options.epic}`);
    const problems = epicProblems(epic.front);
    if (problems.length > 0) refuse(`epic ${epic.id}: ${problems.join(PROBLEM_SEPARATOR)}`);
    return {epic: epic.id, status: epic.front.status,
      probe: epic.front.doneWhen ? measure(root, epic.front.doneWhen) : null};
  }
  const quest = loadQuestOrRefuse(root, options.id);
  const log = readLog(root, quest.id);
  const state = questState(log);
  const measured = measure(root, quest.doneWhen);
  const sealMetric = state.seal?.seal?.metric ?? null;
  return {
    id: quest.id,
    status: state.status,
    blocked: state.blocked ? {nextOwner: state.blocked.nextOwner,
      text: state.blocked.text} : null,
    probe: measured,
    sealMetric,
    delta: sealMetric === null || measured.metric === null ? null :
      measured.metric - sealMetric,
    attempts: state.attempts.length,
    attemptsSinceAltitudeCheck: state.attemptsSinceAltitudeCheck.length,
    recent: log.slice(-RECENT_ENTRIES).map(summarize),
  };
}

// --- evidence add ----------------------------------------------------------------

/**
 * Upload a file to the evidence store, verify it, and record an evidence
 * finding carrying the sha256 reference and URL.
 * @param {string} root
 * @param {{id: string, file: string, tmpdir: string, run?: Function}} options
 * @return {Object}
 */
/**
 * Remove one published evidence asset the operator authorized removing. The
 * quest record is not touched: a deletion undoes an upload that should not have
 * happened, and inventing a log entry for it would be recording work.
 * @param {string} root
 * @param {{asset: string, authorizedAsset: ?string, run?: Function}} options
 * @return {{asset: string}}
 */
function evidenceDelete(root, options) {
  return deleteSharedEvidenceAsset({asset: options.asset,
    authorizedAsset: options.authorizedAsset, run: options.run});
}

function evidenceAdd(root, options) {
  const {quest} = openState(root, options.id);
  const file = path.resolve(root, options.file);
  if (!fs.existsSync(file)) refuse(`no file ${options.file}`);
  const uploaded = uploadAndVerify({file, questId: quest.id,
    replace: options.replace === true, run: options.run,
    tmpdir: options.tmpdir, root});
  const entry = appendEntry(root, quest.id, {
    type: ENTRY_TYPE.FINDING,
    kind: FINDING_KIND.EVIDENCE,
    text: text(options.text) || `evidence ${uploaded.asset} uploaded and verified`,
    evidence: `${EVIDENCE_REF_PREFIX}${uploaded.sha256}`,
    asset: uploaded.asset,
    url: uploaded.url,
    bytes: uploaded.bytes,
  });
  return {id: quest.id, uploaded, entry};
}

// --- board ------------------------------------------------------------------------

/**
 * Open epics with their open quests, computed on demand; nothing is written.
 * @param {string} root
 * @return {Object}
 */
function board(root) {
  const quests = listQuestIds(root).map((id) => {
    const quest = readQuest(root, id);
    const state = questState(readLog(root, id));
    return {id, epic: quest.epic || null, class: quest.class || null,
      status: state.status, sealed: Boolean(state.seal),
      attempts: state.attempts.length,
      nextOwner: state.blocked?.nextOwner || null};
  });
  const openQuests = quests.filter((quest) => !TERMINAL_STATUSES.includes(quest.status));
  const epics = listEpics(root).map((epic) => ({
    id: epic.id, status: epic.front.status, proof: epic.front.proof,
    legacy: epic.front.legacy === true,
    quests: openQuests.filter((quest) => quest.epic === epic.id).map((quest) => quest.id),
  }));
  return {
    epics: epics.filter((epic) => epic.status === EPIC_STATUS.OPEN),
    quests: openQuests,
    counts: {epics: epics.length, quests: quests.length},
  };
}

export {
  MESSAGE, SolveError, board, changeSetRecord, computeCandidateDigest, evidenceAdd,
  evidenceDelete, loadEpic, note, openState, pathsOutsideQuest, probe, refuse, start,
};

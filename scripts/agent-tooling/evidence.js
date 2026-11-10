// Read-only admission of retained observations. Semantic coverage is judged by
// the independent Quest verifier; source identity and execution are checked here.
import fs from 'node:fs';
import path from 'node:path';
import {requiredProofArtifacts} from '../solve/probes.js';
import {questState, readLog} from '../solve/store.js';
import {computeCandidateDigest, verificationProblems} from '../solve/commands.js';
import {PROFILE_PATH, loadProfile, sha256} from './profile.js';
import {inspectInstallation} from './configuration.js';
import {backendIdentity, parserIdentity, readRuntime} from './runtime.js';
import {readObservation} from './evidence-records.js';
import {validateComponent} from './component-evidence.js';
import {applicableFiles, PROOF_FILES} from './evidence-scope.js';
import {INSTALLATION_STATUS, MCP_TOOL, TOOLING_EXECUTABLE, TOOLING_SERVER} from './host-protocol.js';
import {CODEX_EVENT, CODEX_ITEM, MAX_RECEIPT_BYTES, OBSERVATION_KIND, OBSERVATION_PHASE,
  TOOLING_QUEST, TOOL_STATUS, VERIFIER_PREFIX} from './evidence-contract.js';

const REVIEW_STATE = Object.freeze({
  BLOCKED: 'blocked',
  APPROVE: 'approve',
});
const OUTPUT_STREAM = Object.freeze({
  STDOUT: 'stdout',
  STDERR: 'stderr',
});
const INVALID_EVIDENCE = Object.freeze({
  WORKTREE: 'wrong worktree',
  COMMIT: 'source commit missing',
  FILES: 'source files missing',
  OBSERVATION_ID: 'observation identity missing',
  KIND: 'unknown observation kind',
  PHASE: 'observation phase missing',
  OBSERVATION_SOURCE: 'observation source/worktree missing',
  OBSERVATION_FILES: 'observation source files missing',
  COMMAND: 'command missing',
  TIME: 'execution time missing',
  INCOMPLETE: 'execution incomplete',
  OUTPUT: 'output missing',
  HOST: 'host identity missing',
  PROFILE_SOURCE: 'observation profile does not match its source',
  SOURCE_CHANGED: 'source changed during execution',
  CONFIGURATION_CHANGED: 'configuration changed during execution',
  LANDING: 'not a canonical commit-only landing transition',
  HOST_VERSION: 'wrong host version',
  PROFILE_STALE: 'stale observation profile',
  CONFIGURATION_STALE: 'stale observation configuration',
  HISTORICAL_SOURCE: 'historical source bytes missing',
  HISTORICAL_HOST: 'historical host does not match its actual profile',
  AUTHORING_SOURCE: 'authoring result source bytes missing',
  AUTHORING_CHANGE: 'authoring change identity missing',
  CODEX_STREAM: 'not a Codex event stream',
  CODEX_TURN: 'Codex turn incomplete',
  REVIEW_STALE: 'review is stale or held',
  REVIEW_MISSING: 'independent approval missing',
  REVIEW_BYTES: 'review does not cover these retained bytes',
  REVIEW_CANDIDATE: 'review candidate identity missing',
  REVIEW_CURRENCY: 'canonical verification currency rejected',
  RECEIPT_DECLARATION: 'exactly one compact receipt required',
  RECEIPT_SIZE: 'raw output belongs in the evidence store',
  SCHEMA: 'wrong evidence schema or Quest',
  AUTHOR: 'author identity missing',
  PROFILE: 'wrong profile version',
  OBSERVATIONS: 'no actual observations',
  DUPLICATE: 'duplicate observation',
  COVERAGE: 'coverage missing',
});
const PATH_SEPARATOR = '/';
const WINDOWS_SEPARATOR = '\\';
const CURRENT_DIRECTORY = '.';
const PARENT_DIRECTORY = '..';
const TOOLING_TEST_PREFIX = 'agent-tooling-';
const TEST_EXTENSION = '.test.js';
const SCRIPT_TEST_DIRECTORY = 'test/scripts';
const JSON_FLAG = '--json';
const SOLVE_ENTRYPOINT = 'scripts/solve.js';
const LAND_COMMAND = 'land';
const QUEST_ID_FLAG = '--id';
const LAND_COMMAND_ARITY = 5;
const QUEST_ID_FLAG_INDEX = 3;
const ADMISSION_REASON = 'retained observations independently admitted';
const REFUSAL = Object.freeze({
  EVIDENCE_PATH_INVALID: 'tooling_evidence_path_invalid',
});


const SCHEMA = 'quest-agent-tooling-evidence/1';
const HEX_SHA = /^[0-9a-f]{64}$/u;
const GIT_SHA = /^[0-9a-f]{40}$/u;
const OWNED_TREES = ['scripts/agent-tooling', '.agents/skills', 'test/solve'];
const OWNED_FILES = [...PROOF_FILES, PROFILE_PATH, 'scripts/checks/quest-agent-tooling-acceptance.js',
  'scripts/solve/script-artifacts.js', 'scripts/solve/probes.js', 'scripts/solve/schema.js',
  'scripts/solve/evidence-store.js', 'scripts/quest-evidence/quest-agent-tooling.js',
  'scripts/quest-evidence/quest-agent-tooling-receipt.js',
  'scripts/quest-evidence/quest-agent-tooling-lifecycle.py',
  'docs/development/agent-tooling.md', 'test/scripts/agent-tooling-configuration.test.js',
  'test/scripts/agent-tooling-evidence.test.js', 'test/solve/probes.test.js',
  'test/scripts/publish-head.test.js',
  'AGENTS.md', 'docs/steering/rules.md', 'docs/steering/router.md',
  'docs/steering/workflow-guidelines/solver-quests.md', 'docs/development/quest-artifacts.md',
  'package.json', 'package-lock.json'];

function configurationIdentity(root, profile) {
  const {state, config} = inspectInstallation(root);
  if (state === null) return {status: INSTALLATION_STATUS.ABSENT};
  return {status: INSTALLATION_STATUS.CONFIGURED, state, configDigest: sha256(config),
    runtime: readRuntime(root, profile), backend: backendIdentity(root, profile),
    parser: parserIdentity(root)};
}

function containedFile(root, relative) {
  if (typeof relative !== 'string' || relative.length === 0 || path.isAbsolute(relative) ||
    relative.includes(WINDOWS_SEPARATOR) || relative.split(PATH_SEPARATOR).some((part) => ['', CURRENT_DIRECTORY, PARENT_DIRECTORY].includes(part))) {
    throw new Error(REFUSAL.EVIDENCE_PATH_INVALID);
  }
  const file = path.join(root, relative);
  const actual = fs.realpathSync(file);
  if (actual !== file || !actual.startsWith(`${root}${path.sep}`) || !fs.statSync(file).isFile()) {
    throw new Error(`tooling_evidence_path_escape: ${relative}`);
  }
  return file;
}

function sourceFiles(root) {
  const files = new Set(OWNED_FILES);
  const visit = (relative) => {
    for (const entry of fs.readdirSync(path.join(root, relative), {withFileTypes: true})) {
      if (entry.name === '__pycache__') continue;
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.add(file);
      else throw new Error(`tooling_source_link_unsupported: ${file}`);
    }
  };
  OWNED_TREES.forEach(visit);
  for (const file of fs.readdirSync(path.join(root, SCRIPT_TEST_DIRECTORY))) {
    if (file.startsWith(TOOLING_TEST_PREFIX) && file.endsWith(TEST_EXTENSION)) {
      files.add(`test/scripts/${file}`);
    }
  }
  return [...files].sort();
}

function sourceDigests(root) {
  return Object.fromEntries(sourceFiles(root).map((file) =>
    [file, sha256(fs.readFileSync(containedFile(root, file)))]));
}

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`tooling_evidence_invalid: ${message}`);
}

function validateSource(root, source, files) {
  requireEvidence(source?.root === fs.realpathSync(root), INVALID_EVIDENCE.WORKTREE);
  requireEvidence(GIT_SHA.test(source.commit), INVALID_EVIDENCE.COMMIT);
  requireEvidence(source.files !== null && typeof source.files === 'object', INVALID_EVIDENCE.FILES);
  for (const file of files) {
    const digest = source.files[file];
    requireEvidence(HEX_SHA.test(digest) &&
      sha256(fs.readFileSync(containedFile(root, file))) === digest, `stale source: ${file}`);
  }
}

function validateObservation(root, observation, profile, files = sourceFiles(root)) {
  requireEvidence(typeof observation.id === 'string' && observation.id.length > 0,
    INVALID_EVIDENCE.OBSERVATION_ID);
  requireEvidence([OBSERVATION_KIND.COMMAND, OBSERVATION_KIND.CODEX].includes(observation.kind),
    INVALID_EVIDENCE.KIND);
  requireEvidence([OBSERVATION_PHASE.BASELINE, OBSERVATION_PHASE.CANDIDATE,
    OBSERVATION_PHASE.CONTROL, OBSERVATION_PHASE.AUTHORING, OBSERVATION_PHASE.LANDING].includes(observation.phase),
  INVALID_EVIDENCE.PHASE);
  requireEvidence(observation.cwd === root && observation.source?.root === root &&
    GIT_SHA.test(observation.source.commit), INVALID_EVIDENCE.OBSERVATION_SOURCE);
  requireEvidence(observation.source.files && typeof observation.source.files === 'object',
    INVALID_EVIDENCE.OBSERVATION_FILES);
  requireEvidence(Array.isArray(observation.command) && observation.command.length > 0 &&
    observation.command.every((part) => typeof part === 'string'), INVALID_EVIDENCE.COMMAND);
  requireEvidence(Number.isFinite(Date.parse(observation.startedAt)) &&
    Date.parse(observation.endedAt) >= Date.parse(observation.startedAt), INVALID_EVIDENCE.TIME);
  const completed = Number.isInteger(observation.exitCode) && observation.error === null &&
    observation.signal === null;
  requireEvidence(completed || observation.phase === OBSERVATION_PHASE.BASELINE,
    INVALID_EVIDENCE.INCOMPLETE);
  for (const stream of [OUTPUT_STREAM.STDOUT, OUTPUT_STREAM.STDERR]) {
    requireEvidence(typeof observation[stream] === 'string' &&
      sha256(observation[stream]) === observation[`${stream}Sha256`], `altered ${stream}`);
  }
  requireEvidence(observation.stdout.length + observation.stderr.length > 0 ||
    (observation.phase === OBSERVATION_PHASE.BASELINE && !completed), INVALID_EVIDENCE.OUTPUT);
  requireEvidence(observation.host?.name === profile.host.name &&
    /^\d+\.\d+\.\d+$/u.test(observation.host.version), INVALID_EVIDENCE.HOST);
  requireEvidence(observation.profileDigest === observation.source.files[PROFILE_PATH],
    INVALID_EVIDENCE.PROFILE_SOURCE);
  if ([OBSERVATION_PHASE.CANDIDATE, OBSERVATION_PHASE.CONTROL].includes(observation.phase)) {
    requireEvidence(observation.sourceAfter?.root === observation.source.root &&
      observation.sourceAfter.commit === observation.source.commit && files.every((file) =>
      observation.sourceAfter.files[file] === observation.source.files[file]),
    INVALID_EVIDENCE.SOURCE_CHANGED);
  }
  if (observation.phase !== OBSERVATION_PHASE.BASELINE) {
    requireEvidence(JSON.stringify(observation.configuration) ===
      JSON.stringify(observation.configurationAfter), INVALID_EVIDENCE.CONFIGURATION_CHANGED);
  }
  if (observation.phase === OBSERVATION_PHASE.LANDING) {
    requireEvidence(observation.kind === OBSERVATION_KIND.COMMAND && observation.exitCode === 0 &&
      path.basename(observation.command[0]) === TOOLING_EXECUTABLE.NODE &&
      observation.command.length === LAND_COMMAND_ARITY && observation.command[
      1] === SOLVE_ENTRYPOINT &&
      observation.command[2] === LAND_COMMAND && observation.command[
      QUEST_ID_FLAG_INDEX] === QUEST_ID_FLAG &&
      GIT_SHA.test(observation.sourceAfter?.commit) &&
      observation.source.commit !== observation.sourceAfter.commit &&
      JSON.stringify(observation.source.files) === JSON.stringify(observation.sourceAfter.files),
    INVALID_EVIDENCE.LANDING);
  }
  if ([OBSERVATION_PHASE.CANDIDATE, OBSERVATION_PHASE.CONTROL,
    OBSERVATION_PHASE.LANDING].includes(observation.phase)) {
    requireEvidence(observation.host.version === profile.host.version,
      INVALID_EVIDENCE.HOST_VERSION);
    requireEvidence(observation.profileDigest === loadProfile(root).digest,
      INVALID_EVIDENCE.PROFILE_STALE);
    validateSource(root, observation.source, files);
    requireEvidence(JSON.stringify(observation.configuration) ===
      JSON.stringify(configurationIdentity(root, profile)), INVALID_EVIDENCE.CONFIGURATION_STALE);
  } else {
    requireEvidence(observation.sourceContents && Object.keys(observation.source.files)
      .every((file) => typeof observation.sourceContents[file] === 'string' &&
        sha256(observation.sourceContents[file]) === observation.source.files[file]),
    INVALID_EVIDENCE.HISTORICAL_SOURCE);
    const historicalProfile = JSON.parse(observation.sourceContents[PROFILE_PATH]);
    requireEvidence(JSON.stringify(observation.host) === JSON.stringify(historicalProfile.host),
      INVALID_EVIDENCE.HISTORICAL_HOST);
    if (observation.phase === OBSERVATION_PHASE.AUTHORING) {
      requireEvidence(observation.sourceContentsAfter && Object.keys(observation.sourceAfter.files)
        .every((file) => typeof observation.sourceContentsAfter[file] === 'string' &&
          sha256(observation.sourceContentsAfter[file]) ===
            observation.sourceAfter.files[file]),
      INVALID_EVIDENCE.AUTHORING_SOURCE);
      requireEvidence(observation.changedFiles.length > 0 &&
        observation.changedFiles.every((file) =>
          observation.source.files[file] !== observation.sourceAfter.files[file]),
      INVALID_EVIDENCE.AUTHORING_CHANGE);
    }
  }
  if (observation.kind === OBSERVATION_KIND.CODEX) {
    requireEvidence(path.basename(observation.command[0]) === TOOLING_EXECUTABLE.CODEX &&
      observation.command.includes(JSON_FLAG), INVALID_EVIDENCE.CODEX_STREAM);
    const events = observation.stdout.trim().split('\n').map((line) => JSON.parse(line));
    requireEvidence(events.some((event) => event.type === CODEX_EVENT.THREAD_STARTED) &&
      (observation.phase === OBSERVATION_PHASE.BASELINE ||
        (events.some((event) => event.type === CODEX_EVENT.TURN_COMPLETED) &&
          observation.exitCode === 0)),
    INVALID_EVIDENCE.CODEX_TURN);
    return events;
  }
  return [];
}

function mcpCalls(events) {
  return events.filter((event) => event.type === CODEX_EVENT.ITEM_COMPLETED &&
    event.item?.type === CODEX_ITEM.MCP && event.item.status === TOOL_STATUS.COMPLETED &&
    event.item.error === null && event.item.result !== null &&
    event.item.result.isError !== true).map((event) => event.item);
}

function validateCapability(id, calls) {
  const required = id === TOOLING_QUEST.NAVIGATION ?
    [[TOOLING_SERVER.SERENA, MCP_TOOL.SYMBOL], [TOOLING_SERVER.SERENA, MCP_TOOL.REFERENCES]] :
    id === TOOLING_QUEST.DOCUMENTATION ?
      [[TOOLING_SERVER.CONTEXT7, MCP_TOOL.LIBRARY], [TOOLING_SERVER.CONTEXT7,
        MCP_TOOL.DOCUMENTATION]] : [];
  for (const [server, tool] of required) {
    requireEvidence(calls.some((call) => call.server === server && call.tool === tool),
      `missing real tool result: ${server}/${tool}`);
  }
}

function validateReview(root, quest, data, digest) {
  const state = questState(readLog(root, quest.id));
  const review = state.lastVerification;
  requireEvidence(state.verificationIsCurrent && state.status !== REVIEW_STATE.BLOCKED,
    INVALID_EVIDENCE.REVIEW_STALE);
  requireEvidence(review?.verdict === REVIEW_STATE.APPROVE && typeof review.verifier === 'string' &&
    review.verifier.startsWith(VERIFIER_PREFIX) && review.verifier !== data.author,
  INVALID_EVIDENCE.REVIEW_MISSING);
  requireEvidence(review.text.includes(`tooling-receipt-sha256:${digest}`),
    INVALID_EVIDENCE.REVIEW_BYTES);
  requireEvidence(GIT_SHA.test(review.at) && HEX_SHA.test(review.candidateDigest),
    INVALID_EVIDENCE.REVIEW_CANDIDATE);
  const currentDigest = state.status === 'solved' ? null : computeCandidateDigest(root, quest);
  requireEvidence(verificationProblems(state, sourceFiles(root), currentDigest).length === 0,
    INVALID_EVIDENCE.REVIEW_CURRENCY);
}

function admit(root, quest) {
  const artifacts = requiredProofArtifacts(quest.doneWhen);
  requireEvidence(artifacts.length === 1, INVALID_EVIDENCE.RECEIPT_DECLARATION);
  const bytes = fs.readFileSync(containedFile(root, artifacts[0]));
  requireEvidence(bytes.length <= MAX_RECEIPT_BYTES, INVALID_EVIDENCE.RECEIPT_SIZE);
  const data = JSON.parse(bytes);
  const {profile, digest} = loadProfile(root);
  requireEvidence(data.schema === SCHEMA && data.quest === quest.id, INVALID_EVIDENCE.SCHEMA);
  requireEvidence(typeof data.author === 'string' && data.author.startsWith(VERIFIER_PREFIX),
    INVALID_EVIDENCE.AUTHOR);
  requireEvidence(data.profileDigest === digest, INVALID_EVIDENCE.PROFILE);
  validateSource(root, data.source, applicableFiles(quest.id));
  requireEvidence(Array.isArray(data.observations) && data.observations.length > 0,
    INVALID_EVIDENCE.OBSERVATIONS);
  const byId = new Map();
  const calls = [];
  for (const reference of data.observations) {
    const observation = readObservation(root, reference);
    requireEvidence(!byId.has(observation.id), INVALID_EVIDENCE.DUPLICATE);
    byId.set(observation.id, observation);
    const events = validateObservation(root, observation, profile,
      applicableFiles(quest.id, observation));
    if (observation.phase === OBSERVATION_PHASE.CANDIDATE) calls.push(...mcpCalls(events));
  }
  const required = quest.doneWhen.args.requiredChecks.filter((id) => id !== 'independent-verification');
  requireEvidence(Array.isArray(data.checks) && data.checks.length === required.length &&
    new Set(data.checks.map((check) => check.id)).size === required.length,
  INVALID_EVIDENCE.COVERAGE);
  for (const id of required) {
    const check = data.checks.find((item) => item.id === id);
    requireEvidence(check && typeof check.analysis === 'string' && check.analysis.trim().length > 0 &&
      Array.isArray(check.observations) && check.observations.length > 0 &&
      check.observations.every((reference) => byId.has(reference)), `unsupported check: ${id}`);
    requireEvidence(check.observations.some((reference) => byId.get(reference).exitCode === 0 &&
      [OBSERVATION_PHASE.CANDIDATE, OBSERVATION_PHASE.CONTROL].includes(byId.get(reference).phase)),
    `no completed positive observation: ${id}`);
  }
  validateCapability(quest.id, calls);
  validateComponent(root, quest, data, byId, admit);
  validateReview(root, quest, data, sha256(bytes));
  return {id: quest.id, measuring: true, metric: 0, reason: ADMISSION_REASON};
}

export {SCHEMA, admit, configurationIdentity, containedFile, sourceDigests, sourceFiles,
  validateObservation, validateReview};

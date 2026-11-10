// Component-specific relationships supplement independent semantic review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {questState, readEpic, readLog, readQuest} from '../solve/store.js';
import {git} from '../solve/guards.js';
import {loadProfile, sha256} from './profile.js';
import {ID_PATTERN} from '../solve/schema.js';
import {ownedPath} from './paths.js';
import {readPublishReceipt} from '../publish-head.js';
import {readRetainedObject} from './evidence-records.js';
import {CODEX_EVENT, CODEX_ITEM, OBSERVATION_KIND, LIFECYCLE_SCHEMA, OBSERVATION_PHASE, TOOLING_QUEST, TOOL_STATUS, VERIFIED_LESSON_PREFIX} from './evidence-contract.js';
import {INSTALLATION_STATUS, MCP_TOOL, TOOLING_ACTION, TOOLING_ENTRYPOINT, TOOLING_EXECUTABLE, TOOLING_SERVER} from './host-protocol.js';

const COMMAND_ARGUMENT = Object.freeze({
  RUN: 'run',
  TEST_FILE: 'test:file',
  SEPARATOR: '--',
  FROM: '--from',
  ID: '--id',
  METRIC: '--metric',
  QUEST: '--quest',
  TOOL: 'tool',
});
const GIT_COMMAND = Object.freeze({
  LOG: 'log',
  HASH_OBJECT: 'hash-object',
  REV_PARSE: 'rev-parse',
});
const SOLVE_COMMAND = Object.freeze({
  LAND: 'land',
});
const RECORD_KIND = Object.freeze({
  FINDING: 'finding',
  DECISION: 'decision',
});
const QUEST_STATUS = Object.freeze({
  SOLVED: 'solved',
});
const SUBJECT_ROLE = Object.freeze({
  PRODUCER: 'producer',
  DECODER: 'decoder',
  CONSUMER: 'consumer',
});
const INDEX_OBSERVATION = Object.freeze({
  INITIAL: 'initial',
  RESTARTED: 'after-explicit-restart',
});
const LIFECYCLE_PHASE = Object.freeze({
  REPEAT: 'repeat',
  TOOL_LOSS: 'tool-loss',
  INTERRUPT: 'interrupt',
  RESTART: 'restart',
  CANCEL: 'cancel',
  ORDINARY_QUEST: 'ordinary-quest',
});
const PROCESS_SIGNAL = Object.freeze({
  TERMINATE: 'SIGTERM',
});
const DIGEST_COMMAND = Object.freeze({
  SHA256: 'sha256sum',
});
const INVALID_COMPONENT = Object.freeze({
  CODEX_SESSION: 'a real Codex session is required',
  SESSION_ID: 'session identity missing',
  BACKEND: 'observed backend identity missing',
  COMPLETENESS: 'language-server results cannot establish completeness',
  DOCUMENTATION_LINEAGE: 'documentation resolution/query lineage missing',
  DOCUMENTATION_VERSION: 'query omitted the installed version',
  DOCUMENTATION_ATTRIBUTION: 'documentation attribution missing',
  DOCUMENTATION_COVERAGE: 'this initial capability has no independently established exact-version coverage',
  LESSON_RESOLUTION: 'lesson resolution is not canonically landed',
  LESSON_FINDING: 'verified lesson finding missing',
  PREVENTION_CHANGED: 'prevention owner changed',
  REUSE_SESSION: 'lesson reuse requires a distinct session',
  REUSE_TIME: 'reuse precedes lesson capture',
  REUSE_LESSON: 'later session did not read the lesson',
  PREVENTION_EXCERPT: 'prevention excerpt is not current source',
  REUSE_PREVENTION: 'later session did not inspect the current prevention owner',
  WORKTREE: 'second worktree was not observed',
  PILOT_CLOSURE: 'pilot cannot be its own closure',
  FIRST_FAILURE: 'actual discriminating first failure missing',
  UNKNOWN: 'unknown tooling component',
});
const LINE_SEPARATOR = '\n';
const PATH_SEPARATOR = '/';
const PARENT_DIRECTORY = '..';
const TEXT_ENCODING = 'utf8';
const NPM_COMMAND_PREFIX_LENGTH = 4;
const PREVENTION_EXCERPT_MINIMUM = 40;
const SIGKILL_NUMBER = 9;
const CONFIGURATION_TEST = 'test/scripts/agent-tooling-configuration.test.js';
const PROCESS_TEST = 'test/scripts/agent-tooling-process.test.js';
const SOLVE_ENTRYPOINT = 'scripts/solve.js';
const ACCEPTANCE_ENTRYPOINT = 'scripts/checks/quest-agent-tooling-acceptance.js';
const LIFECYCLE_ENTRYPOINT = 'scripts/quest-evidence/quest-agent-tooling-lifecycle.py';
const NAVIGATION_COMPLETENESS = 'partial';
const DOCUMENTATION_COVERAGE = 'exact-version-unavailable';


const CONTROL_FILE = 'test/scripts/agent-tooling-evidence.test.js';

function observation(byId, id) {
  assert(byId.has(id), `missing observation ${id}`);
  return byId.get(id);
}

function positive(byId, id, phases = [OBSERVATION_PHASE.CANDIDATE]) {
  const run = observation(byId, id);
  assert(phases.includes(run.phase), `wrong positive evidence role: ${id}`);
  assert.equal(run.exitCode, 0);
  assert.equal(run.error, null);
  assert.equal(run.signal, null);
  return run;
}

function events(run) {
  assert.equal(run.kind, OBSERVATION_KIND.CODEX, INVALID_COMPONENT.CODEX_SESSION);
  return run.stdout.trim().split(LINE_SEPARATOR).map((line) => JSON.parse(line));
}

function thread(run) {
  const started = events(run).find((event) => event.type === CODEX_EVENT.THREAD_STARTED);
  assert(typeof started?.thread_id === 'string', INVALID_COMPONENT.SESSION_ID);
  return started.thread_id;
}

function canonicalTests(byId, id, files) {
  const run = positive(byId, id, [OBSERVATION_PHASE.CANDIDATE, OBSERVATION_PHASE.CONTROL]);
  assert.equal(path.basename(run.command[0]), TOOLING_EXECUTABLE.NPM);
  assert.deepEqual(run.command.slice(1, NPM_COMMAND_PREFIX_LENGTH), [COMMAND_ARGUMENT.RUN,
    COMMAND_ARGUMENT.TEST_FILE, COMMAND_ARGUMENT.SEPARATOR]);
  assert.equal(run.exitCode, 0);
  assert.match(run.stdout, /# test-files total=\d+ pass=\d+ fail=0 assertions=[1-9]\d*/u);
  for (const file of files) {
    assert(run.command.includes(file), `canonical run omitted ${file}`);
    assert(run.stdout.includes(`ok ${file} (`), `canonical output omitted ${file}`);
  }
}

function checkSetup(byId, id) {
  const run = positive(byId, id);
  assert.equal(path.basename(run.command[0]), TOOLING_EXECUTABLE.NODE);
  assert.deepEqual(run.command.slice(1), [TOOLING_ENTRYPOINT.CLI, TOOLING_ACTION.SETUP]);
  assert.equal(run.exitCode, 0);
  const result = JSON.parse(run.stdout);
  assert([INSTALLATION_STATUS.INSTALLED, INSTALLATION_STATUS.UNCHANGED].includes(result.status));
  assert.equal(result.host.length, 2);
  assert(result.host.every((item) => item.exitCode === 0 && item.stdout.length > 0));
  assert.equal(result.hostConfiguration.length, 2);
  assert(result.hostConfiguration.every((item) => item.exitCode === 0 && item.stdout.length > 0));
  assert.match(result.dependency.manifestDigest, /^[0-9a-f]{64}$/u);
  assert.equal(result.dependency.manifestDigest, run.configuration.runtime.manifestDigest);
}

function checkNavigation(root, record, byId) {
  const run = positive(byId, record.session);
  assert.equal(run.configuration.backend.status, INSTALLATION_STATUS.INSTALLED,
    INVALID_COMPONENT.BACKEND);
  const items = events(run).filter((event) => event.type === CODEX_EVENT.ITEM_COMPLETED).map((
    event) => event.item);
  assert.equal(record.completeness, NAVIGATION_COMPLETENESS, INVALID_COMPONENT.COMPLETENESS);
  assert.deepEqual(record.subjects.map((subject) => subject.role).sort(),
    [SUBJECT_ROLE.CONSUMER, SUBJECT_ROLE.DECODER, SUBJECT_ROLE.PRODUCER]);
  for (const subject of record.subjects) {
    assert.match(subject.path, /^src\/[a-z0-9_./-]+\.js$/u);
    assert(!subject.path.split(PATH_SEPARATOR).includes(PARENT_DIRECTORY));
    const bytes = fs.readFileSync(ownedPath(root, subject.path));
    assert.equal(sha256(bytes), subject.sha256, `navigation subject changed: ${subject.path}`);
    assert(items.some((item) => item.type === CODEX_ITEM.COMMAND && item.exit_code === 0 &&
      item.command.includes(DIGEST_COMMAND.SHA256) && item.command.includes(subject.path) &&
      item.aggregated_output.split(LINE_SEPARATOR).includes(`${subject.sha256}  ${subject.path}`)),
    `session did not observe the full source digest: ${subject.path}`);
    const results = items.filter((item) => item.type === CODEX_ITEM.MCP &&
      item.server === TOOLING_SERVER.SERENA && item.tool === MCP_TOOL.SYMBOL &&
      item.arguments.relative_path === subject.path && item.status === TOOL_STATUS.COMPLETED &&
      item.arguments.include_body === true && item.error === null && item.result !== null &&
      item.result.isError !== true);
    assert(results.some((result) => {
      const symbols = JSON.parse(result.result.content.filter((part) => part.type === 'text')
        .map((part) => part.text).join(LINE_SEPARATOR));
      return Array.isArray(symbols) && symbols.some((symbol) => typeof symbol.body === 'string' &&
        bytes.toString(TEXT_ENCODING).includes(symbol.body));
    }), `no actual matching symbol body for ${subject.path}`);
  }
  canonicalTests(byId, record.controls, [CONTROL_FILE]);
  assert(typeof record.limitation === 'string');
  assert(record.limitation.length > 0);
}

function checkDocumentation(root, record, byId) {
  assert.match(record.package, /^(?:@[a-z0-9_-]+\/)?[a-z0-9_-]+$/u);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), TEXT_ENCODING));
  const packagePath = path.join(root, 'node_modules', record.package, 'package.json');
  const installed = JSON.parse(fs.readFileSync(packagePath, TEXT_ENCODING));
  assert.equal(lock.packages[`node_modules/${record.package}`].version, record.version);
  assert.equal(installed.version, record.version);
  assert.equal(sha256(fs.readFileSync(packagePath)), record.installedPackageDigest);
  const calls = events(positive(byId, record.session))
    .filter((event) => event.type === CODEX_EVENT.ITEM_COMPLETED &&
      event.item?.type === CODEX_ITEM.MCP)
    .map((event) => event.item);
  const resolution = calls.find((call) => call.server === TOOLING_SERVER.CONTEXT7 &&
    call.tool === MCP_TOOL.LIBRARY && call.arguments.libraryName === record.package &&
    call.error === null && call.result !== null &&
    JSON.stringify(call.result).includes(record.libraryId));
  const query = calls.find((call) => call.server === TOOLING_SERVER.CONTEXT7 &&
    call.tool === MCP_TOOL.DOCUMENTATION &&
    call.arguments.libraryId === record.libraryId && call.error === null && call.result !== null);
  assert(resolution && query, INVALID_COMPONENT.DOCUMENTATION_LINEAGE);
  assert(query.arguments.query.includes(record.version), INVALID_COMPONENT.DOCUMENTATION_VERSION);
  const raw = JSON.stringify(query.result);
  assert(record.sources.length > 0 && record.sources.every((url) =>
    /^https:\/\//u.test(url) && raw.includes(url)), INVALID_COMPONENT.DOCUMENTATION_ATTRIBUTION);
  assert.equal(record.coverage, DOCUMENTATION_COVERAGE,
    INVALID_COMPONENT.DOCUMENTATION_COVERAGE);
  assert.equal(record.claimsInstalledApiFromDocs, false);
}

function checkLesson(root, record, byId) {
  assert(ID_PATTERN.test(record.resolutionQuest));
  const resolution = questState(readLog(root, record.resolutionQuest));
  assert.equal(resolution.status, QUEST_STATUS.SOLVED, INVALID_COMPONENT.LESSON_RESOLUTION);
  const entries = readLog(root, record.resolutionQuest);
  const lesson = entries.find((entry) => sha256(JSON.stringify(entry)) === record.entryDigest);
  assert(lesson && lesson.type === RECORD_KIND.FINDING && lesson.kind === RECORD_KIND.DECISION &&
    lesson.text.startsWith(VERIFIED_LESSON_PREFIX), INVALID_COMPONENT.LESSON_FINDING);
  assert.equal(sha256(fs.readFileSync(ownedPath(root, record.prevention.path))),
    record.prevention.sha256, INVALID_COMPONENT.PREVENTION_CHANGED);
  const reused = positive(byId, record.reuseSession);
  const original = observation(byId, record.originalSession);
  assert.notEqual(thread(reused), thread(original), INVALID_COMPONENT.REUSE_SESSION);
  assert(Date.parse(reused.startedAt) > Date.parse(lesson.ts), INVALID_COMPONENT.REUSE_TIME);
  const logPath = `solve/quests/${record.resolutionQuest}/log.ndjson`;
  assert(events(reused).some((event) => event.type === CODEX_EVENT.ITEM_COMPLETED &&
    event.item?.type === CODEX_ITEM.COMMAND && event.item.command.includes(logPath) &&
    event.item.aggregated_output.includes(VERIFIED_LESSON_PREFIX)), INVALID_COMPONENT.REUSE_LESSON);
  const source = fs.readFileSync(ownedPath(root, record.prevention.path), TEXT_ENCODING);
  assert(typeof record.prevention.excerpt === 'string' && record.prevention.excerpt.length >= PREVENTION_EXCERPT_MINIMUM &&
    source.includes(record.prevention.excerpt), INVALID_COMPONENT.PREVENTION_EXCERPT);
  assert(events(reused).some((event) => event.type === CODEX_EVENT.ITEM_COMPLETED &&
    event.item?.type === CODEX_ITEM.COMMAND &&
    event.item.command.includes(record.prevention.path) &&
    event.item.aggregated_output.includes(record.prevention.excerpt)),
  INVALID_COMPONENT.REUSE_PREVENTION);
}

function lifecycleCommand(record, phase, action, exitCode, outcome) {
  const commands = record.phases.filter((entry) => entry.phase === phase)
    .flatMap((entry) => entry.observations).filter((item) => item.command &&
      path.basename(item.command[0]) === TOOLING_EXECUTABLE.NODE && item.command[
      1] === TOOLING_ENTRYPOINT.CLI &&
      item.command[2] === action && item.exitCode === exitCode && item.cwd === record.root);
  assert(commands.length > 0, `actual lifecycle command missing: ${phase}/${action}`);
  if (outcome) assert(commands.some((item) => JSON.parse(item.stdout).status === outcome));
}

function checkIndexTransition(record) {
  const restart = record.phases.filter((entry) => entry.phase === LIFECYCLE_PHASE.RESTART);
  const hasRoot = (entry, root) => entry.observations.some((item) => item.root === root);
  assert(restart.some((entry) => hasRoot(entry, record.sourceRoot)));
  const target = restart.find((entry) => hasRoot(entry, record.root));
  assert(target, INVALID_COMPONENT.WORKTREE);
  const transition = target.observations.find((item) => item.sourceChange)?.sourceChange;
  assert(transition && transition.path === record.subject.path);
  assert.equal(sha256(transition.before), record.subject.sha256);
  assert.notEqual(sha256(transition.after), record.subject.sha256);
  for (const [label, source] of [[INDEX_OBSERVATION.INITIAL, transition.before],
    [INDEX_OBSERVATION.RESTARTED, transition.after]]) {
    const call = target.observations.find((item) => item.tool === MCP_TOOL.SYMBOL &&
      item.label === label);
    assert(call && call.result.isError === false);
    assert.equal(call.arguments.relative_path, record.subject.path);
    assert.equal(call.sourceSha256, sha256(source));
    const symbols = JSON.parse(call.result.content.filter((part) => part.type === 'text')
      .map((part) => part.text).join(LINE_SEPARATOR));
    assert(symbols.length > 0 && symbols.every((symbol) => source.includes(symbol.body)));
  }
}

function checkLifecycle(root, byId, id) {
  const run = positive(byId, id);
  const record = JSON.parse(run.stdout);
  const {profile} = loadProfile(root);
  assert.equal(path.basename(run.command[0]), TOOLING_EXECUTABLE.UV);
  assert.deepEqual(run.command.slice(1), [COMMAND_ARGUMENT.TOOL, COMMAND_ARGUMENT.RUN,
    COMMAND_ARGUMENT.FROM,
    `git+${profile.upstreams.serena.repository}@${profile.upstreams.serena.revision}`, TOOLING_EXECUTABLE.PYTHON,
    LIFECYCLE_ENTRYPOINT, record.root]);
  assert.equal(record.schema, LIFECYCLE_SCHEMA);
  assert.equal(record.failure, undefined);
  assert.equal(record.sourceRoot, run.cwd);
  assert.notEqual(record.root, run.cwd);
  assert.equal(record.sourceCommit, run.source.commit);
  const subject = fs.readFileSync(ownedPath(root, record.subject.path));
  assert.equal(sha256(subject), record.subject.sha256);
  for (const phase of [TOOLING_ACTION.SETUP, LIFECYCLE_PHASE.REPEAT, TOOLING_ACTION.UPGRADE,
    LIFECYCLE_PHASE.TOOL_LOSS, LIFECYCLE_PHASE.INTERRUPT, TOOLING_ACTION.RECOVER,
    LIFECYCLE_PHASE.RESTART, LIFECYCLE_PHASE.CANCEL, TOOLING_ACTION.REMOVE, LIFECYCLE_PHASE.ORDINARY_QUEST]) {
    assert(record.phases.some((entry) => entry.phase === phase && entry.observations.length > 0),
      `lifecycle phase not observed: ${phase}`);
  }
  assert.deepEqual(record.unrelatedBefore, record.unrelatedAfter);
  assert.deepEqual(record.liveOwnedProcessesAfter, []);
  assert.equal(record.configurationAfter, INSTALLATION_STATUS.ABSENT);
  lifecycleCommand(record, TOOLING_ACTION.SETUP, TOOLING_ACTION.SETUP, 0,
    INSTALLATION_STATUS.INSTALLED);
  lifecycleCommand(record, LIFECYCLE_PHASE.REPEAT, TOOLING_ACTION.SETUP, 0,
    INSTALLATION_STATUS.UNCHANGED);
  lifecycleCommand(record, TOOLING_ACTION.UPGRADE, TOOLING_ACTION.UPGRADE, 0,
    INSTALLATION_STATUS.UPGRADED);
  lifecycleCommand(record, LIFECYCLE_PHASE.TOOL_LOSS, TOOLING_ACTION.SERVE, 1);
  lifecycleCommand(record, TOOLING_ACTION.RECOVER, TOOLING_ACTION.RECOVER, 0,
    INSTALLATION_STATUS.RECOVERED);
  lifecycleCommand(record, TOOLING_ACTION.REMOVE, TOOLING_ACTION.REMOVE, 0,
    INSTALLATION_STATUS.REMOVED);
  const interruption = record.phases.find((entry) =>
    entry.phase === LIFECYCLE_PHASE.INTERRUPT).observations[0];
  assert.equal(interruption.exitCode, -SIGKILL_NUMBER);
  assert.match(interruption.pendingDigest, /^[0-9a-f]{64}$/u);
  const cancelled = record.phases.find((entry) =>
    entry.phase === LIFECYCLE_PHASE.CANCEL).observations;
  assert(cancelled.some((item) => item.ownedProcessesBeforeClose?.length > 0));
  assert(cancelled.some((item) => item.signal === PROCESS_SIGNAL.TERMINATE));
  assert(cancelled.some((item) => item.lockAfter === false &&
    item.liveOwnedProcessesAfter.length === 0));
  checkIndexTransition(record);
}

function checkLanding(root, record, authored, byId) {
  const landed = positive(byId, record.landing, [OBSERVATION_PHASE.LANDING]);
  assert.deepEqual(landed.command.slice(1), [SOLVE_ENTRYPOINT, SOLVE_COMMAND.LAND,
    COMMAND_ARGUMENT.ID, record.quest]);
  assert.equal(landed.sourceAfter.commit, record.landingCommit);
  assert.equal(git(root, [GIT_COMMAND.REV_PARSE, `${record.landingCommit}^`]).trim(), landed.source.commit);
  const logPath = `solve/quests/${record.quest}/log.ndjson`;
  const logAt = (commit) => git(root, ['show', `${commit}:${logPath}`])
    .trim().split(LINE_SEPARATOR).map((line) => JSON.parse(line));
  assert.equal(questState(logAt(record.landingCommit)).status, QUEST_STATUS.SOLVED);
  assert.notEqual(questState(logAt(landed.source.commit)).status, QUEST_STATUS.SOLVED);
  for (const file of authored.changedFiles) {
    // Compare Git object IDs without normalizing the underlying blob bytes.
    assert.equal(git(root, [GIT_COMMAND.HASH_OBJECT, file]).trim(),
      git(root, [GIT_COMMAND.REV_PARSE, `${record.landingCommit}:${file}`]).trim(),
      `authored result absent from landing: ${file}`);
  }
  const publicationRun = positive(byId, record.publication);
  assert.deepEqual(publicationRun.command.slice(1),
    [TOOLING_ENTRYPOINT.CLI, TOOLING_ACTION.PUBLICATION, record.landingCommit]);
  assert.equal(path.basename(publicationRun.command[0]), TOOLING_EXECUTABLE.NODE);
  const publication = JSON.parse(publicationRun.stdout);
  assert.deepEqual(publication, readPublishReceipt(root, record.landingCommit));
  assert(Date.parse(publication.publishedAt) >= Date.parse(landed.startedAt));
}

function checkPilot(root, quest, data, byId, admit) {
  const record = data.pilot;
  assert(record && record.quest !== quest.id, INVALID_COMPONENT.PILOT_CLOSURE);
  assert(ID_PATTERN.test(record.quest));
  const pilotLog = readLog(root, record.quest);
  assert.equal(questState(pilotLog).status, QUEST_STATUS.SOLVED);
  const authored = observation(byId, record.authoring);
  assert.equal(authored.phase, OBSERVATION_PHASE.AUTHORING);
  assert.equal(authored.kind, OBSERVATION_KIND.CODEX);
  assert(authored.changedFiles.length > 0);
  for (const file of authored.changedFiles) {
    assert.equal(sha256(fs.readFileSync(ownedPath(root, file))), authored.sourceAfter.files[file],
      `pilot change no longer applies: ${file}`);
  }
  assert.equal(data.lesson.resolutionQuest, record.quest);
  assert.equal(thread(observation(byId, data.lesson.originalSession)), thread(authored));
  assert.match(record.landingCommit, /^[0-9a-f]{40}$/u);
  checkLanding(root, record, authored, byId);
  const epic = readEpic(root, quest.epic);
  for (const id of epic.front.quests.filter((id) => id !== quest.id)) {
    assert.equal(questState(readLog(root, id)).status, QUEST_STATUS.SOLVED);
    assert.equal(admit(root, readQuest(root, id)).metric, 0);
  }
  checkLesson(root, data.lesson, byId);
}

function validateComponent(root, quest, data, byId, admit) {
  switch (quest.id) {
  case TOOLING_QUEST.PROFILE:
    checkSetup(byId, data.setup);
    canonicalTests(byId, data.controls, [CONFIGURATION_TEST]);
    break;
  case TOOLING_QUEST.NAVIGATION:
    checkNavigation(root, data.navigation, byId);
    checkLifecycle(root, byId, data.lifecycle);
    break;
  case TOOLING_QUEST.INVESTIGATION: {
    const baseline = observation(byId, data.investigation.baseline);
    assert([OBSERVATION_PHASE.BASELINE, OBSERVATION_PHASE.AUTHORING].includes(baseline.phase));
    assert.notEqual(thread(baseline), thread(positive(byId, data.investigation.current)));
    const failure = data.investigation.failure;
    assert(typeof failure.originalPath === 'string' && failure.originalPath.length > 0);
    assert(events(baseline).some((event) => event.type === CODEX_EVENT.ITEM_COMPLETED &&
      event.item?.type === CODEX_ITEM.COMMAND && event.item.exit_code !== 0 &&
      event.item.command.includes(COMMAND_ARGUMENT.TEST_FILE) &&
      event.item.command.includes(failure.originalPath)),
    INVALID_COMPONENT.FIRST_FAILURE);
    assert.match(readRetainedObject(root, failure.reference).toString(TEXT_ENCODING),
      /# test-files total=\d+ pass=\d+ fail=[1-9]\d*/u);
    const history = observation(byId, data.investigation.history);
    assert.equal(path.basename(history.command[0]), TOOLING_EXECUTABLE.GIT);
    assert.equal(history.command[1], GIT_COMMAND.LOG);
    canonicalTests(byId, data.controls, [PROCESS_TEST]);
    break;
  }
  case TOOLING_QUEST.REVIEW: {
    assert.equal(data.admittedQuest, TOOLING_QUEST.PROFILE);
    canonicalTests(byId, data.controls, [CONTROL_FILE]);
    const admitted = positive(byId, data.positive);
    assert.deepEqual(admitted.command.slice(1), [ACCEPTANCE_ENTRYPOINT,
      COMMAND_ARGUMENT.QUEST, data.admittedQuest, COMMAND_ARGUMENT.METRIC]);
    assert.equal(admit(root, readQuest(root, data.admittedQuest)).metric, 0);
    break;
  }
  case TOOLING_QUEST.LEARNING:
    checkLesson(root, data.lesson, byId);
    break;
  case TOOLING_QUEST.DOCUMENTATION:
    checkDocumentation(root, data.documentation, byId);
    break;
  case TOOLING_QUEST.LIFECYCLE:
    checkLifecycle(root, byId, data.lifecycle);
    break;
  case TOOLING_QUEST.PILOT:
    checkPilot(root, quest, data, byId, admit);
    break;
  default:
    throw new Error(INVALID_COMPONENT.UNKNOWN);
  }
}

export {validateComponent};

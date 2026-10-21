import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {inspectParticipantReleaseCompletion} from
  '../../scripts/participant-release-completion-audit.js';
import {collectDecisionBoundaryViolations, collectDecisionBoundaryViolationsFromSource} from
  '../../scripts/check-guideline-decision-boundaries.js';

const OWNER = 'src/node/participant-release-client.js';
const FRESH = 'src/node/replica-handler-release-recovery.js';
const SEED = 'src/bootstrap/bootstrap-service-seed-workflow.js';
const CONTROL = 'src/node/replica-handler-participant-cutover.js';
const ROOT = new URL('../../', import.meta.url);
const CONTRACT = 'participant_release_completion_contract';
const RETRY = 'local_retry_loop';

async function currentSources() {
  return new Map(await Promise.all([OWNER, FRESH, SEED, CONTROL].map(async (file) =>
    [file, await fs.readFile(new URL(file, ROOT), 'utf8')])));
}

function replaceOnce(source, before, after) {
  assert.notEqual(source.indexOf(before), -1, 'mutation engages its exact source fragment');
  assert.equal(source.indexOf(before), source.lastIndexOf(before), 'mutation is unambiguous');
  return source.replace(before, after);
}

function changed(sources, file, before, after) {
  const mutant = new Map(sources);
  mutant.set(file, replaceOnce(sources.get(file), before, after));
  return mutant;
}

function rejectsContract(sources, file) {
  const result = inspectParticipantReleaseCompletion(sources);
  assert.ok(result.violations.some((violation) =>
    violation.filePath === file && violation.kind === CONTRACT), 'actual audit refuses changed contract');
  const ownerRetry = collectDecisionBoundaryViolationsFromSource(sources.get(OWNER), OWNER,
    {completionContext: result.context}).filter((violation) => violation.kind === RETRY);
  assert.equal(ownerRetry.length, 1, 'a failed interaction never receives an owned-loop allowance');
}

test('completion audit validates the operation and the legitimate distinct-cohort outer loop', async () => {
  const sources = await currentSources();
  const {context, violations} = inspectParticipantReleaseCompletion(sources);
  assert.deepEqual(violations, []);
  for (const file of [OWNER, FRESH, SEED]) {
    assert.deepEqual(collectDecisionBoundaryViolationsFromSource(sources.get(file), file,
      {completionContext: context}).filter((violation) => violation.kind === RETRY), []);
  }
  assert.ok(sources.get(SEED).includes('for (const service of cohorts)'));
  assert.ok(sources.get(SEED).includes('const selectedPartitionIds = new Set()'));
});

test('standalone collection, fabricated context and source changes remain conservative', async () => {
  const sources = await currentSources();
  for (const options of [{}, {completionContext: {}}]) {
    assert.equal(collectDecisionBoundaryViolationsFromSource(sources.get(OWNER), OWNER, options)
      .filter((violation) => violation.kind === RETRY).length, 1);
  }
  const {context} = inspectParticipantReleaseCompletion(sources);
  assert.equal(collectDecisionBoundaryViolationsFromSource(sources.get(OWNER) + '\n', OWNER,
    {completionContext: context}).filter((violation) => violation.kind === RETRY).length, 1,
  'the allowance applies only to the AST-validated source bytes');
  assert.equal(collectDecisionBoundaryViolationsFromSource(sources.get(OWNER), 'src/node/copy.js',
    {completionContext: context}).filter((violation) => violation.kind === RETRY).length, 1);
});

test('completion audit rejects renewed deadlines, changed guards and wait control edges', async () => {
  const sources = await currentSources();
  for (const [before, after] of [
    ['const deadline = intent.deadlineAtMs;', 'const deadline = clock.now() + intent.deadlineAtMs;'],
    ['clock.now() + retryAfterMs > deadline', 'clock.now() + retryAfterMs < deadline'],
    ['retryAfterMs < 0', 'retryAfterMs <= 0'],
    ['!Number.isSafeInteger(retryAfterMs)', '!Number.isFinite(retryAfterMs)'],
    ['!seed && remaining <= 0', '!seed && remaining < 0'],
    ['clock.now() <= deadline', 'clock.now() < deadline'],
    ['if (seed) {', 'if (true) {'],
    ['await requestParticipantRelease(owner, intent)',
      'await requestParticipantRelease(owner, {...intent, deadlineAtMs: clock.now() + 100})'],
  ]) rejectsContract(changed(sources, OWNER, before, after), OWNER);
  rejectsContract(changed(sources, SEED, 'deadlineAtMs: deadline, authorization,',
    'deadlineAtMs: timeSource.now() + budgetMs, authorization,'), SEED);
  rejectsContract(changed(sources, FRESH, 'const deadline = options.deadlineAtMs;',
    'const deadline = now() + options.deadlineAtMs;'), FRESH);
});

test('completion audit rejects spoofed imports, shadowed bindings and an extra aliased caller', async () => {
  const sources = await currentSources();
  rejectsContract(changed(sources, OWNER,
    '\'../partition/partition-participant-transaction-cutover-constants.js\'', '\'./fake-constants.js\''), OWNER);
  rejectsContract(changed(sources, FRESH,
    '\'./participant-release-client.js\'', '\'./fake-client.js\''), FRESH);
  const shadow = new Map(sources);
  shadow.set(FRESH, sources.get(FRESH) + '\nfunction shadow(OUTCOME) { return OUTCOME; }\n');
  rejectsContract(shadow, FRESH);
  const alias = new Map(sources);
  alias.set(FRESH, sources.get(FRESH) +
    '\nimport {completeParticipantRelease as extra} from \'./participant-release-client.js\';\n' +
    'export function extraCaller(owner, request, clock) { return extra(owner, request, clock); }\n');
  rejectsContract(alias, FRESH);
});

test('completion audit refuses relocation and copies rather than blessing a new filename', async () => {
  const sources = await currentSources();
  const relocated = new Map(sources);
  relocated.delete(OWNER);
  relocated.set('src/node/relocated-release.js', sources.get(OWNER));
  assert.ok(inspectParticipantReleaseCompletion(relocated).violations
    .some((violation) => violation.filePath === OWNER && violation.kind === CONTRACT));
  const copied = new Map(sources);
  copied.set('src/node/copied-release.js', sources.get(OWNER));
  rejectsContract(copied, 'src/node/copied-release.js');
});

test('completion audit rejects a caller retry and changed nested-control routing', async () => {
  const sources = await currentSources();
  rejectsContract(changed(sources, FRESH,
    '      if (completed) return answer;',
    '      while (answer.retryAfterMs >= 0) {\n' +
    '        await completeParticipantRelease(handler, options, {now, sleep});\n' +
    '      }\n      if (completed) return answer;'), FRESH);
  rejectsContract(changed(sources, SEED, '        completed += 1;',
    '        const retryAfterMs = answer.retryAfterMs;\n' +
    '        await this.sleep(retryAfterMs);\n        completed += 1;'), SEED);
  const control = new Map(sources);
  control.set(CONTROL, sources.get(CONTROL).replaceAll('requestParticipantRelease',
    'completeParticipantRelease'));
  rejectsContract(control, CONTROL);
});

test('selected-caller audit loads and rejects the changed canonical owner', async (t) => {
  const sources = await currentSources();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'completion-audit-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  for (const [file, source] of sources) {
    await fs.mkdir(path.dirname(path.join(root, file)), {recursive: true});
    await fs.writeFile(path.join(root, file), source);
  }
  const selected = [path.join(root, FRESH)];
  const options = {completionRoot: root, referenceRoots: [path.join(root, 'src')]};
  const positive = await collectDecisionBoundaryViolations(selected, options);
  assert.deepEqual(positive.violations.filter((violation) =>
    [CONTRACT, RETRY].includes(violation.kind)), []);
  await fs.writeFile(path.join(root, OWNER), replaceOnce(sources.get(OWNER),
    'clock.now() <= deadline', 'clock.now() < deadline'));
  const negative = await collectDecisionBoundaryViolations(selected, options);
  assert.ok(negative.violations.some((violation) =>
    violation.filePath === OWNER && violation.kind === CONTRACT),
  'the owner is checked even when it is outside the requested scan set');
});


test('completion audit refuses writes and catch shadows without changing checked bodies', async () => {
  const sources = await currentSources();
  for (const suffix of [
    '\nrequestParticipantRelease = replacement;\n',
    '\nrequestParticipantRelease++;\n',
    '\nfor (requestParticipantRelease of replacements) {}\n',
    '\ntry {} catch (requestParticipantRelease) {}\n',
    '\ntry {} catch ({requestParticipantRelease}) {}\n',
  ]) {
    const mutant = new Map(sources);
    mutant.set(OWNER, sources.get(OWNER) + suffix);
    rejectsContract(mutant, OWNER);
  }
  const mutableClock = new Map(sources);
  mutableClock.set(FRESH, sources.get(FRESH) + '\nnow = replacement;\n');
  rejectsContract(mutableClock, FRESH);
});

test('completion audit requires checked functions in their real lexical owner', async () => {
  const sources = await currentSources();
  const helper = 'function retainFirstReleaseObservation(current, value) {\n' +
    '  return current === null && value !== undefined ? value : current;\n}';
  rejectsContract(changed(sources, OWNER, helper,
    'function relocated() {\n' + helper + '\n}'), OWNER);
  rejectsContract(changed(sources, FRESH, '  const now = () => handler.timeSource.now();',
    '  if (condition) return replacement;\n  const now = () => handler.timeSource.now();'), FRESH);
  rejectsContract(changed(sources, FRESH, '  const now = () => handler.timeSource.now();',
    '  function relocated() { const now = () => handler.timeSource.now(); }'), FRESH);
});

test('completion audit validates diagnostic and table import provenance', async () => {
  const sources = await currentSources();
  rejectsContract(changed(sources, SEED, '\'../constants/index.js\'', '\'./fake-tables.js\''), SEED);
  rejectsContract(changed(sources, SEED, '\'../node/participant-release-diagnostic-observation.js\'',
    '\'./fake-observations.js\''), SEED);
  const shadow = new Map(sources);
  shadow.set(OWNER, sources.get(OWNER) + '\nconst Number = replacement;\n');
  rejectsContract(shadow, OWNER);
});


test('completion audit refuses returned method overwrite while preserving checked bodies', async () => {
  const sources = await currentSources();
  const nextMethod = '    async releaseOperator({partitionId, targetBuildDigest, deadlineAtMs}) {';
  for (const replacement of [
    '    ...replacement,\n',
    '    [methodName]: replacement,\n',
    '    releaseFreshCreate: replacement,\n',
    '    get releaseFreshCreate() { return replacement; },\n',
  ]) rejectsContract(changed(sources, FRESH, nextMethod, replacement + nextMethod), FRESH);
});

test('completion audit counts default, namespace and class dependency bindings', async () => {
  const sources = await currentSources();
  for (const suffix of [
    '\nimport Object from \'./fake.js\';\n',
    '\nimport * as Number from \'./fake.js\';\n',
    '\nclass Number { static isSafeInteger() { return true; } }\n',
    '\nconst replacement = class Number { static isSafeInteger() { return true; } };\n',
  ]) {
    const mutant = new Map(sources);
    mutant.set(OWNER, sources.get(OWNER) + suffix);
    rejectsContract(mutant, OWNER);
  }
});

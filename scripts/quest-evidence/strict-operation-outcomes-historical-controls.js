import {isDeepStrictEqual} from 'node:util';

const ARCHIVE = Object.freeze({
  asset: 'strict-operation-outcomes--strict-native-historical-controls-5491-5493-nov20.tar.gz',
  sha256: 'bf8c1c1503548c75c0c8bd8100bc1cfdf49b0abf2b696cf7b6a6f0e795e97b97',
  bytes: 99527,
});

const GENERATION = '51a47f3e-71ed-4429-a6c9-fff56f959d37';
const REPO = 'psvensson/lagrange';
const REF_PREFIX = 'refs/heads/witness/core-20261120/';
const COMPLETE = 'COMPLETE';
const FAILED = 'FAILED';
const MANAGED_ANCHOR = Object.freeze({
  STATUS: 'status.json', MANIFEST: 'manifest.json', INVENTORY: 'artifacts-0.json',
});

function treatment(record, ref, pins) {
  return Object.freeze({...record, generation: GENERATION, repo: REPO, ref: REF_PREFIX + ref,
    anchors: Object.freeze({
      [MANAGED_ANCHOR.STATUS]: pins[0],
      [MANAGED_ANCHOR.MANIFEST]: pins[1],
      [MANAGED_ANCHOR.INVENTORY]: pins[2],
    })});
}

const POSITIVE = treatment({
  source: '0081b7dfa8620fcf242930db14430f80fb81cbe3',
  tree: 'cd8cdc0b45683e027df95d5d99b97b8c40f5eda7',
  requestId: '0176a673-60bf-4de6-b4b4-741ec478e1b5',
  controllerState: COMPLETE, exitStatus: 0, assertions: 532, parents: 52, leaves: 480,
  leafFailures: 0,
}, 'nonterminal-release-control', [
  'c03d55ebc73d4138a56309e4b02861f5256e2b3d6d240efb5edfcce21d66f645',
  'de75253df4f9d36686626a49d7dc4475a614253f6d1095809c2ae84b463da049',
  'c988bad85a67208d4c4928f184dae00c8d2e7041b8762ca6ad6c58d6754a1bb5',
]);
const ADAPTER_RED = treatment({
  source: '0a00e855fba84d73af6a3b0939844aa7497f542a',
  tree: 'cc636b925e3dad8a40d69a5f4bcca6b11fe1edfd',
  requestId: '9cfdf172-c08f-4f1c-a1b2-b95cc292f3d8',
  controllerState: FAILED, exitStatus: 1, assertions: 516, parents: 51, leaves: 465,
  leafFailures: 73,
}, 'historical-transition-adapter', [
  '601a218fdd02d612ccd0e0ffd2bb182366912d53f21d83e5fe5142286805b5ff',
  '316df8501dad7ff5af4a51f7d540f9277725b6bf1f14ab710845fd224905831e',
  'b9da579e9c0ec8f63d286af9826445cd421aaf8fc6440a754f1a709f1076370c',
]);
const HELPER_RED = treatment({
  source: '6ef416aa65a9a652a876eebb0149b8a136f7a452',
  tree: 'dc76caf7f1e3fb16a9bfde0070d8ae3579a9a502',
  requestId: '11dfe7c6-e4f5-44e9-89f4-f0f23bd98c02',
  controllerState: FAILED, exitStatus: 1, assertions: 532, parents: 52, leaves: 480,
  leafFailures: 3,
}, 'historical-terminal-helper', [
  '2f22effa287433e15a7024e57bf812ad8d55b1e1059ffe191c1226ff741f6850',
  '8d495bc7533701a12faa28ae886fb316476e405470b2844cd0f86336557d2627',
  'f7118059dd05100a82639bdc05a3229a4fb06ec42f33f161338dfbda6cdbfced',
]);
const HISTORICAL_RUNS = Object.freeze([POSITIVE, ADAPTER_RED, HELPER_RED]);

const RELEASE_CASE = 'strict outcomes release boundary retains a real nonterminal committed transition';
const RELEASE_ASSERTIONS = Object.freeze([
  'the real nonterminal SQLite write committed',
  'committed nonterminal evidence cannot enter terminal release',
  'the actual nonterminal reservation remains held',
  'nonterminal evidence earns no terminal completion credit',
  'refusal preserves the exact durable nonterminal row',
  'ordinary proven terminal completion remains accepted',
  'the same reservation releases only after actual terminal persistence',
]);
const ADAPTER_LABELS = Object.freeze(['undefined', 'null', 'bare true', 'missing fields']);
const MIRROR_FAILURE = 'malformed answer cannot commit the deferred workflow mirror';
const NO_RELEASE_POSITIVE = 'paired nonterminal release positive did not complete all phases';
const NO_RELEASE_NEGATIVE =
  'historical helper did not prematurely release the reservation and grant completion credit';
const REFUSAL = 'historical control evidence refused';
const RELEASE_ACTIVE_TO_RELEASED = /(?:^|\n)-active\n\+released\n/u;
const CREDIT_ZERO_TO_ONE = /(?:^|\n)-0\n\+1\n/u;

function requireHistorical(condition, message) {
  if (!condition) throw new Error(`${REFUSAL}: ${message}`);
}

function assertion(child, name) {
  return child?.assertions.find((entry) => entry.name === name);
}

function checkReleasePhase(positive, helper) {
  const phase = positive.get(RELEASE_CASE);
  const failed = helper.get(RELEASE_CASE);
  requireHistorical(isDeepStrictEqual(phase?.assertions.map(({name}) => name),
    failed?.assertions.map(({name}) => name)) &&
    RELEASE_ASSERTIONS.every((name) => assertion(phase, name)?.ok === true),
  NO_RELEASE_POSITIVE);
  const [commit, guard, reservation, credit, ...followUp] = RELEASE_ASSERTIONS;
  requireHistorical([commit, ...followUp].every((name) => assertion(failed, name)?.ok === true) &&
    [guard, reservation, credit].every((name) => assertion(failed, name)?.ok === false) &&
    RELEASE_ACTIVE_TO_RELEASED.test(assertion(failed, reservation)?.diag?.diff) &&
    CREDIT_ZERO_TO_ONE.test(assertion(failed, credit)?.diag?.diff),
  NO_RELEASE_NEGATIVE);
}

function checkAdapterPhase(positive, adapter, {CALL, WRITE}) {
  for (const label of ADAPTER_LABELS) {
    const name = `strict outcomes malformed ${label}: no commit or release; same-owner retry`;
    const good = positive.get(name);
    const bad = adapter.get(name);
    requireHistorical([CALL, WRITE, MIRROR_FAILURE].every((item) =>
      assertion(good, item)?.ok === true) && [CALL, WRITE].every((item) =>
      assertion(bad, item)?.ok === true) && assertion(bad, MIRROR_FAILURE)?.ok === false,
    `historical adapter did not commit its mirror after a real ${label} reply and write`);
  }
}

function substrate({testPid: _test, runnerPid: _runner, classifiedPid: _classified, ...identity}) {
  return identity;
}

function compareHistoricalControls([positive, adapter, helper], repaired, effects) {
  for (const {native, expected} of [positive, adapter, helper]) {
    requireHistorical(isDeepStrictEqual(substrate(native), substrate(repaired.native)),
      `native substrate differs for ${expected.requestId}`);
  }
  checkReleasePhase(positive.cases, helper.cases);
  checkAdapterPhase(repaired.cases, adapter.cases, effects);
  return {...ARCHIVE, runs: [positive, adapter, helper].map(({native, expected, execution}) => ({
    sourceCommit: expected.source, sourceTree: expected.tree, requestId: expected.requestId,
    originalDigests: expected.anchors, runId: execution.run.runId,
    testPid: native.testPid, exitStatus: expected.exitStatus, assertions: expected.assertions,
    leafFailures: expected.leafFailures,
  }))};
}

export {HISTORICAL_RUNS, compareHistoricalControls, requireHistorical};

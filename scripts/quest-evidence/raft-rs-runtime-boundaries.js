#!/usr/bin/env node
// Evidence harness for the quest raft-rs-runtime-boundaries.
//
// Thirteen receipts, the ids exactly as quest.json seals them. Six are the
// failure-origin boundary (D1), six are node retirement (D2), and one is the
// scope claim that nothing outside those two boundaries changed. Every
// receipt names one test of one witness file by an anchored pattern, so a
// pattern that selects nothing is a failure rather than a silent pass.
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'raft-rs-runtime-boundaries';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PATH_JOINER = '/';

const SUITE = 'test/raft/raft-rs-backend/';
const ORIGIN_TEST = `${SUITE}failure-origin-domains.test.js`;
const RETIREMENT_TEST = `${SUITE}node-retirement-admissibility.test.js`;
const SCOPE_TEST = `${SUITE}two-boundary-scope.test.js`;

const anchored = (name) => `^${name}$`;

const RECEIPT = Object.freeze([
  // ---- D1: where a failure came from ------------------------------------
  ['three-failure-domains-are-structurally-distinguished-not-inferred-from-error-type',
    ORIGIN_TEST,
    anchored('the three failure domains are structurally distinguished, ' +
      'not inferred from the JavaScript error type'),
    'a core refusal, a host failure and a genuine panic are driven on the ' +
    'real core and land in three named domains, although two of the three ' +
    'arrive as a JavaScript Error'],
  ['the-fatal-classification-boundary-encloses-only-the-wasm-invocation',
    ORIGIN_TEST,
    anchored(
      'the fatal classification boundary encloses only the WASM invocation'),
    'the verifier\'s own reproduction: the replica\'s SQLite handle is ' +
    'closed and the Ready loop\'s durable write fails, and the runtime stays ' +
    'healthy while an unrelated group in it still dispatches'],
  ['an-ordinary-core-refusal-leaves-the-runtime-and-its-groups-usable',
    ORIGIN_TEST,
    anchored(
      'an ordinary core refusal leaves the runtime and its groups usable'),
    'raft-rs declines a proposal a follower cannot carry, nothing unwound, ' +
    'and the same call completes once the precondition the core named holds'],
  ['a-host-failure-is-never-upgraded-to-a-wasm-fatal',
    ORIGIN_TEST,
    anchored('a host failure is never upgraded to a WASM fatal'),
    'an application callback and a send hook throw real Errors with real ' +
    'messages in hand, and neither retires the WASM runtime'],
  ['a-genuine-rust-trap-is-never-downgraded-to-a-host-failure',
    ORIGIN_TEST,
    anchored('a genuine Rust trap is never downgraded to a host failure'),
    'the panic still marks the runtime unhealthy under the recorded policy, ' +
    'carries the panic hook\'s diagnosis, and is recovered by replacement'],
  ['every-named-failure-shape-is-driven-and-its-consequences-asserted',
    ORIGIN_TEST,
    anchored(
      'every named failure shape is driven and its consequences asserted'),
    'the seven shapes the owner named, plus the argument fault the generated ' +
    'glue itself throws, each with its classification, whether its group, ' +
    'its runtime and unrelated groups stayed usable, and its recovery'],

  // ---- D2: whether a retired replica may be called at all ----------------
  ['retirement-is-refused-at-the-node-before-the-core-is-touched',
    RETIREMENT_TEST,
    anchored(
      'retirement is refused at the node, before the core is touched'),
    'the group\'s handle is taken out of the runtime with the core\'s own ' +
    'primitive, so a check made after touching the core could only answer ' +
    'the core\'s refusal; the node still answers the typed retirement one'],
  ['a-retired-replica-neither-ticks-campaigns-proposes-nor-admits-envelopes',
    RETIREMENT_TEST,
    anchored('a retired replica neither ticks, campaigns, proposes nor ' +
      'admits envelopes'),
    'every active call refused by name, no outbound Raft traffic, its own ' +
    'core term unmoved and the live cluster\'s term and leader untouched'],
  ['retirement-survives-restart-with-no-scheduler-running',
    RETIREMENT_TEST,
    anchored('retirement survives a restart with no scheduler running'),
    'the verifier\'s exact reproducer: restarted through the real seam, the ' +
    'clock never asked to schedule anything, and tick called directly'],
  ['retirement-does-not-rewrite-conf-state-and-never-reactivates-an-identity',
    RETIREMENT_TEST,
    anchored(
      'retirement does not rewrite ConfState and never reactivates an ' +
      'identity'),
    'the stale configuration that still lists the replica is preserved ' +
    'exactly, and real envelopes arriving later change neither the durable ' +
    'retirement record nor the refusal'],
  ['bypassing-the-retirement-check-restores-the-disruptive-behaviour',
    RETIREMENT_TEST,
    anchored(
      'bypassing the retirement check restores the disruptive behaviour'),
    'the permanent control: the same ticks driven past the check raise the ' +
    'live cluster\'s term and cost it its leader'],
  ['a-non-retired-replica-still-admits-a-sender-absent-from-its-conf-state',
    RETIREMENT_TEST,
    anchored(
      'a non-retired replica still admits a sender absent from its ConfState'),
    'the falsified sender-membership rule stays falsified: a membership race ' +
    'is driven and the receiver admits the traffic'],

  // ---- scope -------------------------------------------------------------
  ['no-production-behaviour-outside-these-two-boundaries-changed',
    SCOPE_TEST,
    anchored('no production behaviour outside these two boundaries changed'),
    'nothing outside the experimental backend\'s own family imports it, and ' +
    'liferaft is still the default and does the same to a node through the ' +
    'seam as it does directly'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(
    ([id, testFile, testNamePattern, detail]) => Object.freeze({
      id, testFile, testNamePattern, detail,
    }))),
});

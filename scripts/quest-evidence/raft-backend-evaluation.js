#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'raft-backend-evaluation';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PATH_JOINER = '/';

const EVALUATION_DIR = 'test/raft/backend-evaluation/';
const TWO_CACHES_TEST = `${EVALUATION_DIR}liferaft-two-caches-two-configurations.test.js`;
const LOCALITY_TEST = `${EVALUATION_DIR}liferaft-configuration-locality.test.js`;
const TERM_VOTE_TEST = `${EVALUATION_DIR}liferaft-term-and-vote-restart.test.js`;
const CONTRACT_TEST = `${EVALUATION_DIR}minimum-backend-contract.test.js`;
const FORK_ARTIFACT_TEST = `${EVALUATION_DIR}forked-binding-artifact.test.js`;
const SCENARIOS_TEST = `${EVALUATION_DIR}core-membership-scenarios.test.js`;
const INVARIANTS_TEST = `${EVALUATION_DIR}core-membership-invariants.test.js`;
const RESTART_TEST = `${EVALUATION_DIR}core-restart-and-ordering.test.js`;
const IDENTITY_COST_TEST = `${EVALUATION_DIR}core-identity-and-cost.test.js`;
const DERIVATION_TEST = `${EVALUATION_DIR}evaluation-derivation.test.js`;
const READ_ONLY_TEST = `${EVALUATION_DIR}no-production-file-changed.test.js`;

const RECEIPT = Object.freeze([
  // Part A - what production does today, measured on the real seam.
  ['liferaft-same-partition-two-caches-yield-two-voting-configurations-without-consensus',
    TWO_CACHES_TEST,
    '^liferaft: the same partition under two caches yields two voting configurations with no consensus operation$',
    'one partition, caches saying {A,B,C} and {A,B,D}; each Raft instance reports its own voting configuration and majority with no consensus operation run'],
  ['liferaft-configuration-is-local-unreplicated-and-without-generation',
    LOCALITY_TEST,
    '^liferaft configuration is local, unreplicated and without generation$',
    'a join emits no message, the other node is unchanged, and the protocol packet is identical across a configuration change'],
  ['liferaft-term-and-vote-across-restart-on-the-production-persistence-path',
    TERM_VOTE_TEST,
    '^liferaft term and vote across a restart on the production persistence path$',
    'a real granted vote at a higher term, then the real sqlite restart path; what term and vote survive is read from the durable file'],

  // Part B - the contract, derived from src rather than from an API.
  ['minimum-backend-contract-derived-from-production-call-sites',
    CONTRACT_TEST,
    '^the minimum backend contract is derived from production call sites$',
    'the recorded contract equals a census regenerated from src, and every operation it calls missing is measured absent'],

  // Part C - the forked binding and the core scenarios.
  ['binding-exposes-raft-primitives-not-convenience-membership',
    FORK_ARTIFACT_TEST,
    '^the forked binding exposes raft primitives and no convenience membership methods$',
    'propose/apply/identify/observe configuration changes exist; addNode, removeNode, addLearner and promote do not'],
  ['three-voter-group-elects-and-commits-deterministically',
    SCENARIOS_TEST,
    '^a three-voter group elects and commits deterministically$',
    'one leader, the same ConfState reported by every peer, one entry applied at one index'],
  ['sequential-replacement-learner-catch-up-promote-remove-measured',
    SCENARIOS_TEST,
    '^sequential replacement: learner added, caught up, promoted, old voter removed$',
    'Lagrange-style replacement driven as three committed configuration changes, with catch-up read from the leader\'s own progress'],
  ['joint-replacement-by-conf-change-v2-enter-commit-leave-measured',
    SCENARIOS_TEST,
    '^joint replacement: one ConfChangeV2 enters, commits and leaves the joint configuration$',
    'the same replacement as one ConfChangeV2: enter the joint configuration, commit it, leave it'],
  ['conf-state-converges-after-apply-and-membership-decisions-come-from-the-core',
    INVARIANTS_TEST,
    '^ConfState converges after apply and membership decisions come from the core$',
    'after commit and apply each peer reports the ConfState its own apply returned; quorum comes from the core, not from service rows'],
  ['disagreeing-service-caches-leave-raft-membership-identical',
    INVARIANTS_TEST,
    '^disagreeing service caches leave raft membership identical$',
    'peers fed mutually contradictory service-row views still report one identical configuration'],
  ['second-conf-change-while-one-is-pending-observed-not-prescribed',
    INVARIANTS_TEST,
    '^a second configuration change while one is pending is observed, not prescribed$',
    'return value, committed entry types, resulting ConfState and whether the second change took effect are recorded; only the record\'s consistency is asserted'],
  ['restart-at-each-of-nine-boundaries-reconstructs-membership-from-durable-raft-state-alone',
    RESTART_TEST,
    '^a restart at each of the nine boundaries reconstructs membership from durable raft state alone$',
    'nine crash points from proposed-not-persisted to joint-left; each restart is rebuilt from the durable record alone'],
  ['ready-persistence-ordering-holds-and-returned-conf-state-is-the-durable-one',
    RESTART_TEST,
    '^ready and persistence ordering holds and the returned ConfState is the durable one$',
    'nothing advances before it is written down, and the ConfState apply_conf_change returned is the one stored and the one the core reports'],
  ['peer-identity-is-stable-unreused-and-safe-across-the-js-boundary',
    IDENTITY_COST_TEST,
    '^peer identity is stable, never reused, and safe across the JavaScript boundary$',
    'identity-derived ids stable across restart and address change, never reused after retirement, and carried above 2^53 without loss'],
  ['multi-raft-cost-separates-runtime-from-rawnode-in-the-intended-hosting-shape',
    IDENTITY_COST_TEST,
    '^Multi-Raft cost separates the runtime from the RawNode in the intended hosting shape$',
    'one runtime holding many handles; one-time runtime cost, per-RawNode bytes, idle tick and has_ready scan measured at N = 1, 100, 1000'],
  ['artifact-integrity-digest-matches',
    FORK_ARTIFACT_TEST,
    '^the forked binding artifact digest matches the recorded one$',
    'the .wasm and glue these scenarios load hash to the digests checked in beside them'],
  ['build-is-pinned-and-reproducibility-is-reported-honestly',
    FORK_ARTIFACT_TEST,
    '^the forked binding build is pinned and its reproducibility is reported honestly$',
    'Cargo.lock, rust-toolchain.toml, rustc, wasm-pack, wasm-bindgen, crate version and build command pinned; a second build\'s digest recorded as measured'],

  // The evaluation itself.
  ['membership-in-every-scenario-is-reported-by-the-core-not-declared',
    DERIVATION_TEST,
    '^membership in every scenario is reported by the core, not declared$',
    'every membership scenario reads the configuration back from the core, and no assertion\'s expected value is a written-down membership'],
  ['earlier-spike-findings-are-accounted-for',
    DERIVATION_TEST,
    '^the earlier raft-logic spike findings are accounted for$',
    'the twelve checks the spike census finds are each accounted for, together with the measured configuration-change sites in its sources'],
  ['three-verdicts-and-deletion-forecast-follow-by-derivation-and-document-is-in-sync',
    DERIVATION_TEST,
    '^the three verdicts and the deletion forecast follow by derivation and the document is in sync$',
    'consensus core, WASM boundary and Lagrange migration each cite their own driven scenarios; the forecast is labelled; the generated document renders both'],
  ['no-production-file-changed',
    READ_ONLY_TEST,
    '^no production file changed$',
    'measured from the quest\'s sealedAt commit, or the merge base before sealing; fails closed when the comparison sees none of this quest\'s own files'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(
    ([id, testFile, testNamePattern, detail]) =>
      Object.freeze({id, testFile, testNamePattern, detail}))),
});

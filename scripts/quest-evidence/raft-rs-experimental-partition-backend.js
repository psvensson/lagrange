#!/usr/bin/env node
// Evidence harness for the quest raft-rs-experimental-partition-backend.
//
// All 24 receipts of the sealed contract are declared here. Phase 1 covers
// receipts 1 to 6; receipts 7 to 24 name the witnesses later phases will
// write, so they select nothing and are RED. That is the honest state: a
// receipt with no witness has not been measured, and the probe counts it
// outstanding rather than silently omitting it.
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'raft-rs-experimental-partition-backend';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PATH_JOINER = '/';

const SUITE = 'test/raft/raft-rs-backend/';
const SEAM_TEST = `${SUITE}backend-seam.test.js`;
const CITATION_TEST = `${SUITE}host-contract-citations.test.js`;
const LOOP_TEST = `${SUITE}durable-ready-loop.test.js`;
const RESTART_TEST = `${SUITE}restart-from-durable-record.test.js`;
// Witnesses later phases write. They do not exist yet, and a receipt that
// names one is red until it does.
const MEMBERSHIP_AUTHORITY_TEST = `${SUITE}conf-state-authority.test.js`;
const INGRESS_TEST = `${SUITE}ingress-safety-boundary.test.js`;
const RUNTIME_HEALTH_TEST = `${SUITE}runtime-trap-and-restore.test.js`;
const SCALE_TEST = `${SUITE}multi-raft-scale.test.js`;
const IDENTITY_TEST = `${SUITE}peer-identity.test.js`;
const ELECTION_TEST = `${SUITE}election-safety.test.js`;
const WORKFLOW_TEST = `${SUITE}sequential-membership-workflow.test.js`;
const SNAPSHOT_TEST = `${SUITE}snapshot-and-compaction.test.js`;
const COMPARISON_TEST = `${SUITE}side-by-side-scenarios.test.js`;
const LEDGER_TEST = `${SUITE}complexity-ledger.test.js`;

const anyOf = (...names) => `^(${names.join('|')})$`;

const RECEIPT = Object.freeze([
  // ---- phase 1 -----------------------------------------------------------
  ['backend-seam-selects-explicitly-and-liferaft-behaviour-is-unchanged',
    SEAM_TEST,
    anyOf(
      'an absent backend selection is liferaft, and it says so by name',
      'the experimental backend is reached only by naming it',
      'a backend name the seam does not know is refused, never defaulted',
      'no production module configures the experimental backend',
      'the seam interface is the census of what production calls',
      'every seam name the experimental backend defers refuses by name',
      'routing liferaft through the seam changes nothing liferaft does'),
    'the seam resolves an absent selection to liferaft by name rather than ' +
    'by fallback, refuses an unknown backend, reaches raft-rs-wasm only when ' +
    'a configuration says so, serves exactly the provider census derived ' +
    'from src, and leaves what liferaft does to a node unchanged'],
  ['ready-and-apply-loop-order-derives-from-the-raft-rs-host-contract',
    null,
    null,
    'every ordering constraint cites a line of raft 0.7.0 vendored beside ' +
    'the binding with its digest recorded, the cited line is read and its ' +
    'text checked, and the loop runs the contract\'s steps in the ' +
    'contract\'s order because it iterates the contract itself',
    `npm run -s test:file -- ${CITATION_TEST} ${LOOP_TEST}`],
  ['commit-index-is-durable-with-or-before-applying-committed-entries',
    LOOP_TEST,
    anyOf(
      'the durable commit index is at or past every entry before it is applied',
      'a restart refuses a record whose applied index ran past its commit'),
    'the journal shows a durable commit index at or past every entry at the ' +
    'moment it was applied, and a host that withholds the commit index ' +
    'produces a record raft-rs itself refuses on restart, naming the applied ' +
    'index the durable record holds'],
  ['conf-state-and-its-applied-progress-are-written-atomically',
    LOOP_TEST,
    anyOf(
      'the configuration and its applied index are one write, so a restart ' +
      're-delivers nothing it already applied',
      'a fault inside the apply transaction leaves the pair agreeing'),
    'the configuration and the applied index are columns of one row written ' +
    'by one statement: a restart re-delivers nothing the record accounts ' +
    'for, a host that splits the write makes the core re-deliver, and a ' +
    'transaction that does not commit leaves neither half'],
  ['restart-reconstructs-raft-state-from-its-own-durable-record-on-real-storage',
    RESTART_TEST,
    anyOf(
      'a restart reconstructs what the core itself held before the crash',
      'what a restart reconstructs is exactly what the durable bytes hold'),
    'term, vote, commit, applied and the configuration come back as the ' +
    'live core reported them before the crash and as an independent reader ' +
    'finds them in the SQLite file'],
  ['no-recovery-state-is-inferred-from-a-service-or-system-table-cache',
    RESTART_TEST,
    anyOf(
      'the restore path cannot reach a cache, a service or a system table',
      'poisoning every cache in the same database changes nothing'),
    'the restore path\'s parameters and its whole import closure are parsed ' +
    'out of src and neither can reach a cache, and poisoning the liferaft ' +
    'state, the liferaft log and a service row in the same database moves ' +
    'nothing the restored core reports'],

  // ---- phases 2 and later: no witness yet, therefore red -----------------
  ['conf-state-is-the-membership-authority-under-divergent-hostile-caches',
    MEMBERSHIP_AUTHORITY_TEST,
    '^two peers whose caches disagree observe the committed configuration$',
    'the liferaft part A case under this backend: divergent caches, one ' +
    'holding a still-syncing replica the other has never seen'],
  ['lagrange-rows-project-membership-and-never-alter-the-configuration',
    MEMBERSHIP_AUTHORITY_TEST,
    '^no cache mutation alters quorum membership$',
    'rows project the committed configuration outward and never modify it'],
  ['ingress-validation-refuses-routing-faults-and-admits-transition-traffic',
    INGRESS_TEST,
    '^the envelope boundary refuses routing faults and admits a membership transition$',
    'envelope and routing invariants only; a sender absent from the ' +
    'receiver\'s applied configuration is never refused for that reason'],
  ['hostile-messages-that-still-reach-a-trap-are-enumerated',
    INGRESS_TEST,
    '^every hostile message that still reaches a trap is enumerated$',
    'which hostile messages still trap despite correct routing validation'],
  ['a-trap-marks-the-runtime-unhealthy-and-its-groups-restore-from-durable-state',
    RUNTIME_HEALTH_TEST,
    '^a trap marks the runtime unhealthy and its groups restore$',
    'dispatch stops, a fresh runtime is instantiated, groups restore'],
  ['multi-raft-host-and-runtime-replacement-measured-at-real-scales',
    SCALE_TEST,
    '^runtime replacement is measured at one, one hundred and one thousand groups$',
    'measured on real storage at this quest\'s own scales'],
  ['peer-identity-is-stable-address-independent-unreused-and-exact',
    IDENTITY_TEST,
    '^a raft peer id survives restart, ignores address and is never reassigned$',
    'and crosses the JavaScript boundary exactly, never through a Number'],
  ['a-peer-that-is-no-longer-a-voter-cannot-participate-as-one',
    ELECTION_TEST,
    '^a peer that is no longer a voter cannot participate in an election$',
    'the removed peer that kept ticking, under the real backend'],
  ['pre-vote-and-check-quorum-settled-by-failure-scenarios-not-assumption',
    ELECTION_TEST,
    '^pre-vote and check-quorum are settled by driven failure scenarios$',
    'settings chosen from measurement, not from assumption'],
  ['learner-promotion-is-gated-by-lagrange-on-the-cores-own-progress',
    WORKFLOW_TEST,
    '^promotion is gated on the core\'s own progress$',
    'Lagrange decides when promotion is safe; the core commits it'],
  ['sequential-membership-workflow-completes-through-formation-and-recovery',
    WORKFLOW_TEST,
    '^add learner, catch up, promote and remove completes through recovery$',
    'with joint support kept available and tested'],
  ['membership-change-in-progress-is-an-explicit-provider-result',
    WORKFLOW_TEST,
    '^a second configuration change is an explicit membership-change-in-progress result$',
    'the core stays the authority on whether another change can take effect'],
  ['snapshot-and-compaction-contract-holds-and-state-does-not-diverge',
    SNAPSHOT_TEST,
    '^configuration and applied state do not diverge across a snapshot restore$',
    'snapshot with membership, applied index, restore, compaction, restart'],
  ['replica-operation-gained-only-fields-a-falsifier-required',
    WORKFLOW_TEST,
    '^every field added to the replica operation was required by a falsifier$',
    'no speculative reason, generation or transition fields'],
  ['every-scenario-runs-on-both-backends-and-outcomes-are-compared',
    COMPARISON_TEST,
    '^every scenario runs on both backends and the outcomes are compared$',
    'application-level outcomes and safety properties, not internals'],
  ['complexity-ledger-recorded-and-deletion-candidates-named',
    LEDGER_TEST,
    '^the complexity ledger is derived from src and names the deletion candidates$',
    'added against removed, and what a cutover would delete'],
  ['migration-decision-follows-from-the-scenarios-by-derivation',
    COMPARISON_TEST,
    '^the migration decision is derived from what the scenarios measured$',
    'one of recommend cutover, continue experimental, or reject'],
  ['liferaft-is-untouched-its-logs-unmigrated-and-it-remains-the-default',
    COMPARISON_TEST,
    '^liferaft is untouched, its logs unmigrated, and it remains the default$',
    'proved against the liferaft suite and the durable liferaft tables'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(
    ([id, testFile, testNamePattern, detail, command]) => Object.freeze({
      id,
      ...(command ? {command} : {testFile, testNamePattern}),
      detail,
      allowMultiple: true,
    }))),
});

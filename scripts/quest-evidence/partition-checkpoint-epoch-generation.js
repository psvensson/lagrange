#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {CHECK_VERIFICATION_FLAG, exitWithQuestVerification} from './verification-check.js';

const QUEST_ID = 'partition-checkpoint-epoch-generation';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerification(QUEST_ID);
}

const WITNESS = 'test/raft/raft-rs-backend/partition-checkpoint-epoch-generation.test.js';
const MESSAGE_GROUP_JOIN = 'test/integration/message-group-learner-join.integration.test.js';
const SN1_CATCHUP = 'test/raft/raft-rs-backend/partition-snapshot-compaction-catchup.test.js';
const WIRING_REASK = 'test/raft/snapshot-catchup-wiring-reask.test.js';
const DRIVER_UNIT = 'test/partition/partition-snapshot-catchup-driver.test.js';
const REFUSAL_UNIT = 'test/partition/partition-snapshot-cadence-refusal.test.js';
const DISPATCH_UNIT = 'test/raft/snapshot-catchup-dispatch.test.js';
const INSTALL_RECREATE = 'test/raft/raft-rs-backend/partition-snapshot-install-recreate.test.js';
const INSTALL_EPISODE = 'test/raft/raft-rs-backend/partition-snapshot-install-episode.test.js';
const INSTALL_SECOND_OFFER =
  'test/raft/raft-rs-backend/partition-snapshot-install-second-offer.test.js';
const INSTALL_REMOVE_DEFERRED =
  'test/raft/raft-rs-backend/partition-snapshot-install-remove-deferred.test.js';
const INSTALL_CREATE_REPLAY =
  'test/raft/raft-rs-backend/partition-snapshot-install-create-replay.test.js';
const INSTALL_ORCHESTRATION = 'test/raft/snapshot-catchup-install.test.js';
const INSTALL_OWNER_UNIT = 'test/node/replica-snapshot-install-owner.test.js';
const RECREATE_ADMISSION_UNIT = 'test/node/replica-recreate-after-install-admission.test.js';
const OFFER_ROUTER_UNIT = 'test/raft/snapshot-offer-router.test.js';

function witness(id, prefix, detail) {
  return Object.freeze({id, testFile: WITNESS, testNamePattern: `^${prefix} .*$`,
    expectedTests: 1, detail});
}

// A witness over the node's real replica handler (ReplicaHandlerSetup.create).
function handlerWitness(id, testNamePattern, expectedTests, detail) {
  return Object.freeze({id, testFile: INSTALL_RECREATE, testNamePattern,
    expectedTests, detail});
}

const receipts = Object.freeze([
  witness('format-epoch-is-opaque-for-partitions', 'W1',
    'A partition replica image sealed under a publication epoch that differs from the group\'s membership generation index is created and is VALID by the checkpoint reader.'),
  witness('message-group-epoch-rule-kept-where-defined', 'W2',
    'A message-group image whose epoch is not its own configuration generation is still CORRUPT_DESCRIPTOR raftRs; equal, it is VALID.'),
  witness('creation-refuses-reader-rejected-image', 'W3',
    'Checkpoint creation reads back what it sealed through the reader: a rejected image is the typed IMAGE_REJECTED refusal with the reader\'s outcome, and neither the generation nor its staging is left on disk.'),
  witness('cadence-compacts-genesis-group-publication-epoch-one', 'W4',
    'Genesis group (generation 0), publication epoch 1: the leader\'s own sweep compacts past the threshold and a cut-off follower installs through the production dispatch and orchestration and converges.'),
  witness('cadence-compacts-after-membership-change-epoch-zero', 'W5',
    'Committed membership change (generation 2), publication epoch 0: compacts, installs, converges.'),
  witness('cadence-compacts-after-membership-change-epoch-one', 'W6',
    'Committed membership change (generation 2), publication epoch 1: compacts, installs, converges.'),
  witness('epoch-moved-follower-installs-current-identity-generation', 'W7',
    'Case F: after a valid compaction the publication epoch moves and writes continue below the threshold; the dispatch does not serve the stale generation, seals one under the current identity, and the follower installs it and converges.'),
  witness('refused-follower-is-re-asked-and-stall-visible', 'W8',
    'Case F with a lagging leader cache, through the production wiring: the receiver refuses stale_epoch; the refusal is logged typed once and visible in the leader\'s diagnostics; an unchanged refusal is not re-driven before the declared bound; the bound and the identity-changed event re-ask over freshly dialled connections; the follower installs and its record closes.'),
  witness('cadence-refusal-is-typed-logged-and-not-a-rebuild-loop', 'W9',
    'A cadence creation refusal is logged typed, stands as a visible refusal state, builds no image while its reason is unchanged, and is retried on the declared bound and on the applied-index event.'),
  witness('second-episode-served-over-a-fresh-connection', 'W10',
    'A follower served once falls behind a later boundary and is served again: every dispatch dials its own connection through the production wiring and the offer is routed again.'),
  witness('cadence-refusal-stamped-at-completion', 'W11',
    'The standing refusal is stamped when the image attempt completes, so a slow build is spaced from its end.'),
  witness('any-compaction-ends-the-refusal', 'W12',
    'A compaction through an already sealed generation clears a standing refusal.'),
  witness('dispatch-sealing-respects-the-cadence-hold', 'W13',
    'One creation owner: a generation the dispatch needs is sealed by the cadence owner and is refused typed while the cadence holds the image.'),
  witness('service-shutdown-aborts-catchup-flights', 'W14',
    'A leader service shut down while its dispatch waits on a silent follower aborts the dispatch and frees the follower node\'s transfer slot.'),
  witness('served-generation-names-the-follower', 'W15',
    'A generation sealed before the leader applied a follower\'s admission is not served to it: the dispatch seals one that names it; a follower the leader never admitted is the typed generation_omits_follower and nothing is dialled.'),
  handlerWitness('new-replica-behind-compaction-installs-and-reaches-active',
    '^W-new: .*$', 1,
    'Finding 1 through the real replica handler and its CREATE path: a new replica (row PENDING, CREATING, SYNCING) on a partition whose leader compacted past its start is offered a generation that names it, installs, is recreated by the handler, catches up, becomes a voter, and its row reaches ACTIVE.'),
  handlerWitness('create-outliving-the-install-continues-with-the-replacement',
    '^W-new-late: .*$', 1,
    'The same create with the leader\'s admission answer delivered only after the install replaced the service the create opened: the create continues with the replacement (its own participant release, then ACTIVE).'),
  handlerWitness('established-follower-recreated-by-the-real-handler',
    '^W-established: .*$', 1,
    'The control: an ACTIVE follower behind the leader\'s compaction installs and is recreated through ReplicaHandlerSetup.create wiring.'),
  handlerWitness('stopped-replica-return-is-owned', '^W-(offer|recreate|installing).*$', 6,
    'Through the real handler: an offer the lifecycle does not admit (unobservable, REMOVING) is refused before anything is received with the replica untouched and the leader told why; after the shutdown a recreate that throws or is held stays the handler\'s visible obligation and the replica returns on the retry bound; a row turning REMOVING holds it for the removal owner, still under its episode; an offer during an install is answered installing; a handler stop claims the episode and releases a replacement that was opening.'),
  Object.freeze({
    id: 'install-episode-fence-holds-and-claims',
    testFile: INSTALL_EPISODE,
    detail: 'The install episode through the real handler: registry and tracked-service writes without custody are refused typed and counted; a REMOVE accepted through the request path holds the episode, claims it once REMOVING is durable and acts on the tracked stopped service after the replacement was closed; a deferred REMOVING write lifts the hold and the replica returns fenced for serving; REMOVING and FAILED rows hold for their owners and are cleared by the REMOVE request and by the row returning; a handler stop before the shutdown step installs nothing.',
  }),
  Object.freeze({
    id: 'second-offer-never-installs-under-the-replacement',
    testFile: INSTALL_SECOND_OFFER,
    detail: 'H1: a second offer from a new leader while the first install is before its shutdown is answered installing at routing; nothing is installed under the replacement that runs, and the replica converges through the new leader\'s re-ask.',
  }),
  Object.freeze({
    id: 'deferred-remove-leaves-an-owner-of-the-return',
    testFile: INSTALL_REMOVE_DEFERRED,
    detail: 'H2: a removal that cannot make its REMOVING row durable claims nothing; the stopped replica stays under its episode and returns.',
  }),
  Object.freeze({
    id: 'create-replay-refused-during-an-install-episode',
    testFile: INSTALL_CREATE_REPLAY,
    detail: 'H3: the replay of a replica\'s own CREATE while it is stopped for an install opens nothing, is not answered already_exists and emits no ACTIVE outcome.',
  }),
  Object.freeze({
    id: 'install-orchestration-owns-every-path-after-the-shutdown',
    testFile: INSTALL_ORCHESTRATION,
    detail: 'The orchestration over a real transfer and install: nothing is stopped before the install episode admits it or after another owner claimed it; nothing is installed once the custody is void; after the shutdown (thrown or not), a rejected install and an install that threw each hand the stopped replica back to the episode exactly once.',
  }),
  Object.freeze({
    id: 'install-owner-branches',
    testFile: INSTALL_OWNER_UNIT,
    detail: 'The handler\'s install owner branch by branch over the real handler and lifecycle rows: the offer exclusion, the choke point in every episode state, the admission before the shutdown, the removal hold keyed by operation id, each claim and its episode_step_settle wait (removal, cleanup under a token, create failure, handler stop), the named holds, and a create activating the service that runs over an install around its ACTIVE write.',
  }),
  Object.freeze({
    id: 'recreate-after-install-admission-is-total',
    testFile: RECREATE_ADMISSION_UNIT,
    detail: 'The named admission as a decision table over every lifecycle status, an unobservable row, no row, a cleanup-ownership row and a row of another replica.',
  }),
  Object.freeze({
    id: 'offer-router-typed-refusals',
    testFile: OFFER_ROUTER_UNIT,
    detail: 'The offer router answers replica_installing for a replica stopped for an install, receiver_not_admitted (with the admission) before anything is received, and routes an admitted offer with buffered-frame replay.',
  }),
  Object.freeze({
    id: 'reask-over-production-wiring',
    testFile: WIRING_REASK,
    detail: 'Over attachSnapshotCatchupDispatcher and armSnapshotOfferRouting with real bulk registries and each node\'s real replica handler: a second dispatch after a refusal and after a served transfer is dialled afresh and routed; unroutable offers answer typed aborts; an unanswered dispatch is aborted at the idle bound and frees the node slot; three partitions lagging on one node are each served; a busy lane is socket_unavailable; a driver shut down mid-dispatch frees the slot for another partition; a half-open adopted connection is closed at the lane idle bound and the reverse dispatch is then served; a follower install that did not complete is recorded typed on the replica.',
  }),
  Object.freeze({
    id: 'catchup-driver-contract',
    testFile: DRIVER_UNIT,
    detail: 'The catch-up driver against an owner-shaped consensus status: typed seam outcomes, coalescing, the re-ask triggers and bounds, the idle abort, closing by progress, by committed configuration and on lost leadership.',
  }),
  Object.freeze({
    id: 'cadence-refusal-decision-table',
    testFile: REFUSAL_UNIT,
    detail: 'The standing refusal as a decision table: unheld, held, lifted by the named events after the doubling spacing, lifted at the bound.',
  }),
  Object.freeze({
    id: 'dispatch-selects-off-the-delivery-turn',
    testFile: DISPATCH_UNIT,
    detail: 'The dispatch claims the follower slot in the caller turn and selects (reads and hashes) the generation only after yielding it; the sealer capability replaces the db option.',
  }),
  Object.freeze({
    id: 'message-group-descriptor-moved-regression',
    testFile: MESSAGE_GROUP_JOIN,
    detail: 'The message-group fresh-learner join file passes unchanged: a configuration that moves between the leader\'s committed read and its image seal still answers DESCRIPTOR_MOVED with detail corrupt_descriptor and the target refuses it.',
  }),
  Object.freeze({
    id: 'sn1-fixture-exercises-nonzero-publication-epoch',
    testFile: SN1_CATCHUP,
    detail: 'The SN1 catch-up file passes with its identity fixture reading the field the epoch reader reads (publication_epoch), so its sealed epoch is 3 and no longer silently 0.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});

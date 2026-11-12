// Re-entry fixture of the CDC recipient-progress witnesses (design note
// S3.11). Production on both sides of the range contract:
// - source: a real rs-raft `config` partition leader behind the production
//   write path (unknown-outcome-surface fixture, cdc mode): CDC owed-work
//   admission, ledger, obligation lane, CDC_DELIVERED proposal, commit and
//   application, and the partition's own paged hydration-image answer;
// - recipient: a real native MessageGroupService (rs-raft, one replica) with
//   the real committed acceptance (applyDurableCdcBatch: range capture and
//   validation, the leader's range decision, proposal, commit, application),
//   the real CDCHandler and SystemTableCache with its position cell, and a
//   production CDCIntegrationService relister over the source leader's
//   actual image query, including its bounded slots, pace and shutdown.
// Substitutes (ports): the owner-RPC hop of the image query is a direct call;
// the sender's cache holds only what a witness puts in it; a second recipient
// group (the frontier holder) is a transport answer that commits every range;
// `mode` replaces the real group's answer with a dead recipient's.
// (Imported first: the surface fixture's import order is the one that
// evaluates the query engine's module cycle.)
import {withSurface} from '../query/unknown-outcome-surface-fixture.js';
import assert from 'node:assert/strict';
import {SOURCE_IMAGE_ADMISSION, isSourceRange} from
  '../../src/cache/system-table-cache-source-order.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {CDC_COMPLETION, buildCommittedCdcOutcome, buildProvisionalCdcOutcome,
  unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {registerSourceRelister} from '../../src/cdc/cdc-integration-service-source-relist.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {countCdcObligations, readCdcLedgerNewest, readCdcObligationProgress} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_HYDRATION_IMAGE_PAGE_FIELD} from
  '../../src/partition/partition-service-hydration-image-methods.js';
import {PARTITION_SERVICE_CDC} from '../../src/partition/partition-service-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {pump, recipientFixture} from '../message-group/message-group-native-custody-fixture.js';
import {createMessageGroupServiceRow, createTopologyCache, deliveredEventsOf, putTopologyRow} from
  '../topology/cdc-group-propagation-service-harness.js';

const SOURCE_NODE = 'uo-node';
const HOLDER_GROUP = 'reentry-holder-group';
const HOLDER_NODE = 'reentry-holder-node';
const WRITE_BATCH = 64;
const POLL_MS = 5;
const SETTLE_BUDGET_MS = 60000;
const SOURCE_OWNER_UNAVAILABLE = 'reentry_source_owner_unavailable';
const INSERT_CONFIG = `INSERT INTO ${TABLES.CONFIG} (config_key, config_value, value_type, ` +
  'default_value, created_at) VALUES (?, ?, ?, ?, ?)';

// What the recipient group answers a shipped range with.
const RECIPIENT_MODE = Object.freeze({
  // The real committed acceptance of the real group.
  REAL: 'real',
  // A typed refusal with a hint (the group cannot commit).
  REFUSING: 'refusing',
  // Its answer never settles.
  NEVER_SETTLING: 'never_settling',
  // It only ever accepts provisionally.
  PROVISIONAL: 'provisional',
});

const positionOf = (row) => ({logIndex: row.logIndex, ordinal: row.ordinal});

// The actual relister fetches and publishes the source's image. Other tables
// have no hosted owner in this composition, so their debt remains unavailable
// through the real pace until shutdown. Only the query hop is replaced.
function registerCountedRelister(t, f, recipient) {
  const cache = recipient.group.cdcHandler.cache;
  let image = null;
  const service = new CDCIntegrationService({nodeId: recipient.group.nodeId,
    cacheMutationTarget: cache, timeSource: f.partition.timeSource,
    sqlQueryEngine: {queryExecutor: {async executeOnPartition(partitionId, _sql, _params,
      _forRead, _preferLeader, _sameGroup, options) {
      if (partitionId !== f.partition.partitionId) {
        return {success: false, errorCode: SOURCE_OWNER_UNAVAILABLE};
      }
      const message = options.buildRequest();
      if (message[PARTITION_HYDRATION_IMAGE_PAGE_FIELD].page === 0) {
        image = {appliedIndex: null, installed: false};
        recipient.images.push(image);
      }
      const answer = await f.partition.handleRemoteQuery(message);
      assert.equal(answer.success, true, `the source leader refused its image: ${answer.errorCode}`);
      image.appliedIndex = answer.sourceImage.appliedIndex;
      // All pages have been fetched, but the production relister has not
      // installed them. Preserve the original held-image write schedule.
      if (answer.imagePage.last && recipient.duringImage) await recipient.duringImage(image);
      return options.buildSuccessResult(answer);
    }}}});
  const logger = recipient.group.logger;
  service.logger = {
    debug: (...args) => logger.debug(...args), warn: (...args) => logger.warn(...args),
    error: (...args) => logger.error(...args),
    info(message, fields) {
      if (fields.sourcePartition === f.partition.partitionId &&
          (fields.outcome === SOURCE_IMAGE_ADMISSION.INSTALL ||
          fields.outcome === SOURCE_IMAGE_ADMISSION.SUPERSEDED)) image.installed = true;
      logger.info(message, fields);
    },
  };
  recipient.relistService = service;
  t.after(() => service.markShuttingDown());
  registerSourceRelister(service);
}

// The recipient group's answer under the witness's mode; every shipped range
// is recorded with whether the range contract owner accepts its shape. REAL
// is the group's own applyCDCBatch, untouched.
function recipientPort(f, recipient) {
  const {group} = recipient;
  const real = group.applyCDCBatch.bind(group);
  group.applyCDCBatch = async (events, options) => {
    recipient.shipped.push({range: options.sourceRange,
      wellFormed: isSourceRange(options.sourceRange),
      keys: events.map((event) => event.data.config_key)});
    // The witness's action while this vector is in flight.
    if (recipient.beforeAnswer) await recipient.beforeAnswer();
    if (recipient.mode === RECIPIENT_MODE.REFUSING) {
      return {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE), retryAfterMs: 40};
    }
    if (recipient.mode === RECIPIENT_MODE.NEVER_SETTLING) return f.neverSettled.promise;
    if (recipient.mode === RECIPIENT_MODE.PROVISIONAL) {
      return buildProvisionalCdcOutcome(events, 20, group.groupId);
    }
    const answer = await real(events, options);
    // What the real acceptance answered, for a witness that must explain an
    // unconfirmed delivery.
    recipient.answers.push(answer?.success === true ? 'accepted' : answer?.error ?? 'refused');
    return answer;
  };
  return group;
}

async function realRecipient(t, f, groupId) {
  const native = await recipientFixture(t, `${groupId}-key`, {replicaCount: 1, groupId});
  const recipient = {native, group: native.services[0], images: [], shipped: [],
    mode: RECIPIENT_MODE.REAL, duringImage: null, beforeAnswer: null, answers: []};
  recipient.port = recipientPort(f, recipient);
  registerCountedRelister(t, f, recipient);
  f.recipients.push(recipient);
  return recipient;
}

// The second recipient group of the propagation: a route in the sender's
// cache whose transport answer commits every range.
function addFrontierHolder(f) {
  putTopologyRow(f.senderCache, TABLES.NODES, {[COLUMN.NODE_ID]: HOLDER_NODE,
    [COLUMN.BOOT_INCARNATION]: 1});
  putTopologyRow(f.senderCache, TABLES.SERVICES, {...createMessageGroupServiceRow(
    `${HOLDER_GROUP}-r1`, HOLDER_NODE, `${HOLDER_NODE}/message-group/${HOLDER_GROUP}-r1`,
    RAFT_ROLE.LEADER, HOLDER_GROUP), [COLUMN.REPLICA_ID]: `${HOLDER_GROUP}-r1`,
  [COLUMN.CREATED_AT]: 100, create_attempt_token: `${HOLDER_GROUP}-birth-1`});
}

function buildTopology(f) {
  const topology = new CDCGroupPropagationService({nodeId: SOURCE_NODE,
    systemTableCache: f.senderCache, messageRouter: {deliver: async (_address, payload) => {
      const events = deliveredEventsOf(payload);
      f.holderShipped.push(...events.map((event) => event.data.config_key));
      return buildDeliveryEnvelope({acknowledged: true},
        buildCommittedCdcOutcome(events, payload.targetGroupId, {index: 9, term: 2}));
    }},
    latencyTreeService: {getRoutingOrder: () => []}, deliveryRetryMaxAttempts: 1});
  topology.initialize();
  topology.start();
  return topology;
}

/**
 * Attach the partition's one propagation subscriber, bound to a recipient
 * group (its source message group): the production registration, whose
 * handshake drives the lane.
 * @param {Object} f - The fixture.
 * @param {Object} recipient - A realRecipient.
 * @return {Promise<Object>} The subscriber.
 */
async function attachRecipient(f, recipient) {
  const selection = () => ({ready: true, service: recipient.port});
  const subscriber = buildPartitionCdcPropagationSubscriber({tableName: TABLES.CONFIG,
    resolveOperationalMessageGroupSelection: selection,
    resolveOperationalMessageGroupSelectionAsync: async () => selection(),
    buildMessageGroupOwnerNotReadyError: () => new Error('not ready'),
    propagatePartitionCDCEvent: (_selected, events, context) =>
      f.topology.propagateCDCEvent({events, sourceMessageGroupService: recipient.port,
        deliveryContext: context}),
  });
  f.attachments += 1;
  await f.partition.subscribeToCDCWithHandshake(subscriber,
    {subscriberId: `reentry-propagation-${f.attachments}`,
      role: PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION});
  f.subscribers.push(subscriber);
  return subscriber;
}

function detachRecipient(f, subscriber) {
  f.partition.unsubscribeFromCDC(subscriber);
  f.subscribers.splice(f.subscribers.indexOf(subscriber), 1);
}

/**
 * Commit `count` rows through the partition's write path; every write must
 * be admitted (a refusal for CDC capacity fails the witness).
 * @param {Object} f - The fixture.
 * @param {number} count - How many rows.
 * @return {Promise<void>}
 */
async function writeRows(f, count) {
  for (let done = 0; done < count;) {
    const batch = Math.min(WRITE_BATCH, count - done);
    const answers = await Promise.all(Array.from({length: batch}, () => {
      f.written += 1;
      return f.partition.executeQuery(INSERT_CONFIG,
        [`reentry-${f.written}`, `value-${f.written}`, 'string', '', f.written],
        {entryId: `reentry-write-${f.written}`});
    }));
    const refused = answers.find((answer) => answer.success !== true);
    assert.equal(refused, undefined, `a write was refused: ${JSON.stringify(refused)}`);
    done += batch;
    f.maxOwed = Math.max(f.maxOwed, countCdcObligations(f.partition.db).owed);
  }
}

const laneOf = (f) => f.partition.cdcDelivery.getCdcObligationDiagnostics();

/**
 * Wait until a condition holds while the recipient groups' consensus runs.
 * Every poll also samples the owed depth and the witness's invariant.
 * @param {Object} f - The fixture.
 * @param {Function} condition - () => boolean.
 * @param {string} what - What is awaited (the failure says it).
 * @return {Promise<void>}
 */
async function until(f, condition, what) {
  const deadline = Date.now() + SETTLE_BUDGET_MS;
  for (;;) {
    for (const recipient of f.recipients) await pump(recipient.native);
    f.maxOwed = Math.max(f.maxOwed, countCdcObligations(f.partition.db).owed);
    f.invariant?.();
    if (condition()) return;
    assert.ok(Date.now() < deadline, `not reached within ${SETTLE_BUDGET_MS} ms: ${what}; ` +
      `lane ${JSON.stringify(laneOf(f))}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

const lanePrimaryOf = (f) => laneOf(f).recipients.find((recipient) =>
  recipient.groupId !== HOLDER_GROUP);
const newestOf = (f) => positionOf(readCdcLedgerNewest(f.partition.db));
const owedOf = (f) => countCdcObligations(f.partition.db).owed;
const cellOf = (f, recipient) =>
  recipient.group.cdcHandler.cache.sourceOrder.positionOf(f.partition.partitionId);
const sourceRowsOf = (f) => new Map(f.partition.db.prepare(
  `SELECT config_key, config_value FROM ${TABLES.CONFIG}`).all()
  .map((row) => [row.config_key, row.config_value]));
const recipientRowsOf = (recipient) => new Map(recipient.group.systemTableCache
  .getAll(TABLES.CONFIG).map((row) => [row.config_key, row.config_value]));

// Whether the ledger reclaimed everything it recorded.
function ledgerReclaimed(f) {
  const progress = readCdcObligationProgress(f.partition.db);
  const newest = newestOf(f);
  return owedOf(f) === 0 && progress !== null && progress.throughLogIndex === newest.logIndex &&
    progress.throughOrdinal === newest.ordinal;
}

/**
 * Run a witness on the re-entry composition.
 * @param {Object} t - The test context.
 * @param {Function} body - async (f) => void.
 * @param {Object} [options] - {holder: add the frontier-holder group}.
 * @return {Promise<void>}
 */
async function withRelistReentry(t, body, {holder = false} = {}) {
  await withSurface([TABLES.CONFIG], async ({of}) => {
    const f = {partition: of(TABLES.CONFIG).partition, recipients: [], subscribers: [],
      holderShipped: [], attachments: 0, written: 0, maxOwed: 0, invariant: null,
      neverSettled: Promise.withResolvers(),
      senderCache: createTopologyCache({nodes: [{[COLUMN.NODE_ID]: SOURCE_NODE}]})};
    if (holder) addFrontierHolder(f);
    f.topology = buildTopology(f);
    f.realRecipient = (groupId) => realRecipient(t, f, groupId);
    try {
      await body(f);
    } finally {
      f.neverSettled.resolve(unknownCdcAcceptance());
      for (const subscriber of [...f.subscribers]) detachRecipient(f, subscriber);
      f.topology.stop();
      for (const recipient of f.recipients) recipient.relistService.markShuttingDown();
      await Promise.allSettled(f.recipients.flatMap((recipient) =>
        recipient.native.services.map((service) => service.shutdown())));
    }
  }, {cdc: true});
}

export {RECIPIENT_MODE, attachRecipient, cellOf, detachRecipient, laneOf,
  lanePrimaryOf, ledgerReclaimed, newestOf, owedOf, recipientRowsOf, sourceRowsOf, until,
  withRelistReentry, writeRows};

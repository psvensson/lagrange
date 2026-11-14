import assert from 'node:assert/strict';

import {TABLES} from '../../src/constants/index.js';
import {test} from '../../src/test-helpers/tap.js';
import {CDC_COMPLETION} from '../../src/cdc/cdc-delivery-outcome.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {
  buildPartitionCdcPropagationSubscriber,
} from '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';

const REPLICA_ID = 'nodes-p1-r1';
const PARTITION_ID = 'nodes-p1';
const RETRY_AFTER_MS = 250;
const DEFER_REASON = 'leader-transition';
const READY_REASON = null;
const READY_READINESS = Object.freeze({
  ready: true,
  retryAfterMs: 0,
  reason: READY_REASON,
});
const DEFERRED_READINESS = Object.freeze({
  ready: false,
  retryAfterMs: RETRY_AFTER_MS,
  reason: DEFER_REASON,
});
const CDC_EVENT = Object.freeze({
  tableName: TABLES.NODES,
  operation: 'UPSERT',
  data: Object.freeze({node_id: 'node-1'}),
});
// The one subscriber contract: (events, deliveryContext), events an ordered
// vector of one table. The non-durable producer hands a vector of one.
const CDC_EVENTS = Object.freeze([CDC_EVENT]);
const OWNER_NOT_READY_MESSAGE =
  `Operational message-group ingress not ready for ${TABLES.NODES} CDC propagation`;

function buildOwnerNotReadyError(selection = {}, options = {}) {
  const error = new Error(options.message || OWNER_NOT_READY_MESSAGE);
  error.ownerNotReady = true;
  error.deferRetry = true;
  if (Number.isFinite(selection.retryAfterMs) && selection.retryAfterMs > 0) {
    error.retryAfterMs = selection.retryAfterMs;
  }
  return error;
}

test(
  'buildPartitionCdcPropagationSubscriber defers on preferred ingress readiness before propagation starts',
  async (t) => {
    let propagateCallCount = 0;
    const preferredService = {
      canAcceptCDCEvent() {
        return DEFERRED_READINESS;
      },
    };
    const subscriber = buildPartitionCdcPropagationSubscriber({
      tableName: TABLES.NODES,
      partitionId: PARTITION_ID,
      replicaId: REPLICA_ID,
      preferredService,
      resolveOperationalMessageGroupSelection: () => ({
        service: null,
        ...DEFERRED_READINESS,
      }),
      resolveOperationalMessageGroupSelectionAsync: async () => ({
        service: preferredService,
        ...READY_READINESS,
      }),
      buildMessageGroupOwnerNotReadyError: buildOwnerNotReadyError,
      propagatePartitionCDCEvent: async () => {
        propagateCallCount += 1;
      },
    });

    assert.deepEqual(
      subscriber.canAcceptCDCEvent(CDC_EVENT),
      DEFERRED_READINESS,
      'subscriber should surface preferred ingress defer readiness',
    );

    await assert.rejects(
      () => subscriber(CDC_EVENTS),
      (error) => {
        assert.equal(error.ownerNotReady, true);
        assert.equal(error.deferRetry, true);
        assert.equal(error.retryAfterMs, RETRY_AFTER_MS);
        assert.equal(error.message, OWNER_NOT_READY_MESSAGE);
        return true;
      },
      'subscriber should defer instead of starting propagation work',
    );

    t.equal(propagateCallCount, 0,
      'propagation should not start when preferred ingress reports defer');
  },
);

test(
  'buildPartitionCdcPropagationSubscriber falls back to the current operational ingress when preferred ingress is absent',
  async (t) => {
    let propagatedMessageGroupService = null;
    let propagatedEvent = null;
    const selectedService = {
      canAcceptCDCEvent() {
        return READY_READINESS;
      },
    };
    const subscriber = buildPartitionCdcPropagationSubscriber({
      tableName: TABLES.NODES,
      partitionId: PARTITION_ID,
      replicaId: REPLICA_ID,
      preferredService: null,
      resolveOperationalMessageGroupSelection: () => ({
        service: selectedService,
        ...READY_READINESS,
      }),
      resolveOperationalMessageGroupSelectionAsync: async () => ({
        service: selectedService,
        ...READY_READINESS,
      }),
      buildMessageGroupOwnerNotReadyError: buildOwnerNotReadyError,
      propagatePartitionCDCEvent: async (messageGroupService, events) => {
        propagatedMessageGroupService = messageGroupService;
        propagatedEvent = events;
      },
    });

    assert.deepEqual(
      subscriber.canAcceptCDCEvent(CDC_EVENT),
      READY_READINESS,
      'subscriber should report ready when the current operational ingress is ready',
    );

    await subscriber(CDC_EVENTS);

    t.equal(
      propagatedMessageGroupService,
      selectedService,
      'subscriber should propagate through the current operational ingress',
    );
    t.equal(
      propagatedEvent,
      CDC_EVENTS,
      'subscriber should hand the original vector to propagation unchanged',
    );
  },
);

test(
  'buildPartitionCdcPropagationSubscriber preserves before and after propagation hooks',
  async (t) => {
    const observedSteps = [];
    const selectedService = {
      canAcceptCDCEvent() {
        return READY_READINESS;
      },
    };
    const subscriber = buildPartitionCdcPropagationSubscriber({
      tableName: TABLES.NODES,
      partitionId: PARTITION_ID,
      replicaId: REPLICA_ID,
      preferredService: selectedService,
      resolveOperationalMessageGroupSelection: () => ({
        service: selectedService,
        ...READY_READINESS,
      }),
      resolveOperationalMessageGroupSelectionAsync: async () => ({
        service: selectedService,
        ...READY_READINESS,
      }),
      buildMessageGroupOwnerNotReadyError: buildOwnerNotReadyError,
      beforePropagation: async () => {
        observedSteps.push('before');
      },
      propagatePartitionCDCEvent: async () => {
        observedSteps.push('propagate');
      },
      afterPropagation: async () => {
        observedSteps.push('after');
      },
    });

    await subscriber(CDC_EVENTS);

    t.same(
      observedSteps,
      ['before', 'propagate', 'after'],
      'subscriber should preserve lifecycle hook ordering around propagation',
    );
  },
);

// --- the vector contract (quest cdc-obligation-range-shipping) ---

const readyService = Object.freeze({canAcceptCDCEvent: () => READY_READINESS});
const nodeEvent = (nodeId, extra = {}) => ({tableName: TABLES.NODES, operation: 'UPSERT',
  data: {node_id: nodeId}, ...extra});
const durable = (event, key) => ({...event, eventKey: key, entryId: key,
  sourcePartition: PARTITION_ID, sourceLogIndex: 3, sourceOrdinal: 0,
  timestamp: new HLCTimestamp(1000, 0, 'source-node').toString()});

function vectorSubscriber(observed, extra = {}) {
  return buildPartitionCdcPropagationSubscriber({
    tableName: TABLES.NODES,
    partitionId: PARTITION_ID,
    replicaId: REPLICA_ID,
    preferredService: readyService,
    logger: {debug: (message, fields) => observed.logged.push({message, fields})},
    eventLogMessage: 'vector-member',
    resolveOperationalMessageGroupSelection: () => ({service: readyService, ...READY_READINESS}),
    resolveOperationalMessageGroupSelectionAsync: async () =>
      ({service: readyService, ...READY_READINESS}),
    buildMessageGroupOwnerNotReadyError: buildOwnerNotReadyError,
    beforePropagation: async (events) => observed.before.push(events),
    propagatePartitionCDCEvent: async (_service, events) => {
      observed.propagated.push(events);
    },
    afterPropagation: async (events) => observed.after.push(events),
    ...extra,
  });
}

const emptyObservation = () => ({before: [], propagated: [], after: [], logged: []});

test(
  'buildPartitionCdcPropagationSubscriber hands a three-member vector to the hooks and to ' +
  'propagation once each, unchanged, and logs every member',
  async (t) => {
    const observed = emptyObservation();
    const events = Object.freeze(['node-1', 'node-2', 'node-1'].map((id) => nodeEvent(id)));
    await vectorSubscriber(observed)(events);
    t.equal(observed.before.length, 1, 'beforePropagation runs once per vector');
    t.equal(observed.before[0], events, 'beforePropagation takes the vector');
    t.equal(observed.propagated.length, 1, 'one propagation for the whole vector');
    t.equal(observed.propagated[0], events, 'propagation takes the vector, in order');
    t.equal(observed.after.length, 1, 'afterPropagation runs once per vector');
    t.equal(observed.after[0], events, 'afterPropagation takes the vector');
    t.same(observed.logged.map((entry) => entry.message),
      ['vector-member', 'vector-member', 'vector-member'], 'every member is logged');
  },
);

test(
  'buildPartitionCdcPropagationSubscriber applies its table guard to every member: an ' +
  'ordinary vector of another table is not propagated, a durable member of another table ' +
  'and a vector mixing tables are refused',
  async (t) => {
    const observed = emptyObservation();
    const subscriber = vectorSubscriber(observed);
    const foreign = {tableName: TABLES.SERVICES, operation: 'UPSERT', data: {service_id: 's'}};

    t.equal(await subscriber(Object.freeze([foreign, foreign])), undefined,
      'an ordinary vector of another table is not this subscriber\'s');
    t.equal(observed.propagated.length, 0);

    for (const vector of [
      [durable(nodeEvent('node-1'), 'k1'), durable(foreign, 'k2')],
      [durable(nodeEvent('node-1'), 'k1'), durable(nodeEvent('node-2'), 'k2'),
        durable(foreign, 'k3')],
      [durable(foreign, 'k1')],
      [nodeEvent('node-1'), foreign],
      [foreign, nodeEvent('node-1')],
    ]) {
      await assert.rejects(() => subscriber(Object.freeze(vector)),
        {code: CDC_COMPLETION.INVALID});
    }
    t.equal(observed.before.length, 0, 'a refused vector reaches no hook');
    t.equal(observed.propagated.length, 0, 'a refused vector is never propagated');
  },
);

test(
  'buildPartitionCdcPropagationSubscriber asks the selected ingress with the first member ' +
  'of the vector',
  async (t) => {
    const asked = [];
    const service = {canAcceptCDCEvent: (event) => {
      asked.push(event);
      return READY_READINESS;
    }};
    const observed = emptyObservation();
    const events = Object.freeze([nodeEvent('node-1'), nodeEvent('node-2')]);
    await vectorSubscriber(observed, {
      preferredService: service,
      resolveOperationalMessageGroupSelection: () => ({service, ...READY_READINESS}),
      resolveOperationalMessageGroupSelectionAsync: async () => ({service, ...READY_READINESS}),
    })(events);
    t.same(asked, [events[0]], 'readiness is one question per vector, about its first member');
    t.equal(observed.propagated.length, 1);
  },
);

import assert from 'node:assert/strict';

import {TABLES} from '../../src/constants/index.js';
import {test} from '../../src/test-helpers/tap.js';
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
      () => subscriber(CDC_EVENT),
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
      propagatePartitionCDCEvent: async (messageGroupService, cdcEvent) => {
        propagatedMessageGroupService = messageGroupService;
        propagatedEvent = cdcEvent;
      },
    });

    assert.deepEqual(
      subscriber.canAcceptCDCEvent(CDC_EVENT),
      READY_READINESS,
      'subscriber should report ready when the current operational ingress is ready',
    );

    await subscriber(CDC_EVENT);

    t.equal(
      propagatedMessageGroupService,
      selectedService,
      'subscriber should propagate through the current operational ingress',
    );
    t.same(
      propagatedEvent,
      CDC_EVENT,
      'subscriber should preserve the original CDC event during propagation',
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

    await subscriber(CDC_EVENT);

    t.same(
      observedSteps,
      ['before', 'propagate', 'after'],
      'subscriber should preserve lifecycle hook ordering around propagation',
    );
  },
);

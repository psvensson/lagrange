import {test} from '../../src/test-helpers/tap.js';
import {CDC_INTEGRATION_SERVICE_SHARED} from
  '../../src/cdc/cdc-integration-service-shared.js';

// Falsifier for the participant-detail instrumentation: the distributed-write
// coordinator computes which participant's ack is missing on a
// DISTRIBUTED_PARTICIPANT_FAILURE, buildSystemTableMutationError copies it onto
// the thrown error, and logSystemTableWriteFailure must surface it on the failure
// log row. Without it, the wedged membership-publication UPSERT (and every other
// DPF write) logs "participant failures" with no node/address — leaving the
// ghost-retirement (lever 1) vs quorum-tolerance (lever 2) decision unanswerable
// from preserved gate logs. Red-on-revert of the cdc-integration-service-shared
// log-payload change.

const {
  buildSystemTableMutationError,
  logSystemTableWriteFailure,
} = CDC_INTEGRATION_SERVICE_SHARED;

function buildCapturingService() {
  const logged = [];
  return {
    service: {
      nodeId: 'writer-node',
      bootstrapMode: false,
      writeRouter: null,
      logger: {
        warn: (msg, payload) => logged.push({level: 'warn', msg, payload}),
        error: (msg, payload) => logged.push({level: 'error', msg, payload}),
        debug: () => {},
        info: () => {},
      },
    },
    logged,
  };
}

test('participant failure detail surfaces on the system-table write-failure log', (t) => {
  const coordinatorResult = {
    success: false,
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    error: 'Distributed operation failed due to participant failures',
    participantFailures: [
      {
        partitionId: 'control_plane_publications-p1',
        participantNodeId: 'ghost-node-r4',
        participantAddress: 'control_plane_publications-p1-r4',
        errorCode: 'NODE_NOT_READY',
        error: 'Target node ghost-node-r4 is not ready for dispatch',
      },
      {
        partitionId: 'control_plane_publications-p1',
        participantNodeId: 'slow-rejoiner',
        participantAddress: 'control_plane_publications-p1-r3',
        errorCode: 'QUERY_TIMEOUT',
        error: 'Query timeout',
      },
    ],
    firstFailedParticipant: {
      partitionId: 'control_plane_publications-p1',
      participantNodeId: 'ghost-node-r4',
      participantAddress: 'control_plane_publications-p1-r4',
      errorCode: 'NODE_NOT_READY',
    },
  };

  const error = buildSystemTableMutationError(
    coordinatorResult,
    'Failed to upsert system table row',
  );
  // Guards the existing error-copy contract the log relies on.
  t.equal(
    error.firstFailedParticipant?.participantNodeId,
    'ghost-node-r4',
    'error carries firstFailedParticipant from the coordinator result',
  );
  t.equal(
    Array.isArray(error.participantFailures) ?
      error.participantFailures.length :
      0,
    2,
    'error carries the full participantFailures list',
  );

  const {service, logged} = buildCapturingService();
  logSystemTableWriteFailure(
    service,
    'Failed to upsert system table row',
    {
      tableName: 'control_plane_publications',
      id: 'membership-publication:5',
      operation: 'UPSERT',
      primaryKey: {publication_id: 'membership-publication:5'},
    },
    error,
  );

  t.equal(logged.length, 1, 'exactly one failure log row is emitted');
  const {payload} = logged[0];

  // The instrumentation under test: the missing-ack participant must be visible.
  t.equal(
    payload.firstFailedParticipant?.participantNodeId,
    'ghost-node-r4',
    'log payload names the first failed participant node',
  );
  t.equal(
    payload.firstFailedParticipant?.participantAddress,
    'control_plane_publications-p1-r4',
    'log payload names the first failed participant address',
  );
  t.equal(
    payload.participantFailureCount,
    2,
    'log payload reports the participant failure count',
  );
  t.same(
    payload.failedParticipantNodeIds,
    ['ghost-node-r4', 'slow-rejoiner'],
    'log payload lists every failed participant node id',
  );

  t.end();
});

test('write-failure log omits participant fields when none are present', (t) => {
  const error = buildSystemTableMutationError(
    {
      success: false,
      errorCode: 'CACHE_VISIBILITY_TIMEOUT',
      error: 'cache wait timed out',
    },
    'Failed to upsert system table row',
  );

  const {service, logged} = buildCapturingService();
  logSystemTableWriteFailure(
    service,
    'Failed to upsert system table row',
    {tableName: 'config', id: 'x', operation: 'UPSERT'},
    error,
  );

  t.equal(logged.length, 1, 'one failure log row');
  const {payload} = logged[0];
  t.equal(
    'firstFailedParticipant' in payload,
    false,
    'no firstFailedParticipant field for a non-distributed failure',
  );
  t.equal(
    'failedParticipantNodeIds' in payload,
    false,
    'no failedParticipantNodeIds field for a non-distributed failure',
  );
  t.end();
});

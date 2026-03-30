import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CUTOVER_GUARD_FILE = Object.freeze({
  BOOTSTRAP_SERVICE: 'src/bootstrap/bootstrap-service.js',
  NODE_JOINING_SERVICE: 'src/bootstrap/node-joining-service.js',
  ADMIN_WEBSOCKET_API: 'src/admin/admin-websocket-api.js',
  CREATE_MESSAGE_GROUP_PHASE:
    'src/bootstrap/phases/create-message-group-phase.js',
  JOIN_MESSAGE_GROUP_RUNTIME_OWNER:
    'src/bootstrap/owners/join-message-group-runtime-owner.js',
  SEED_MESSAGE_GROUPS_PHASE:
    'src/bootstrap/phases/seed-message-groups-phase.js',
  SEED_PARTITIONS_PHASE:
    'src/bootstrap/phases/seed-partitions-phase.js',
});

const CUTOVER_GUARD_METHOD = Object.freeze({
  BOOTSTRAP_MESSAGE_GROUPS: 'async phaseMessageGroups() {',
  BOOTSTRAP_PARTITIONS: 'async phasePartitions() {',
  JOIN_SELF_HOSTED:
    'async phaseCreateSelfHostedMessageGroup(assignment) {',
  JOIN_EXISTING:
    'async phaseJoinExistingMessageGroup(assignment) {',
  ADMIN_HANDLE_MESSAGE: 'handleMessage(clientInfo, data) {',
  ADMIN_HANDLE_DISPATCHABLE: 'async handleDispatchableAdminMessage(clientInfo, message) {',
});

const CUTOVER_GUARD_PATTERN = Object.freeze({
  NEW_MESSAGE_GROUP_SERVICE: 'new MessageGroupService(',
  NEW_PARTITION_SERVICE: 'new PartitionService(',
  QUEUE_BOOTSTRAP_REPLICA: 'queueBootstrapServiceReplica(',
  TRIGGER_BOOTSTRAP_RECONCILER: 'triggerBootstrapReconciler(',
  QUEUE_JOIN_REPLICA: 'queueJoinServiceReplica(',
  TRIGGER_JOIN_RECONCILER: 'triggerJoinReconciler(',
  START_ELECTION: '.startElection(',
  IF_SERVICE_DISPATCHER: 'if (this.serviceDispatcher',
  HANDLE_DISPATCHABLE_MESSAGE: 'this.handleDispatchableAdminMessage(',
  HANDLE_QUERY_MESSAGE: 'this.handleQueryMessage(',
  HANDLE_PARTITION_CALLBACK_MESSAGE: 'this.handlePartitionCallbackMessage(',
  HANDLE_REFRESH_MESSAGE: 'this.handleRefreshMessage(',
});

function readFile(path) {
  return fs.readFileSync(path, 'utf8');
}

function extractMethodBody(source, signature) {
  const signatureIndex = source.indexOf(signature);
  assert.notEqual(
    signatureIndex,
    -1,
    `method signature not found: ${signature}`,
  );
  const bodyStart = source.indexOf('{', signatureIndex);
  assert.notEqual(bodyStart, -1, `method body start not found: ${signature}`);

  let depth = 1;
  for (let cursor = bodyStart + 1; cursor < source.length; cursor++) {
    const char = source[cursor];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart + 1, cursor);
      }
    }
  }

  throw new Error(`method body end not found: ${signature}`);
}

describe('Unified service lifecycle hard-cutover guardrails', () => {
  it('keeps bootstrap phase entrypoints free of direct service startup', () => {
    const messageGroupSource = readFile(
      CUTOVER_GUARD_FILE.SEED_MESSAGE_GROUPS_PHASE,
    );
    const partitionSource = readFile(
      CUTOVER_GUARD_FILE.SEED_PARTITIONS_PHASE,
    );
    const messageGroupPhaseBody = extractMethodBody(
      messageGroupSource,
      CUTOVER_GUARD_METHOD.BOOTSTRAP_MESSAGE_GROUPS,
    );
    const partitionPhaseBody = extractMethodBody(
      partitionSource,
      CUTOVER_GUARD_METHOD.BOOTSTRAP_PARTITIONS,
    );

    assert.equal(
      messageGroupPhaseBody.includes(
        CUTOVER_GUARD_PATTERN.NEW_MESSAGE_GROUP_SERVICE,
      ),
      false,
    );
    assert.equal(
      partitionPhaseBody.includes(CUTOVER_GUARD_PATTERN.NEW_PARTITION_SERVICE),
      false,
    );
    assert.equal(
      messageGroupPhaseBody.includes(
        CUTOVER_GUARD_PATTERN.QUEUE_BOOTSTRAP_REPLICA,
      ),
      true,
    );
    assert.equal(
      messageGroupPhaseBody.includes(
        CUTOVER_GUARD_PATTERN.TRIGGER_BOOTSTRAP_RECONCILER,
      ),
      true,
    );
    assert.equal(
      partitionPhaseBody.includes(
        CUTOVER_GUARD_PATTERN.QUEUE_BOOTSTRAP_REPLICA,
      ),
      true,
    );
    assert.equal(
      partitionPhaseBody.includes(
        CUTOVER_GUARD_PATTERN.TRIGGER_BOOTSTRAP_RECONCILER,
      ),
      true,
    );
    assert.equal(
      messageGroupPhaseBody.includes(CUTOVER_GUARD_PATTERN.START_ELECTION),
      false,
    );
    assert.equal(
      partitionPhaseBody.includes(CUTOVER_GUARD_PATTERN.START_ELECTION),
      false,
    );
  });

  it('keeps join phase entrypoints free of direct message-group startup', () => {
    const selfHostedSource = readFile(
      CUTOVER_GUARD_FILE.CREATE_MESSAGE_GROUP_PHASE,
    );
    const joinExistingSource = readFile(
      CUTOVER_GUARD_FILE.JOIN_MESSAGE_GROUP_RUNTIME_OWNER,
    );
    const selfHostedBody = extractMethodBody(
      selfHostedSource,
      CUTOVER_GUARD_METHOD.JOIN_SELF_HOSTED,
    );
    const joinExistingBody = extractMethodBody(
      joinExistingSource,
      CUTOVER_GUARD_METHOD.JOIN_EXISTING,
    );

    assert.equal(
      selfHostedBody.includes(CUTOVER_GUARD_PATTERN.NEW_MESSAGE_GROUP_SERVICE),
      false,
    );
    assert.equal(
      joinExistingBody.includes(CUTOVER_GUARD_PATTERN.NEW_MESSAGE_GROUP_SERVICE),
      false,
    );
    assert.equal(
      selfHostedBody.includes(CUTOVER_GUARD_PATTERN.QUEUE_JOIN_REPLICA),
      true,
    );
    assert.equal(
      selfHostedBody.includes(CUTOVER_GUARD_PATTERN.TRIGGER_JOIN_RECONCILER),
      true,
    );
    assert.equal(
      joinExistingBody.includes(CUTOVER_GUARD_PATTERN.QUEUE_JOIN_REPLICA),
      true,
    );
    assert.equal(
      joinExistingBody.includes(CUTOVER_GUARD_PATTERN.TRIGGER_JOIN_RECONCILER),
      true,
    );
    assert.equal(
      selfHostedBody.includes(CUTOVER_GUARD_PATTERN.START_ELECTION),
      false,
    );
    assert.equal(
      joinExistingBody.includes(CUTOVER_GUARD_PATTERN.START_ELECTION),
      false,
    );
  });

  it('keeps admin ingress on one dispatchable translation path', () => {
    const adminSource = readFile(CUTOVER_GUARD_FILE.ADMIN_WEBSOCKET_API);
    const handleMessageBody = extractMethodBody(
      adminSource,
      CUTOVER_GUARD_METHOD.ADMIN_HANDLE_MESSAGE,
    );
    const handleDispatchableBody = extractMethodBody(
      adminSource,
      CUTOVER_GUARD_METHOD.ADMIN_HANDLE_DISPATCHABLE,
    );

    assert.equal(
      handleMessageBody.includes(CUTOVER_GUARD_PATTERN.IF_SERVICE_DISPATCHER),
      false,
    );
    assert.equal(
      handleDispatchableBody.includes(
        CUTOVER_GUARD_PATTERN.IF_SERVICE_DISPATCHER,
      ),
      false,
    );

    assert.equal(
      handleMessageBody.includes(
        CUTOVER_GUARD_PATTERN.HANDLE_DISPATCHABLE_MESSAGE,
      ),
      true,
    );
    assert.equal(
      handleMessageBody.includes(CUTOVER_GUARD_PATTERN.HANDLE_QUERY_MESSAGE),
      false,
    );
    assert.equal(
      handleMessageBody.includes(
        CUTOVER_GUARD_PATTERN.HANDLE_PARTITION_CALLBACK_MESSAGE,
      ),
      false,
    );
    assert.equal(
      handleMessageBody.includes(CUTOVER_GUARD_PATTERN.HANDLE_REFRESH_MESSAGE),
      false,
    );
    assert.equal(
      handleDispatchableBody.includes(CUTOVER_GUARD_PATTERN.HANDLE_QUERY_MESSAGE),
      false,
    );
    assert.equal(
      handleDispatchableBody.includes(
        CUTOVER_GUARD_PATTERN.HANDLE_PARTITION_CALLBACK_MESSAGE,
      ),
      false,
    );
    assert.equal(
      handleDispatchableBody.includes(
        CUTOVER_GUARD_PATTERN.HANDLE_REFRESH_MESSAGE,
      ),
      false,
    );
  });
});

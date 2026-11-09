/**
 * Witness for Quest state-read-named-defaults (round 3, lead ruling b): the
 * canonical services row built for /register-service and for the
 * MOVE_REPLICA rollback (move-replica-handoff-owner.js
 * restoreRegisteredServiceRowAfterFailedHandoff rebuilds the stored row
 * through buildRegisteredServiceMutationRow) carries the raft_role it is
 * given. services.raft_role is nullable: a stored NULL is restored as NULL.
 * HEAD healed it to 'follower' (`|| RAFT_ROLE.FOLLOWER`), a silent default
 * that made a role-less row look like a spread-visible follower.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {COLUMN, SERVICE_STATUS} from '../../src/constants/index.js';
import {installBootstrapApiRegistrationMethods} from
  '../../src/bootstrap/bootstrap-api-registration-methods.js';

function createRowBuilder() {
  class RowBuilder {}
  installBootstrapApiRegistrationMethods(RowBuilder);
  return new RowBuilder();
}

function storedServiceRow(overrides = {}) {
  return {
    [COLUMN.SERVICE_ID]: 'svc-rollback',
    [COLUMN.SERVICE_TYPE]: 'partition',
    [COLUMN.NODE_ID]: 'node-a',
    [COLUMN.PARTITION_ID]: 'users-p0',
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CREATED_AT]: 1,
    [COLUMN.UPDATED_AT]: 2,
    ...overrides,
  };
}

test('a rollback restores a stored NULL raft_role as NULL, never as follower', () => {
  const builder = createRowBuilder();
  const restored = builder.buildRegisteredServiceMutationRow(
    storedServiceRow({[COLUMN.RAFT_ROLE]: null}));
  assert.equal(restored[COLUMN.RAFT_ROLE], null);
  assert.equal(restored[COLUMN.STATUS], SERVICE_STATUS.ACTIVE);
});

test('a stated raft_role and status are restored as stored', () => {
  const builder = createRowBuilder();
  const restored = builder.buildRegisteredServiceMutationRow(
    storedServiceRow({[COLUMN.RAFT_ROLE]: 'leader', [COLUMN.STATUS]: 'stopped'}));
  assert.equal(restored[COLUMN.RAFT_ROLE], 'leader');
  assert.equal(restored[COLUMN.STATUS], 'stopped');
});

test('a registration that states no status is born ACTIVE', () => {
  const builder = createRowBuilder();
  const row = builder.buildRegisteredServiceMutationRow(
    storedServiceRow({[COLUMN.STATUS]: undefined, [COLUMN.RAFT_ROLE]: 'follower'}));
  assert.equal(row[COLUMN.STATUS], SERVICE_STATUS.ACTIVE);
});

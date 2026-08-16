/**
 * Absence-proven services-row heal for message-group replicas.
 *
 * Serve-eligibility requires an ACTIVE addressed MESSAGE_GROUP services
 * row; the registration write of that row is a one-shot direct write
 * outside raft, and when it misses the durable db every later status
 * UPDATE zero-row no-ops with no CDC, so the cached mg row never leaves
 * stopped and the node is wedged out of serve-eligibility permanently
 * (round-11 attribution, runs 06-27-35/06-31-11/07-07-37/07-39-14 on
 * 2026-08-16 — the partition-owner heal alone did not cover this owner).
 * Same contract as the partition owner: a zero affected-row count on the
 * primary-key-pinned WHERE proves durable absence and re-issues the
 * canonical registration upsert; matched or unwitnessed counts keep the
 * update-only contract.
 */
import {
  MessageGroupServiceRowOwner,
} from '../../src/message-group/message-group-service-row-owner.js';
import {
  runRowAbsenceHealScenarios,
} from '../test-helpers/row-absence-heal-scenarios.js';

const REPLICA_OPTIONS = Object.freeze({
  groupId: 'mg-1',
  replicaId: 'mg-1-r1',
  nodeId: 'node-a',
  service: {isLeaderReplica: () => false},
});

runRowAbsenceHealScenarios({
  OwnerClass: MessageGroupServiceRowOwner,
  replicaOptions: REPLICA_OPTIONS,
  ownerLabel: 'message-group',
  assertHealedRow(t, upsert, row) {
    t.equal(upsert.row.service_id, 'mg-1-r1');
    t.equal(upsert.row.service_type, 'message_group');
    t.equal(upsert.row.status, 'active',
      'the healed row carries the intended status');
    t.equal(upsert.row.created_at, 1234,
      'the healed row is the full canonical registration shape');
    t.equal(row.status, 'active', 'activation still projects active status');
  },
});

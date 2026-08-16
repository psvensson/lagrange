/**
 * Absence-proven services-row heal on zero-row status updates.
 *
 * The bootstrap registration write of a system replica's services row is a
 * one-shot direct write outside raft; when it misses a replica db, every
 * later writer is a plain UPDATE that zero-row no-ops, a zero-change
 * UPDATE emits no CDC, and the cached row never leaves stopped — wedging
 * serve-eligibility permanently (round-11 attribution: local lone-seed
 * phase-1 routable-partition timeouts, the 43-row "No row found for CDC
 * update" wave in archived runs 06-27-35/06-31-11/07-07-37 on
 * 2026-08-16). An UPDATE whose primary-key-pinned WHERE matched zero rows
 * is proof of durable absence: the owner already holds the full canonical
 * row, so it re-issues the registration upsert instead of leaving the
 * divergence permanent. A matched update (affectedRows >= 1) and an
 * unwitnessed count (affectedRows absent) keep the update-only contract.
 */
import {
  PartitionServiceRowOwner,
} from '../../src/partition/partition-service-row-owner.js';
import {
  runRowAbsenceHealScenarios,
} from '../test-helpers/row-absence-heal-scenarios.js';

const REPLICA_OPTIONS = Object.freeze({
  partitionId: 'services-p1',
  replicaId: 'mg-1-r1',
  nodeId: 'node-a',
  service: {isLeaderReplica: () => false},
});

runRowAbsenceHealScenarios({
  OwnerClass: PartitionServiceRowOwner,
  replicaOptions: REPLICA_OPTIONS,
  ownerLabel: 'partition',
  assertHealedRow(t, upsert, row) {
    t.equal(upsert.tableName, 'services');
    t.equal(upsert.row.service_id, 'mg-1-r1');
    t.equal(upsert.row.status, 'active',
      'the healed row carries the intended status');
    t.equal(upsert.row.created_at, 1234,
      'the healed row is the full canonical registration shape');
    t.equal(row.status, 'active', 'activation still projects active status');
  },
});

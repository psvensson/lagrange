import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMISSION_DECISION,
  ADMISSION_REASON,
  PRESSURE_STATE,
  RESERVATION_STATUS,
  STORAGE_BUDGET_CONFIG_KEY,
  STORAGE_BUDGET_SOURCE,
  STORAGE_BUDGET_VALIDATION,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  STORAGE_CAPACITY_ERROR_MSG,
  STORAGE_CAPACITY_LOG_MSG,
  STORAGE_CAPACITY_SUBSYSTEM,
  STORAGE_PLACEMENT_CONSTRAINT,
  STORAGE_PLACEMENT_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {NUM} from '../../src/constants/index.js';

test('storage capacity constants', async (t) => {
  await t.test('STORAGE_BUDGET_CONFIG_KEY references CONFIG_KEY', () => {
    assert.equal(
      STORAGE_BUDGET_CONFIG_KEY.BUDGET_BYTES,
      CONFIG_KEY.NODE_STORAGE_BUDGET_BYTES,
    );
    assert.equal(
      STORAGE_BUDGET_CONFIG_KEY.BUDGET_RATIO,
      CONFIG_KEY.NODE_STORAGE_BUDGET_RATIO,
    );
  });

  await t.test('STORAGE_BUDGET_SOURCE has expected values', () => {
    assert.equal(STORAGE_BUDGET_SOURCE.ABSOLUTE, 'absolute');
    assert.equal(STORAGE_BUDGET_SOURCE.RATIO, 'ratio');
    assert.equal(STORAGE_BUDGET_SOURCE.BACKFILL, 'backfill');
  });

  await t.test('STORAGE_BUDGET_VALIDATION has valid bounds', () => {
    assert.equal(
      STORAGE_BUDGET_VALIDATION.MIN_BUDGET_BYTES,
      NUM.BYTES_PER_MIB,
    );
    assert.ok(STORAGE_BUDGET_VALIDATION.MIN_RATIO > 0);
    assert.ok(STORAGE_BUDGET_VALIDATION.MAX_RATIO <= 1.0);
    assert.ok(
      STORAGE_BUDGET_VALIDATION.MIN_RATIO <
        STORAGE_BUDGET_VALIDATION.MAX_RATIO,
    );
  });

  await t.test('STORAGE_CAPACITY_CONFIG_KEY references CONFIG_KEY', () => {
    assert.equal(
      STORAGE_CAPACITY_CONFIG_KEY.SOFT_PRESSURE_PERCENT,
      CONFIG_KEY.REBALANCER_STORAGE_SOFT_PRESSURE_PERCENT,
    );
    assert.equal(
      STORAGE_CAPACITY_CONFIG_KEY.HARD_PRESSURE_PERCENT,
      CONFIG_KEY.REBALANCER_STORAGE_HARD_PRESSURE_PERCENT,
    );
    assert.equal(
      STORAGE_CAPACITY_CONFIG_KEY.RESERVATION_TTL_MS,
      CONFIG_KEY.REBALANCER_STORAGE_RESERVATION_TTL_MS,
    );
    assert.equal(
      STORAGE_CAPACITY_CONFIG_KEY.EMERGENCY_HEADROOM_PERCENT,
      CONFIG_KEY.REBALANCER_STORAGE_EMERGENCY_HEADROOM_PERCENT,
    );
    assert.equal(
      STORAGE_CAPACITY_CONFIG_KEY.MINIMUM_REPLICA_BYTES,
      CONFIG_KEY.REBALANCER_MINIMUM_REPLICA_BYTES,
    );
    assert.equal(
      STORAGE_CAPACITY_CONFIG_KEY.SPLIT_AMPLIFICATION_FACTOR,
      CONFIG_KEY.REBALANCER_SPLIT_AMPLIFICATION_FACTOR,
    );
    assert.equal(
      STORAGE_CAPACITY_CONFIG_KEY.PARTITION_REPLICA_OVERHEAD_BYTES,
      CONFIG_KEY.REBALANCER_PARTITION_REPLICA_OVERHEAD_BYTES,
    );
    assert.equal(
      STORAGE_CAPACITY_CONFIG_KEY.MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES,
      CONFIG_KEY.REBALANCER_MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES,
    );
    assert.equal(
      STORAGE_CAPACITY_CONFIG_KEY.SERVICE_REPLICA_OVERHEAD_BYTES,
      CONFIG_KEY.REBALANCER_SERVICE_REPLICA_OVERHEAD_BYTES,
    );
  });

  await t.test('STORAGE_CAPACITY_DEFAULT has sensible thresholds', () => {
    assert.ok(
      STORAGE_CAPACITY_DEFAULT.SOFT_PRESSURE_PERCENT <
        STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT,
      'soft threshold must be below hard threshold',
    );
    assert.ok(
      STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT <= NUM.HUNDRED,
    );
    assert.ok(STORAGE_CAPACITY_DEFAULT.RESERVATION_TTL_MS > 0);
    assert.ok(
      STORAGE_CAPACITY_DEFAULT.EMERGENCY_HEADROOM_PERCENT >= 0,
    );
    assert.ok(STORAGE_CAPACITY_DEFAULT.MINIMUM_REPLICA_BYTES > 0);
    assert.ok(
      STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR >= 1,
    );
    assert.ok(
      STORAGE_CAPACITY_DEFAULT.PARTITION_REPLICA_OVERHEAD_BYTES >= 0,
    );
    assert.ok(
      STORAGE_CAPACITY_DEFAULT.MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES >=
        0,
    );
    assert.ok(
      STORAGE_CAPACITY_DEFAULT.SERVICE_REPLICA_OVERHEAD_BYTES >= 0,
    );
  });

  await t.test('PRESSURE_STATE has four ordered states', () => {
    assert.equal(PRESSURE_STATE.NORMAL, 'normal');
    assert.equal(PRESSURE_STATE.SOFT, 'soft');
    assert.equal(PRESSURE_STATE.HARD, 'hard');
    assert.equal(PRESSURE_STATE.EXHAUSTED, 'exhausted');
    assert.equal(Object.keys(PRESSURE_STATE).length, 4);
  });

  await t.test('ADMISSION_DECISION has allow and deny', () => {
    assert.equal(ADMISSION_DECISION.ALLOW, 'allow');
    assert.equal(ADMISSION_DECISION.DENY, 'deny');
    assert.equal(Object.keys(ADMISSION_DECISION).length, 2);
  });

  await t.test('ADMISSION_REASON covers all decision paths', () => {
    // Allow reasons
    assert.ok(ADMISSION_REASON.CAPACITY_AVAILABLE);
    assert.ok(ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE);
    // Deny reasons
    assert.ok(ADMISSION_REASON.BUDGET_EXCEEDED);
    assert.ok(ADMISSION_REASON.HARD_PRESSURE_EXCEEDED);
    assert.ok(ADMISSION_REASON.EXHAUSTED);
    assert.ok(ADMISSION_REASON.INSUFFICIENT_HEADROOM);
    assert.ok(ADMISSION_REASON.POLICY_MIN_FREE_BYTES_VIOLATED);
    assert.ok(ADMISSION_REASON.POLICY_MAX_UTILIZATION_VIOLATED);
    assert.ok(ADMISSION_REASON.NO_BUDGET_REGISTERED);
    assert.ok(ADMISSION_REASON.ESTIMATION_UNAVAILABLE);
    assert.equal(Object.keys(ADMISSION_REASON).length, 10);
  });

  await t.test('RESERVATION_STATUS has lifecycle values', () => {
    assert.equal(RESERVATION_STATUS.ACTIVE, 'active');
    assert.equal(RESERVATION_STATUS.RELEASED, 'released');
    assert.equal(RESERVATION_STATUS.EXPIRED, 'expired');
    assert.equal(Object.keys(RESERVATION_STATUS).length, 3);
  });

  await t.test('STORAGE_PLACEMENT_CONSTRAINT keys match design', () => {
    assert.equal(
      STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE,
      'minFreeBytesPerNode',
    );
    assert.equal(
      STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT,
      'maxBudgetUtilizationPercent',
    );
    assert.equal(
      STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM,
      'reserveEmergencyHeadroom',
    );
  });

  await t.test('STORAGE_PLACEMENT_DEFAULT has safe defaults', () => {
    assert.equal(
      STORAGE_PLACEMENT_DEFAULT.MIN_FREE_BYTES_PER_NODE,
      NUM.ZERO,
    );
    assert.equal(
      STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
      NUM.HUNDRED,
    );
    assert.equal(
      STORAGE_PLACEMENT_DEFAULT.RESERVE_EMERGENCY_HEADROOM,
      false,
    );
  });

  await t.test('STORAGE_CAPACITY_SUBSYSTEM is a string', () => {
    assert.equal(STORAGE_CAPACITY_SUBSYSTEM, 'storage-capacity');
  });

  await t.test('log and error message objects are frozen', () => {
    assert.ok(Object.isFrozen(STORAGE_CAPACITY_LOG_MSG));
    assert.ok(Object.isFrozen(STORAGE_CAPACITY_ERROR_MSG));
  });

  await t.test('all exported objects are frozen', () => {
    assert.ok(Object.isFrozen(ADMISSION_DECISION));
    assert.ok(Object.isFrozen(ADMISSION_REASON));
    assert.ok(Object.isFrozen(PRESSURE_STATE));
    assert.ok(Object.isFrozen(RESERVATION_STATUS));
    assert.ok(Object.isFrozen(STORAGE_BUDGET_CONFIG_KEY));
    assert.ok(Object.isFrozen(STORAGE_BUDGET_SOURCE));
    assert.ok(Object.isFrozen(STORAGE_BUDGET_VALIDATION));
    assert.ok(Object.isFrozen(STORAGE_CAPACITY_CONFIG_KEY));
    assert.ok(Object.isFrozen(STORAGE_CAPACITY_DEFAULT));
    assert.ok(Object.isFrozen(STORAGE_PLACEMENT_CONSTRAINT));
    assert.ok(Object.isFrozen(STORAGE_PLACEMENT_DEFAULT));
  });
});

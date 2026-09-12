import {createHash} from 'node:crypto';

import {OLTP_OPERATION_KIND} from './oltp-baseline-workload.js';
import {OLTP_PAIRED_RETRY_POLICY} from './oltp-paired-retry-owner.js';

const PROFILE_ID = 'scenario-a-semantic-v1';

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeRecord(child);
  return Object.freeze(value);
}

const SEMANTIC_PROFILE = freezeRecord({
  id: PROFILE_ID,
  scenario: 'tidb-oltp-baseline',
  scope: 'externally-observable-transaction-contract',
  retryPolicyId: OLTP_PAIRED_RETRY_POLICY.id,
  isolation: {
    serializableIsolationRequired: false,
    dirtyReadsForbidden: true,
    readYourOwnWritesRequired: true,
    atomicCommitRequired: true,
    successfulCommitDurable: true,
    successfulEffectsExactlyOnce: true,
    lostSuccessfulWriteForbidden: true,
    productSpecificLockingMechanismRequired: false,
  },
  outcomes: {
    success: 'committed',
    retryableConflict: 'serialization_conflict',
    retryableConflictSqlState: '40001',
    terminalFailure: 'terminal_failure',
    ambiguousCommit: 'terminal_failure',
    disconnectBeforeUnambiguousCommit: 'terminal_failure',
  },
  timeout: {
    benchmarkDeadlineMode: 'none-v1',
    timeoutMs: null,
    transportTimeoutOutcome: 'terminal_failure',
    sloViolationIsFailure: false,
  },
  forbiddenAnomalies: [
    'dirty_read',
    'partial_commit',
    'lost_successful_write',
    'duplicate_success_effect',
    'read_only_transaction_mutation',
  ],
  transactionFamilies: {
    [OLTP_OPERATION_KIND.NEW_ORDER]: {
      readOnly: false,
      successInvariants: [
        'district_next_order_id_advances_once',
        'one_order_row_created_for_allocated_order_id',
        'one_new_order_row_created_for_allocated_order_id',
        'one_order_line_created_per_input_line',
        'stock_effects_applied_once_per_input_line',
      ],
    },
    [OLTP_OPERATION_KIND.PAYMENT]: {
      readOnly: false,
      successInvariants: [
        'warehouse_ytd_increases_by_payment_amount',
        'district_ytd_increases_by_payment_amount',
        'customer_balance_decreases_by_payment_amount',
        'customer_payment_counters_advance_once',
        'one_history_row_created_for_logical_payment',
      ],
    },
    [OLTP_OPERATION_KIND.ORDER_STATUS]: {
      readOnly: true,
      successInvariants: [
        'latest_customer_order_is_returned_when_present',
        'returned_lines_belong_to_returned_order',
        'database_state_is_unchanged',
      ],
    },
    [OLTP_OPERATION_KIND.DELIVERY]: {
      readOnly: false,
      successInvariants: [
        'selected_new_order_is_removed_once_per_serviced_district',
        'selected_order_carrier_is_set_once',
        'selected_order_lines_are_marked_delivered',
        'customer_balance_increases_by_selected_line_total',
        'customer_delivery_count_advances_once_per_delivered_order',
      ],
    },
    [OLTP_OPERATION_KIND.STOCK_LEVEL]: {
      readOnly: true,
      successInvariants: [
        'reported_low_stock_count_uses_canonical_recent_order_window',
        'database_state_is_unchanged',
      ],
    },
  },
  failureAtomicity: {
    required: true,
    rule: 'terminal_logical_request_must_not_leave_partial_transaction_effects',
  },
});

function hashScenarioASemanticProfile() {
  return createHash('sha256')
    .update(JSON.stringify(SEMANTIC_PROFILE))
    .digest('hex');
}

export {
  SEMANTIC_PROFILE as OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
};

import {
  OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
} from './oltp-scenario-a-delivery-case.js';
import {
  OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
} from './oltp-scenario-a-durability-case.js';
import {
  OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
} from './oltp-scenario-a-failure-atomicity-case.js';
import {
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
} from './oltp-scenario-a-new-order-contention-case.js';
import {
  OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
} from './oltp-scenario-a-order-status-case.js';
import {
  OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
} from './oltp-scenario-a-payment-case.js';
import {
  OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
} from './oltp-scenario-a-retryable-conflict-case.js';
import {
  OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
} from './oltp-scenario-a-stock-level-case.js';
import {
  OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
} from './oltp-scenario-a-visibility-case.js';

function freezeCase(id, proofIds) {
  return Object.freeze({id, proofIds});
}

const CASES = Object.freeze([
  freezeCase('new-order-contention', OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS),
  freezeCase('visibility', OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS),
  freezeCase('payment', OLTP_SCENARIO_A_PAYMENT_PROOF_IDS),
  freezeCase('order-status', OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS),
  freezeCase('delivery', OLTP_SCENARIO_A_DELIVERY_PROOF_IDS),
  freezeCase('stock-level', OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS),
  freezeCase('failure-atomicity', OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS),
  freezeCase('retryable-conflict', OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS),
  freezeCase('durability', OLTP_SCENARIO_A_DURABILITY_PROOF_IDS),
]);

export {
  CASES as OLTP_SCENARIO_A_PROOF_CASES,
};

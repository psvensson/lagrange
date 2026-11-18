/**
 * Failure-path integration tests — wires BudgetEnforcer,
 * ShuffleBuffer, and BroadcastStore together to verify
 * end-to-end failure scenarios.
 *
 * Scenarios:
 * - Budget exceed during emit/lookup/broadcast terminates
 *   with descriptive error
 *
 * Requirements: 9.1, 9.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  BudgetEnforcer,
} from '../../src/query/budget-enforcer.js';
import {
  BudgetLimitError,
  BUDGET_CATEGORY,
} from '../../src/query/budget-limit-error.js';
import {
  ShuffleBuffer,
} from '../../src/query/emit-primitive.js';
import {
  BroadcastStore,
} from '../../src/query/broadcast-primitive.js';
import {
  GUARDRAIL_ERROR_MSG as ERR,
} from '../../src/query/guardrail-constants.js';
import {
  PRIMITIVE_ERROR_MSG,
} from '../../src/query/distributed/distributed-context-constants.js';
import {
  QB_FIELD,
} from '../../src/wasm-service/query-budget-constants.js';

// -------------------------------------------------------
// Budget exceed during emit terminates operation (9.1, 9.4)
// -------------------------------------------------------

test('budget exceed during emit terminates and returns ' +
  'descriptive error', async (t) => {
  const enforcer = new BudgetEnforcer({
    [QB_FIELD.EMIT_MAX_BYTES]: 10,
  });
  const buffer = new ShuffleBuffer({maxBytes: 10});

  // Emit within budget succeeds
  await buffer.emit('k1', new Uint8Array([1, 2, 3]));
  enforcer.recordEmitBytes(5);
  t.equal(enforcer.isTerminated(), false);

  // Emit that exceeds budget terminates enforcer
  try {
    enforcer.recordEmitBytes(6);
    t.fail('Expected BudgetLimitError');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(err.category, BUDGET_CATEGORY.EMIT_BYTES);
    t.ok(err.message.includes('Emit'));
  }
  t.equal(enforcer.isTerminated(), true);

  // ShuffleBuffer also rejects when its own limit is hit
  try {
    await buffer.emit(
      'k2', new Uint8Array(11),
    );
    t.fail('Expected emit budget error');
  } catch (err) {
    t.equal(
      err.message,
      PRIMITIVE_ERROR_MSG.EMIT_MAX_BYTES_EXCEEDED,
    );
  }
  t.end();
});

// -------------------------------------------------------
// Budget exceed during broadcast terminates (9.1, 9.4)
// -------------------------------------------------------

test('budget exceed during broadcast terminates and ' +
  'returns descriptive error', (t) => {
  const enforcer = new BudgetEnforcer({
    [QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES]: 30,
  });
  // Store allows small payloads but rejects large ones
  const store = new BroadcastStore({maxPayloadBytes: 50});

  // Small broadcast succeeds (24 bytes serialized)
  store.broadcast('r1', {version: 1, data: 'a'});
  enforcer.recordBroadcastBytes(24);
  t.equal(enforcer.isTerminated(), false);

  // Exceeding enforcer budget terminates it
  try {
    enforcer.recordBroadcastBytes(7);
    t.fail('Expected BudgetLimitError');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(
      err.category, BUDGET_CATEGORY.BROADCAST_BYTES,
    );
  }
  t.equal(enforcer.isTerminated(), true);

  // BroadcastStore rejects oversized payload
  t.throws(
    () => store.broadcast('r2', {
      version: 2,
      data: 'x'.repeat(100),
    }),
    {message: PRIMITIVE_ERROR_MSG.BROADCAST_MAX_PAYLOAD_EXCEEDED},
  );
  t.end();
});

// -------------------------------------------------------
// Emit budget + enforcer wired together (9.1, 9.4)
// -------------------------------------------------------

test('emit through ShuffleBuffer with BudgetEnforcer ' +
  'terminates on combined limit', async (t) => {
  const enforcer = new BudgetEnforcer({
    [QB_FIELD.EMIT_MAX_BYTES]: 20,
  });
  const buffer = new ShuffleBuffer({maxBytes: 50});

  // Emit records, tracking bytes in enforcer
  const data1 = new Uint8Array([1, 2, 3, 4, 5]);
  await buffer.emit('k1', data1);
  enforcer.recordEmitBytes(7);

  const data2 = new Uint8Array([6, 7, 8, 9, 10]);
  await buffer.emit('k2', data2);
  enforcer.recordEmitBytes(7);

  t.equal(enforcer.isTerminated(), false);

  // Third emit pushes enforcer over its limit
  const data3 = new Uint8Array([11, 12, 13, 14, 15]);
  await buffer.emit('k3', data3);
  try {
    enforcer.recordEmitBytes(7);
    t.fail('Expected BudgetLimitError');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(err.category, BUDGET_CATEGORY.EMIT_BYTES);
    t.equal(err.limit, 20);
    t.ok(err.usage > 20);
  }

  t.equal(enforcer.isTerminated(), true);

  // Enforcer rejects further recording
  try {
    enforcer.recordEmitBytes(1);
    t.fail('Expected terminated error');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(err.message, ERR.OPERATION_TERMINATED);
  }
  t.end();
});

// -------------------------------------------------------
// Broadcast size cap + enforcer wired together (9.1, 9.4)
// -------------------------------------------------------

test('broadcast store rejects oversized payload and ' +
  'enforcer terminates on budget', (t) => {
  const enforcer = new BudgetEnforcer({
    [QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES]: 50,
  });
  const store = new BroadcastStore({maxPayloadBytes: 50});

  // Small broadcast succeeds
  store.broadcast('ref-a', {version: 1, data: 'ok'});
  enforcer.recordBroadcastBytes(25);
  t.equal(enforcer.isTerminated(), false);

  // Oversized broadcast rejected by store
  try {
    store.broadcast('ref-b', {
      version: 2,
      data: 'x'.repeat(100),
    });
    t.fail('Expected broadcast size error');
  } catch (err) {
    t.equal(
      err.message,
      PRIMITIVE_ERROR_MSG.BROADCAST_MAX_PAYLOAD_EXCEEDED,
    );
  }

  // Enforcer also terminates on its own limit
  try {
    enforcer.recordBroadcastBytes(26);
    t.fail('Expected BudgetLimitError');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(
      err.category, BUDGET_CATEGORY.BROADCAST_BYTES,
    );
  }
  t.equal(enforcer.isTerminated(), true);
  t.end();
});

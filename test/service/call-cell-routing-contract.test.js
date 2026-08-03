/**
 * Wire-identity grammar guard for the call-cell routing contract: the
 * system-owned '#call-' child identity round-trips through the slot and
 * reduce parsers, deriving a child of a child is refused at the grammar
 * (depth guard), caller-supplied idempotency keys may never carry any
 * reserved separator, and the supplied-base gate admits the child
 * grammar while refusing the slot/reduce wire grammar.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CALL_CELL_ROUTE_ERROR_CODE,
  assertCallBaseInvocationId,
  createCallChildInvocationId,
  createCallInvocationIdentity,
  createCallReduceInvocationId,
  createCallSlotInvocationId,
  parseCallInvocationIdentity,
} from '../../src/service/call-cell-routing-contract.js';

const OUTER_ID = 'request-invocation-7';
const CHILD_ORDINAL = 1;
const CHILD_ID = 'request-invocation-7#call-1';
const SLOT_ID = 2;
const PLAIN_KEY = 'caller-key-1';

function captureRefusal(build) {
  try {
    build();
    return null;
  } catch (error) {
    return error;
  }
}

test('the child identity derives and round-trips through the wire ' +
  'parsers', (t) => {
  t.equal(createCallChildInvocationId(OUTER_ID, CHILD_ORDINAL), CHILD_ID,
    'child identity = outer id + #call- + ordinal');
  t.same(
    parseCallInvocationIdentity(
      createCallSlotInvocationId(CHILD_ID, SLOT_ID)),
    {baseInvocationId: CHILD_ID, slotOrdinal: SLOT_ID},
    'a slot-scoped child wire identity parses back to the child base ' +
      'and its slot ordinal',
  );
  t.same(
    parseCallInvocationIdentity(createCallReduceInvocationId(CHILD_ID)),
    {baseInvocationId: CHILD_ID, slotOrdinal: 0},
    'the child reduce wire identity parses back to the child base',
  );
  t.same(
    parseCallInvocationIdentity(CHILD_ID),
    {baseInvocationId: CHILD_ID, slotOrdinal: 0},
    'the bare child identity is its own base',
  );
  t.end();
});

test('deriving a child of a child is refused at the grammar', (t) => {
  const refusal = captureRefusal(
    () => createCallChildInvocationId(CHILD_ID, CHILD_ORDINAL));
  t.equal(refusal?.code, CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
    'the depth guard refuses typed');
  for (const [outer, ordinal] of [
    ['', CHILD_ORDINAL],
    [undefined, CHILD_ORDINAL],
    [OUTER_ID, 0],
    [OUTER_ID, -1],
  ]) {
    t.equal(
      captureRefusal(() => createCallChildInvocationId(outer, ordinal))
        ?.code,
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      'an empty outer id or non-positive ordinal is refused typed',
    );
  }
  t.end();
});

test('a caller-supplied idempotency key never carries the child-call ' +
  'separator', (t) => {
  t.equal(createCallInvocationIdentity(PLAIN_KEY).invocationId, PLAIN_KEY,
    'a plain idempotency key still passes through');
  for (const reserved of ['key#call-1', 'a#call-2#slot-1']) {
    t.equal(
      captureRefusal(() => createCallInvocationIdentity(reserved))?.code,
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      `${reserved} is refused typed`,
    );
  }
  t.end();
});

test('the supplied-base gate admits the child grammar and refuses the ' +
  'wire grammar', (t) => {
  t.equal(assertCallBaseInvocationId(CHILD_ID), CHILD_ID,
    'the system-owned child identity passes verbatim');
  t.equal(assertCallBaseInvocationId(OUTER_ID), OUTER_ID,
    'a plain system identity passes verbatim');
  for (const reserved of ['x#slot-3', 'x#reduce', '', undefined]) {
    t.equal(
      captureRefusal(() => assertCallBaseInvocationId(reserved))?.code,
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      `${String(reserved)} is refused typed`,
    );
  }
  t.end();
});

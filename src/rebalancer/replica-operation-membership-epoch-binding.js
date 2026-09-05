/**
 * Replica-operation membership-publication epoch binding — the single owner
 * of the durable-to-semantic decode for a replica operation's planning
 * membership epoch (`replica_operations.membership_publication_epoch`).
 *
 * The durable column carries three distinguishable facts and every reader
 * that changes behaviour on the binding must consume this decode:
 *
 *   SQL NULL / absent column   -> UNBOUND  (no planning-epoch binding; the
 *                                 dispatch fence has nothing to compare)
 *   non-negative integer N     -> BOUND N  (epoch zero stays epoch zero)
 *   anything else              -> INVALID  (fails closed: a malformed
 *                                 durable value is never coerced into a
 *                                 legitimate epoch)
 *
 * `Number(null)` is 0, so any local `Number(row.column)` reinterpretation
 * manufactures a false epoch-zero binding from an unbound row and the
 * dispatch fence then rejects the operation as stale. That decode lives
 * here once; callers branch on the explicit binding state.
 */

const MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE = Object.freeze({
  BOUND: 'bound',
  UNBOUND: 'unbound',
  INVALID: 'invalid',
});

const INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING =
  'INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING';
const INVALID_BINDING_MESSAGE_PREFIX =
  'Invalid membership publication epoch binding';
const RAW_VALUE_TYPE_SEPARATOR = ':';
const UNKNOWN_OPERATION_ID = 'unknown';

const UNBOUND_MEMBERSHIP_PUBLICATION_EPOCH_BINDING = Object.freeze({
  state: MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE.UNBOUND,
});

/**
 * Whether a value is a sanctioned bound planning epoch: a primitive
 * non-negative integer. Boxed numbers, numeric strings, NaN, Infinity,
 * negatives, and fractions are not bindings.
 * @param {*} value
 * @return {boolean}
 */
function isBoundMembershipPublicationEpoch(value) {
  return Number.isInteger(value) && value >= 0;
}

function isAbsentMembershipPublicationEpoch(value) {
  return value === null || value === undefined;
}

function describeRawEpochValue(value) {
  const valueType = typeof value;
  if (typeof value === 'string') {
    return `${valueType}${RAW_VALUE_TYPE_SEPARATOR}${JSON.stringify(value)}`;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return `${valueType}${RAW_VALUE_TYPE_SEPARATOR}${String(value)}`;
  }
  return valueType;
}

const MEMBERSHIP_PUBLICATION_EPOCH_DECODE_RULES = Object.freeze([
  Object.freeze({
    matches: isAbsentMembershipPublicationEpoch,
    decode: () => UNBOUND_MEMBERSHIP_PUBLICATION_EPOCH_BINDING,
  }),
  Object.freeze({
    matches: isBoundMembershipPublicationEpoch,
    decode: (value) => Object.freeze({
      state: MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE.BOUND,
      epoch: value,
    }),
  }),
]);

/**
 * Decode a raw membership-publication epoch value (durable column, cache
 * row, or in-memory record field) into its explicit binding variant.
 * @param {*} value
 * @return {{state: string, epoch?: number, raw?: string}}
 */
function decodeMembershipPublicationEpochBinding(value) {
  const rule = MEMBERSHIP_PUBLICATION_EPOCH_DECODE_RULES.find((candidate) =>
    candidate.matches(value));
  if (rule) {
    return rule.decode(value);
  }
  return Object.freeze({
    state: MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE.INVALID,
    raw: describeRawEpochValue(value),
  });
}

function buildInvalidBindingError(binding, context) {
  const operationId = context?.operationId ?? UNKNOWN_OPERATION_ID;
  const error = new Error(
    `${INVALID_BINDING_MESSAGE_PREFIX} for operation ${operationId} ` +
      `(${context?.source}): ${binding.raw}`,
  );
  error.code = INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING;
  error.operationId = operationId;
  error.bindingSource = context?.source;
  return error;
}

/**
 * Decode and fail closed: returns the BOUND or UNBOUND binding, and throws
 * a typed INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING error for anything
 * the persistence contract does not sanction.
 * @param {*} value
 * @param {{source: string, operationId?: string}} context
 * @return {{state: string, epoch?: number}}
 */
function assertMembershipPublicationEpochBinding(value, context) {
  const binding = decodeMembershipPublicationEpochBinding(value);
  if (binding.state === MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE.INVALID) {
    throw buildInvalidBindingError(binding, context);
  }
  return binding;
}

export {
  INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING,
  MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE,
  assertMembershipPublicationEpochBinding,
  decodeMembershipPublicationEpochBinding,
  isBoundMembershipPublicationEpoch,
};

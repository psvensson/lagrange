import {createHash} from 'node:crypto';
import {NUM} from '../../constants/index.js';

const PLAN_HASH = Object.freeze({
  SHA1: 'sha1',
  HEX: 'hex',
  PREFIX: 'dqp-',
  LENGTH: NUM.SIXTEEN,
});

/**
 * Normalize an object into a JSON-safe payload for deterministic hashing.
 * @param {*} value - Input value.
 * @return {*} Normalized value.
 */
function normalizePlanPayload(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePlanPayload(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const normalized = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === 'function' || entry === undefined) {
      continue;
    }
    normalized[key] = normalizePlanPayload(entry);
  }
  return normalized;
}

/**
 * Build deterministic plan ID from normalized planning payload.
 * @param {string} statementType - Statement type.
 * @param {Object} ast - Statement AST.
 * @param {Array} params - Bound params.
 * @param {Map<string, Object>} tablePlans - Table access plans.
 * @param {Object[]|null} joinPlan - Join plan.
 * @return {string} Deterministic plan ID.
 */
function createDeterministicPlanId(
  statementType,
  ast,
  params,
  tablePlans,
  joinPlan,
) {
  const serializedTablePlans = Array.from(tablePlans.entries())
    .map(([alias, plan]) => ({
      alias,
      tableName: plan.tableName,
      partitions: [...plan.partitions].sort(),
      keyPredicateShape: plan.keyPredicateShape,
    }))
    .sort((left, right) => left.alias.localeCompare(right.alias));

  const payload = {
    statementType,
    ast: normalizePlanPayload(ast),
    paramsCount: params.length,
    tablePlans: serializedTablePlans,
    joinPlan: joinPlan || null,
  };
  const digest = createHash(PLAN_HASH.SHA1)
    .update(JSON.stringify(payload))
    .digest(PLAN_HASH.HEX)
    .slice(0, PLAN_HASH.LENGTH);
  return `${PLAN_HASH.PREFIX}${digest}`;
}

export {
  createDeterministicPlanId,
  normalizePlanPayload,
  PLAN_HASH,
};

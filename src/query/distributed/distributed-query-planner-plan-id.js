import {createHash} from 'node:crypto';
import {NUM} from '../../constants/index.js';
import {QUERY_AST_TYPE} from '../query-constants.js';
import {AST_TEMPLATE_KEY_SYMBOL} from '../sql-parse-cache.js';
import {hasSubqueryCteOrCompound} from './distributed-select-fanout-soundness.js';
import {renderExpressionWithParameters} from '../sql-statement-renderer.js';

const PLAN_HASH = Object.freeze({
  SHA1: 'sha1',
  HEX: 'hex',
  PREFIX: 'dqp-',
  LENGTH: NUM.SIXTEEN,
});
const MAX_STRUCTURAL_PLAN_TEMPLATES = 256;

function deepFreezeValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  if (value instanceof Map) {
    for (const [key, entry] of value.entries()) {
      deepFreezeValue(key);
      deepFreezeValue(entry);
    }
    return Object.freeze(value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      deepFreezeValue(value[index]);
    }
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) {
    deepFreezeValue(value[key]);
  }
  return Object.freeze(value);
}

function clonePlanStructure(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => clonePlanStructure(entry));
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  const copy = {};
  for (const key of Object.keys(value)) {
    copy[key] = clonePlanStructure(value[key]);
  }
  return copy;
}

function buildTableStructuralTemplate(
  planner,
  ast,
  tableName,
  tableAlias,
  isNestedOrCompound,
) {
  const whereClause = ast ? ast.where || null : null;
  const localPredicate = isNestedOrCompound ?
    null :
    planner.extractTableLocalPredicate(whereClause, tableAlias);
  const targetPredicate = isNestedOrCompound ?
    null :
    (localPredicate || whereClause);
  const projectedColumns = planner.extractProjectedColumns(ast, tableAlias);
  const fragmentSql = planner.buildFragmentSql({
    tableName,
    tableAlias,
    projectedColumns,
    localPredicate,
  });
  const fragmentParamNodes = localPredicate ?
    renderExpressionWithParameters(
      localPredicate,
      (paramNode) => paramNode,
    ).params :
    [];
  return Object.freeze({
    localPredicate,
    targetPredicate,
    projectedColumns,
    fragmentSql,
    fragmentParamNodes,
  });
}

function buildSelectStructuralTemplate(planner, ast) {
  const tableGraph = planner.extractTableGraph(ast);
  const isNestedOrCompound = Boolean(ast && hasSubqueryCteOrCompound(ast));
  const tableTemplates = new Map();
  for (const {tableName, tableAlias} of tableGraph) {
    if (!tableName || !tableAlias) continue;
    tableTemplates.set(
      tableAlias,
      buildTableStructuralTemplate(
        planner,
        ast,
        tableName,
        tableAlias,
        isNestedOrCompound,
      ),
    );
  }
  return Object.freeze({
    tableGraph,
    isNestedOrCompound,
    tableTemplates,
    mergePlan: planner.buildMergePlan(ast),
  });
}

function resolveStructuralPlanTemplate(planner, ast) {
  const templateKey = ast?.[AST_TEMPLATE_KEY_SYMBOL];
  if (typeof templateKey !== 'string' || templateKey.length === 0) {
    return null;
  }
  const templates = planner.structuralTemplates;
  const existing = templates?.get(templateKey);
  if (existing) {
    templates.delete(templateKey);
    templates.set(templateKey, existing);
    return existing;
  }
  const created = deepFreezeValue({
    normalizedAst: planner.normalizePlanPayload(ast),
    selectTemplate: ast.type === QUERY_AST_TYPE.SELECT ?
      buildSelectStructuralTemplate(planner, ast) :
      null,
  });
  if (templates) {
    if (templates.size >= MAX_STRUCTURAL_PLAN_TEMPLATES) {
      const oldestKey = templates.keys().next().value;
      if (oldestKey !== undefined) templates.delete(oldestKey);
    }
    templates.set(templateKey, created);
  }
  return created;
}

/**
 * Normalize an object into a JSON-safe payload for deterministic hashing.
 * @param {*} value - Input value.
 * @return {*} Normalized value.
 */
function normalizePlanPayload(value) {
  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }
  if (value instanceof Uint8Array) {
    const buf = Buffer.isBuffer(value) ?
      value :
      Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    return {__blob: buf.toString(PLAN_HASH.HEX)};
  }
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
  preNormalizedAst = null,
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
    ast: preNormalizedAst !== null ? preNormalizedAst : normalizePlanPayload(ast),
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
  clonePlanStructure,
  createDeterministicPlanId,
  normalizePlanPayload,
  resolveStructuralPlanTemplate,
};

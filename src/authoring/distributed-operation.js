/**
 * Guest-safe distributed-operation authoring: a descriptor holds the
 * declared statement plus the authored run and reduce functions. It
 * carries no id of its own — the service definition assigns identity
 * from its explicit operations keys, never from Function.name.
 */
import {AUTHORING_DESCRIPTOR_KIND, deepFreeze} from './define-service.js';

const ENTRY_TUPLE_KEY_INDEX = 0;
const ENTRY_TUPLE_VALUE_INDEX = 1;

function emitReturnedPartialEntries(entries, emitFn) {
  if (!Array.isArray(entries) || typeof emitFn !== 'function') {
    return;
  }
  for (const entry of entries) {
    if (Array.isArray(entry)) {
      emitFn(entry[ENTRY_TUPLE_KEY_INDEX], entry[ENTRY_TUPLE_VALUE_INDEX]);
    } else if (entry && typeof entry === 'object') {
      const groupKey = 'groupKey' in entry ? entry.groupKey : entry.key;
      const partial = 'partial' in entry ? entry.partial : entry.value;
      emitFn(groupKey, partial);
    }
  }
}

function createAccumulatorRunBridge(init, step, finish) {
  if (typeof init !== 'function' ||
      typeof step !== 'function' ||
      typeof finish !== 'function') {
    return undefined;
  }
  return function runAccumulatorSingleBatch(rows, args, context) {
    let state = init(args);
    if (Array.isArray(rows) && rows.length > 0) {
      state = step(state, rows, args);
    }
    const outcome = finish(state, args, context);
    emitReturnedPartialEntries(outcome, context?.emit);
    return outcome;
  };
}

const OPTIONAL_SCALAR_KEYS = Object.freeze([
  'pageKey',
  'pageRowBound',
  'maxPages',
  'maxShardRows',
  'maxShardBytes',
]);

const OPTIONAL_FUNCTION_KEYS = Object.freeze(['init', 'step', 'finish']);

function resolveOptionalAccumulatorFields(options, declaredStateSchema) {
  const result = {};
  for (const fnKey of OPTIONAL_FUNCTION_KEYS) {
    if (typeof options[fnKey] === 'function') {
      result[fnKey] = options[fnKey];
    }
  }
  if (declaredStateSchema !== undefined) {
    result.stateSchema = declaredStateSchema;
  }
  for (const key of OPTIONAL_SCALAR_KEYS) {
    if (options[key] !== undefined) {
      result[key] = options[key];
    }
  }
  return result;
}

function resolveAliasedOption(primary, fallback) {
  return primary !== undefined ? primary : fallback;
}

function distributed(options) {
  const {reduce, run, statement} = options;
  const declaredParameters = resolveAliasedOption(
    options.parameters,
    options.params,
  );
  const declaredPartialSchema = resolveAliasedOption(
    options.partialSchema,
    options.partial,
  );
  const declaredStateSchema = resolveAliasedOption(
    options.stateSchema,
    options.state,
  );
  const resolvedRun = typeof run === 'function' ?
    run :
    createAccumulatorRunBridge(options.init, options.step, options.finish);
  return deepFreeze({
    kind: AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION,
    ...(declaredParameters !== undefined ?
      {parameters: declaredParameters} :
      {}),
    ...(declaredPartialSchema !== undefined ?
      {partialSchema: declaredPartialSchema} :
      {}),
    ...resolveOptionalAccumulatorFields(options, declaredStateSchema),
    reduce,
    run: resolvedRun,
    statement,
  });
}

export {distributed};

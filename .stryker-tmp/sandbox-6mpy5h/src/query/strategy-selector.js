/**
 * Strategy selector for join and data movement.
 *
 * Chooses between broadcast, lookup, and emit/shuffle strategies
 * based on dataset size, access path, and optional user hints.
 * Persists the decision and rationale in plan diagnostics for
 * EXPLAIN output.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.3
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM, TYPEOF } from '../constants/index.js';
import { LOOKUP_ACCESS_PATH } from './distributed/distributed-context-constants.js';
import { STRATEGY, STRATEGY_REASON, DEFAULT_BROADCAST_THRESHOLD_BYTES, STRATEGY_INPUT_FIELD as SIF, HINT_FIELD, STRATEGY_DECISION_FIELD as SDF, STRATEGY_ERROR_MSG, VALID_STRATEGIES } from './strategy-constants.js';

/**
 * Set of access paths that qualify for lookup strategy.
 * @type {Set<string>}
 */
const KEY_BOUNDED_ACCESS_PATHS = new Set(stryMutAct_9fa48("125095") ? [] : (stryCov_9fa48("125095"), [LOOKUP_ACCESS_PATH.PRIMARY_KEY, LOOKUP_ACCESS_PATH.UNIQUE_INDEX, LOOKUP_ACCESS_PATH.BOUNDED_INDEX]));
const DEFAULT_STRATEGY_STATE = Object.freeze(stryMutAct_9fa48("125096") ? {} : (stryCov_9fa48("125096"), {
  BROADCAST_THRESHOLD_MATCH: stryMutAct_9fa48("125097") ? "" : (stryCov_9fa48("125097"), 'broadcastThresholdMatch'),
  KEY_BOUNDED_LOOKUP: stryMutAct_9fa48("125098") ? "" : (stryCov_9fa48("125098"), 'keyBoundedLookup'),
  EMIT_SHUFFLE_FALLBACK: stryMutAct_9fa48("125099") ? "" : (stryCov_9fa48("125099"), 'emitShuffleFallback')
}));
const DEFAULT_STRATEGY_CHOICE_BY_STATE = Object.freeze(stryMutAct_9fa48("125100") ? {} : (stryCov_9fa48("125100"), {
  [DEFAULT_STRATEGY_STATE.BROADCAST_THRESHOLD_MATCH]: Object.freeze(stryMutAct_9fa48("125101") ? {} : (stryCov_9fa48("125101"), {
    strategy: STRATEGY.BROADCAST,
    reason: STRATEGY_REASON.SIDE_BELOW_BROADCAST_THRESHOLD
  })),
  [DEFAULT_STRATEGY_STATE.KEY_BOUNDED_LOOKUP]: Object.freeze(stryMutAct_9fa48("125102") ? {} : (stryCov_9fa48("125102"), {
    strategy: STRATEGY.LOOKUP,
    reason: STRATEGY_REASON.INNER_KEY_BOUNDED_LOOKUP
  })),
  [DEFAULT_STRATEGY_STATE.EMIT_SHUFFLE_FALLBACK]: Object.freeze(stryMutAct_9fa48("125103") ? {} : (stryCov_9fa48("125103"), {
    strategy: STRATEGY.EMIT_SHUFFLE,
    reason: STRATEGY_REASON.DEFAULT_EMIT_SHUFFLE
  }))
}));

/**
 * Normalize default-strategy evidence into one snapshot.
 *
 * @param {Object} input - Strategy input descriptor.
 * @return {{threshold: number, sideSize: number, accessPath: string|null}}
 *   Normalized decision evidence.
 */
function buildDefaultStrategySnapshot(input) {
  if (stryMutAct_9fa48("125104")) {
    {}
  } else {
    stryCov_9fa48("125104");
    return stryMutAct_9fa48("125105") ? {} : (stryCov_9fa48("125105"), {
      threshold: stryMutAct_9fa48("125106") ? input[SIF.BROADCAST_THRESHOLD_BYTES] && DEFAULT_BROADCAST_THRESHOLD_BYTES : (stryCov_9fa48("125106"), input[SIF.BROADCAST_THRESHOLD_BYTES] ?? DEFAULT_BROADCAST_THRESHOLD_BYTES),
      sideSize: input[SIF.SIDE_SIZE_BYTES],
      accessPath: stryMutAct_9fa48("125107") ? input[SIF.INNER_ACCESS_PATH] && null : (stryCov_9fa48("125107"), input[SIF.INNER_ACCESS_PATH] ?? null)
    });
  }
}

/**
 * Resolve one default-strategy state from normalized evidence.
 *
 * @param {Object} snapshot - Default-strategy evidence.
 * @return {string} DEFAULT_STRATEGY_STATE member.
 */
function resolveDefaultStrategyState(snapshot) {
  if (stryMutAct_9fa48("125108")) {
    {}
  } else {
    stryCov_9fa48("125108");
    if (stryMutAct_9fa48("125112") ? snapshot.sideSize > snapshot.threshold : stryMutAct_9fa48("125111") ? snapshot.sideSize < snapshot.threshold : stryMutAct_9fa48("125110") ? false : stryMutAct_9fa48("125109") ? true : (stryCov_9fa48("125109", "125110", "125111", "125112"), snapshot.sideSize <= snapshot.threshold)) {
      if (stryMutAct_9fa48("125113")) {
        {}
      } else {
        stryCov_9fa48("125113");
        return DEFAULT_STRATEGY_STATE.BROADCAST_THRESHOLD_MATCH;
      }
    }
    if (stryMutAct_9fa48("125116") ? snapshot.accessPath || KEY_BOUNDED_ACCESS_PATHS.has(snapshot.accessPath) : stryMutAct_9fa48("125115") ? false : stryMutAct_9fa48("125114") ? true : (stryCov_9fa48("125114", "125115", "125116"), snapshot.accessPath && KEY_BOUNDED_ACCESS_PATHS.has(snapshot.accessPath))) {
      if (stryMutAct_9fa48("125117")) {
        {}
      } else {
        stryCov_9fa48("125117");
        return DEFAULT_STRATEGY_STATE.KEY_BOUNDED_LOOKUP;
      }
    }
    return DEFAULT_STRATEGY_STATE.EMIT_SHUFFLE_FALLBACK;
  }
}

/**
 * Build the canonical default-strategy choice for one state.
 *
 * @param {string} state - DEFAULT_STRATEGY_STATE member.
 * @return {{strategy: string, reason: string}} Strategy choice.
 */
function buildDefaultStrategyChoice(state) {
  if (stryMutAct_9fa48("125118")) {
    {}
  } else {
    stryCov_9fa48("125118");
    const canonicalStrategyChoice = stryMutAct_9fa48("125121") ? DEFAULT_STRATEGY_CHOICE_BY_STATE[state] && DEFAULT_STRATEGY_CHOICE_BY_STATE[DEFAULT_STRATEGY_STATE.EMIT_SHUFFLE_FALLBACK] : stryMutAct_9fa48("125120") ? false : stryMutAct_9fa48("125119") ? true : (stryCov_9fa48("125119", "125120", "125121"), DEFAULT_STRATEGY_CHOICE_BY_STATE[state] || DEFAULT_STRATEGY_CHOICE_BY_STATE[DEFAULT_STRATEGY_STATE.EMIT_SHUFFLE_FALLBACK]);
    return stryMutAct_9fa48("125122") ? {} : (stryCov_9fa48("125122"), {
      ...canonicalStrategyChoice
    });
  }
}

/**
 * Choose the default strategy without considering user hints.
 *
 * Rule order (from design):
 * 1. If side dataset <= broadcast threshold → broadcast.
 * 2. Else if inner side is pk/unique/bounded lookup → lookup.
 * 3. Else → emit/shuffle.
 *
 * @param {Object} input - Strategy input descriptor.
 * @param {number} input.sideSizeBytes - Side dataset size in bytes.
 * @param {string|null} input.innerAccessPath - Inner side access
 *   path from LOOKUP_ACCESS_PATH, or null if not key-bounded.
 * @param {number} [input.broadcastThresholdBytes] - Override for
 *   broadcast threshold.
 * @return {{strategy: string, reason: string}} Chosen strategy
 *   and reason.
 * @throws {Error} If sideSizeBytes is missing or invalid.
 */
function chooseDefaultStrategy(input) {
  if (stryMutAct_9fa48("125123")) {
    {}
  } else {
    stryCov_9fa48("125123");
    validateInput(input);
    const defaultStrategySnapshot = buildDefaultStrategySnapshot(input);
    const defaultStrategyState = resolveDefaultStrategyState(defaultStrategySnapshot);
    return buildDefaultStrategyChoice(defaultStrategyState);
  }
}

/**
 * Validate a user-provided strategy hint against guardrails.
 *
 * Guardrails:
 * - broadcast hint rejected when side size exceeds threshold.
 * - lookup hint rejected when inner side lacks key-bounded access.
 * - emit/shuffle hint is always valid.
 *
 * @param {string} hintStrategy - Requested strategy from hint.
 * @param {Object} input - Strategy input descriptor.
 * @return {{valid: boolean, error: string|null}} Validation result.
 */
function validateHint(hintStrategy, input) {
  if (stryMutAct_9fa48("125124")) {
    {}
  } else {
    stryCov_9fa48("125124");
    if (stryMutAct_9fa48("125127") ? false : stryMutAct_9fa48("125126") ? true : stryMutAct_9fa48("125125") ? VALID_STRATEGIES.has(hintStrategy) : (stryCov_9fa48("125125", "125126", "125127"), !VALID_STRATEGIES.has(hintStrategy))) {
      if (stryMutAct_9fa48("125128")) {
        {}
      } else {
        stryCov_9fa48("125128");
        return stryMutAct_9fa48("125129") ? {} : (stryCov_9fa48("125129"), {
          valid: stryMutAct_9fa48("125130") ? true : (stryCov_9fa48("125130"), false),
          error: STRATEGY_ERROR_MSG.INVALID_STRATEGY_HINT
        });
      }
    }
    const threshold = stryMutAct_9fa48("125131") ? input[SIF.BROADCAST_THRESHOLD_BYTES] && DEFAULT_BROADCAST_THRESHOLD_BYTES : (stryCov_9fa48("125131"), input[SIF.BROADCAST_THRESHOLD_BYTES] ?? DEFAULT_BROADCAST_THRESHOLD_BYTES);
    const sideSize = input[SIF.SIDE_SIZE_BYTES];
    const accessPath = stryMutAct_9fa48("125132") ? input[SIF.INNER_ACCESS_PATH] && null : (stryCov_9fa48("125132"), input[SIF.INNER_ACCESS_PATH] ?? null);
    if (stryMutAct_9fa48("125135") ? hintStrategy === STRATEGY.BROADCAST || sideSize > threshold : stryMutAct_9fa48("125134") ? false : stryMutAct_9fa48("125133") ? true : (stryCov_9fa48("125133", "125134", "125135"), (stryMutAct_9fa48("125137") ? hintStrategy !== STRATEGY.BROADCAST : stryMutAct_9fa48("125136") ? true : (stryCov_9fa48("125136", "125137"), hintStrategy === STRATEGY.BROADCAST)) && (stryMutAct_9fa48("125140") ? sideSize <= threshold : stryMutAct_9fa48("125139") ? sideSize >= threshold : stryMutAct_9fa48("125138") ? true : (stryCov_9fa48("125138", "125139", "125140"), sideSize > threshold)))) {
      if (stryMutAct_9fa48("125141")) {
        {}
      } else {
        stryCov_9fa48("125141");
        return stryMutAct_9fa48("125142") ? {} : (stryCov_9fa48("125142"), {
          valid: stryMutAct_9fa48("125143") ? true : (stryCov_9fa48("125143"), false),
          error: STRATEGY_ERROR_MSG.HINT_BROADCAST_EXCEEDS_THRESHOLD
        });
      }
    }
    if (stryMutAct_9fa48("125146") ? hintStrategy === STRATEGY.LOOKUP || !accessPath || !KEY_BOUNDED_ACCESS_PATHS.has(accessPath) : stryMutAct_9fa48("125145") ? false : stryMutAct_9fa48("125144") ? true : (stryCov_9fa48("125144", "125145", "125146"), (stryMutAct_9fa48("125148") ? hintStrategy !== STRATEGY.LOOKUP : stryMutAct_9fa48("125147") ? true : (stryCov_9fa48("125147", "125148"), hintStrategy === STRATEGY.LOOKUP)) && (stryMutAct_9fa48("125150") ? !accessPath && !KEY_BOUNDED_ACCESS_PATHS.has(accessPath) : stryMutAct_9fa48("125149") ? true : (stryCov_9fa48("125149", "125150"), (stryMutAct_9fa48("125151") ? accessPath : (stryCov_9fa48("125151"), !accessPath)) || (stryMutAct_9fa48("125152") ? KEY_BOUNDED_ACCESS_PATHS.has(accessPath) : (stryCov_9fa48("125152"), !KEY_BOUNDED_ACCESS_PATHS.has(accessPath))))))) {
      if (stryMutAct_9fa48("125153")) {
        {}
      } else {
        stryCov_9fa48("125153");
        return stryMutAct_9fa48("125154") ? {} : (stryCov_9fa48("125154"), {
          valid: stryMutAct_9fa48("125155") ? true : (stryCov_9fa48("125155"), false),
          error: STRATEGY_ERROR_MSG.HINT_LOOKUP_NO_KEY_ACCESS
        });
      }
    }
    return stryMutAct_9fa48("125156") ? {} : (stryCov_9fa48("125156"), {
      valid: stryMutAct_9fa48("125157") ? false : (stryCov_9fa48("125157"), true),
      error: null
    });
  }
}

/**
 * Map a valid hint strategy to its corresponding reason string.
 *
 * @param {string} hintStrategy - Validated hint strategy.
 * @return {string} Reason string for diagnostics.
 */
function hintReason(hintStrategy) {
  if (stryMutAct_9fa48("125158")) {
    {}
  } else {
    stryCov_9fa48("125158");
    if (stryMutAct_9fa48("125161") ? hintStrategy !== STRATEGY.BROADCAST : stryMutAct_9fa48("125160") ? false : stryMutAct_9fa48("125159") ? true : (stryCov_9fa48("125159", "125160", "125161"), hintStrategy === STRATEGY.BROADCAST)) {
      if (stryMutAct_9fa48("125162")) {
        {}
      } else {
        stryCov_9fa48("125162");
        return STRATEGY_REASON.USER_HINT_BROADCAST;
      }
    }
    if (stryMutAct_9fa48("125165") ? hintStrategy !== STRATEGY.LOOKUP : stryMutAct_9fa48("125164") ? false : stryMutAct_9fa48("125163") ? true : (stryCov_9fa48("125163", "125164", "125165"), hintStrategy === STRATEGY.LOOKUP)) {
      if (stryMutAct_9fa48("125166")) {
        {}
      } else {
        stryCov_9fa48("125166");
        return STRATEGY_REASON.USER_HINT_LOOKUP;
      }
    }
    return STRATEGY_REASON.USER_HINT_EMIT_SHUFFLE;
  }
}

/**
 * Select a strategy considering both default rules and optional
 * user hints. Returns a full decision object suitable for plan
 * diagnostics and EXPLAIN output.
 *
 * @param {Object} input - Strategy input descriptor.
 * @param {number} input.sideSizeBytes - Side dataset size in bytes.
 * @param {string|null} input.innerAccessPath - Inner side access
 *   path or null.
 * @param {number} [input.broadcastThresholdBytes] - Override.
 * @param {Object|null} [hints] - Optional planner hints object.
 * @param {string} [hints.strategy] - Requested strategy override.
 * @return {Readonly<Object>} Frozen strategy decision with
 *   strategy, reason, hintApplied, and input fields.
 * @throws {Error} If input is invalid or hint fails guardrails.
 */
function selectStrategy(input, hints) {
  if (stryMutAct_9fa48("125167")) {
    {}
  } else {
    stryCov_9fa48("125167");
    validateInput(input);
    const hintStrategy = stryMutAct_9fa48("125168") ? hints?.[HINT_FIELD.STRATEGY] && null : (stryCov_9fa48("125168"), (stryMutAct_9fa48("125169") ? hints[HINT_FIELD.STRATEGY] : (stryCov_9fa48("125169"), hints?.[HINT_FIELD.STRATEGY])) ?? null);

    // If a hint is provided, validate and apply it
    if (stryMutAct_9fa48("125171") ? false : stryMutAct_9fa48("125170") ? true : (stryCov_9fa48("125170", "125171"), hintStrategy)) {
      if (stryMutAct_9fa48("125172")) {
        {}
      } else {
        stryCov_9fa48("125172");
        const hintValidation = validateHint(hintStrategy, input);
        if (stryMutAct_9fa48("125175") ? false : stryMutAct_9fa48("125174") ? true : stryMutAct_9fa48("125173") ? hintValidation.valid : (stryCov_9fa48("125173", "125174", "125175"), !hintValidation.valid)) {
          if (stryMutAct_9fa48("125176")) {
            {}
          } else {
            stryCov_9fa48("125176");
            throw new Error(hintValidation.error);
          }
        }
        return Object.freeze(stryMutAct_9fa48("125177") ? {} : (stryCov_9fa48("125177"), {
          [SDF.STRATEGY]: hintStrategy,
          [SDF.REASON]: hintReason(hintStrategy),
          [SDF.HINT_APPLIED]: stryMutAct_9fa48("125178") ? false : (stryCov_9fa48("125178"), true),
          [SDF.INPUT]: freezeInput(input)
        }));
      }
    }

    // No hint — use default chooser
    const defaultChoice = chooseDefaultStrategy(input);
    return Object.freeze(stryMutAct_9fa48("125179") ? {} : (stryCov_9fa48("125179"), {
      [SDF.STRATEGY]: defaultChoice.strategy,
      [SDF.REASON]: defaultChoice.reason,
      [SDF.HINT_APPLIED]: stryMutAct_9fa48("125180") ? true : (stryCov_9fa48("125180"), false),
      [SDF.INPUT]: freezeInput(input)
    }));
  }
}

/**
 * Format a strategy decision as EXPLAIN/diagnostic output.
 *
 * @param {Object} decision - Strategy decision from selectStrategy.
 * @return {Readonly<Object>} Frozen diagnostic object with
 *   human-readable fields for EXPLAIN.
 */
function formatExplainDiagnostic(decision) {
  if (stryMutAct_9fa48("125181")) {
    {}
  } else {
    stryCov_9fa48("125181");
    return Object.freeze(stryMutAct_9fa48("125182") ? {} : (stryCov_9fa48("125182"), {
      strategy: decision[SDF.STRATEGY],
      reason: decision[SDF.REASON],
      hintApplied: decision[SDF.HINT_APPLIED],
      sideSizeBytes: stryMutAct_9fa48("125183") ? decision[SDF.INPUT]?.[SIF.SIDE_SIZE_BYTES] && null : (stryCov_9fa48("125183"), (stryMutAct_9fa48("125184") ? decision[SDF.INPUT][SIF.SIDE_SIZE_BYTES] : (stryCov_9fa48("125184"), decision[SDF.INPUT]?.[SIF.SIDE_SIZE_BYTES])) ?? null),
      innerAccessPath: stryMutAct_9fa48("125185") ? decision[SDF.INPUT]?.[SIF.INNER_ACCESS_PATH] && null : (stryCov_9fa48("125185"), (stryMutAct_9fa48("125186") ? decision[SDF.INPUT][SIF.INNER_ACCESS_PATH] : (stryCov_9fa48("125186"), decision[SDF.INPUT]?.[SIF.INNER_ACCESS_PATH])) ?? null),
      broadcastThresholdBytes: stryMutAct_9fa48("125187") ? decision[SDF.INPUT]?.[SIF.BROADCAST_THRESHOLD_BYTES] && DEFAULT_BROADCAST_THRESHOLD_BYTES : (stryCov_9fa48("125187"), (stryMutAct_9fa48("125188") ? decision[SDF.INPUT][SIF.BROADCAST_THRESHOLD_BYTES] : (stryCov_9fa48("125188"), decision[SDF.INPUT]?.[SIF.BROADCAST_THRESHOLD_BYTES])) ?? DEFAULT_BROADCAST_THRESHOLD_BYTES)
    }));
  }
}

/**
 * Validate strategy input descriptor.
 *
 * @param {Object} input - Strategy input.
 * @throws {Error} If sideSizeBytes is missing or invalid.
 * @private
 */
function validateInput(input) {
  if (stryMutAct_9fa48("125189")) {
    {}
  } else {
    stryCov_9fa48("125189");
    const sideSize = stryMutAct_9fa48("125190") ? input[SIF.SIDE_SIZE_BYTES] : (stryCov_9fa48("125190"), input?.[SIF.SIDE_SIZE_BYTES]);
    if (stryMutAct_9fa48("125193") ? sideSize === undefined && sideSize === null : stryMutAct_9fa48("125192") ? false : stryMutAct_9fa48("125191") ? true : (stryCov_9fa48("125191", "125192", "125193"), (stryMutAct_9fa48("125195") ? sideSize !== undefined : stryMutAct_9fa48("125194") ? false : (stryCov_9fa48("125194", "125195"), sideSize === undefined)) || (stryMutAct_9fa48("125197") ? sideSize !== null : stryMutAct_9fa48("125196") ? false : (stryCov_9fa48("125196", "125197"), sideSize === null)))) {
      if (stryMutAct_9fa48("125198")) {
        {}
      } else {
        stryCov_9fa48("125198");
        throw new Error(STRATEGY_ERROR_MSG.SIDE_SIZE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("125201") ? typeof sideSize !== TYPEOF.NUMBER && sideSize < NUM.ZERO : stryMutAct_9fa48("125200") ? false : stryMutAct_9fa48("125199") ? true : (stryCov_9fa48("125199", "125200", "125201"), (stryMutAct_9fa48("125203") ? typeof sideSize === TYPEOF.NUMBER : stryMutAct_9fa48("125202") ? false : (stryCov_9fa48("125202", "125203"), typeof sideSize !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("125206") ? sideSize >= NUM.ZERO : stryMutAct_9fa48("125205") ? sideSize <= NUM.ZERO : stryMutAct_9fa48("125204") ? false : (stryCov_9fa48("125204", "125205", "125206"), sideSize < NUM.ZERO)))) {
      if (stryMutAct_9fa48("125207")) {
        {}
      } else {
        stryCov_9fa48("125207");
        throw new Error(STRATEGY_ERROR_MSG.SIDE_SIZE_MUST_BE_NUMBER);
      }
    }
  }
}

/**
 * Create a frozen copy of the input descriptor for diagnostics.
 *
 * @param {Object} input - Strategy input.
 * @return {Readonly<Object>} Frozen input snapshot.
 * @private
 */
function freezeInput(input) {
  if (stryMutAct_9fa48("125208")) {
    {}
  } else {
    stryCov_9fa48("125208");
    return Object.freeze(stryMutAct_9fa48("125209") ? {} : (stryCov_9fa48("125209"), {
      [SIF.SIDE_SIZE_BYTES]: input[SIF.SIDE_SIZE_BYTES],
      [SIF.INNER_ACCESS_PATH]: stryMutAct_9fa48("125210") ? input[SIF.INNER_ACCESS_PATH] && null : (stryCov_9fa48("125210"), input[SIF.INNER_ACCESS_PATH] ?? null),
      [SIF.BROADCAST_THRESHOLD_BYTES]: stryMutAct_9fa48("125211") ? input[SIF.BROADCAST_THRESHOLD_BYTES] && DEFAULT_BROADCAST_THRESHOLD_BYTES : (stryCov_9fa48("125211"), input[SIF.BROADCAST_THRESHOLD_BYTES] ?? DEFAULT_BROADCAST_THRESHOLD_BYTES)
    }));
  }
}
export { chooseDefaultStrategy, validateHint, selectStrategy, formatExplainDiagnostic };
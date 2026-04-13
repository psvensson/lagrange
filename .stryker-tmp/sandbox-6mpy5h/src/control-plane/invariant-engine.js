/**
 * Control-Plane Invariant Engine — evaluates a canonical set of
 * control-plane correctness invariants against a state snapshot.
 *
 * Each invariant check returns a typed result:
 *   {invariantId, severity, passed, reason, context}
 *
 * Severity is tagged as 'hard' or 'soft':
 *   - hard: must fail deterministic test gates
 *   - soft: diagnostic warning, does not gate
 *
 * Requirements: 7.1 (Requirement 7)
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
import { createInvariantRecord, INVARIANT_ID } from '../invariants/invariant-catalog.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from './control-plane-readiness-constants.js';
import { INVARIANT_BUNDLE_FIELD, INVARIANT_ENGINE_SUBSYSTEM, INVARIANT_GATE_ERROR_MESSAGE, INVARIANT_OUTCOME_SEVERITY, INVARIANT_REASON } from './invariant-constants.js';

/**
 * Build a frozen invariant result object.
 *
 * @param {Object} options
 * @param {string} options.invariantId - One of INVARIANT_ID.
 * @param {string} options.severity - INVARIANT_OUTCOME_SEVERITY.
 * @param {boolean} options.passed - Whether the invariant holds.
 * @param {string} options.reason - INVARIANT_REASON code.
 * @param {Object} [options.context] - Additional diagnostic context.
 * @return {Object} Frozen invariant result.
 */
function buildInvariantResult(options) {
  if (stryMutAct_9fa48("66055")) {
    {}
  } else {
    stryCov_9fa48("66055");
    return Object.freeze(stryMutAct_9fa48("66056") ? {} : (stryCov_9fa48("66056"), {
      invariantId: options.invariantId,
      severity: options.severity,
      passed: options.passed,
      reason: options.reason,
      context: options.context ? Object.freeze(stryMutAct_9fa48("66057") ? {} : (stryCov_9fa48("66057"), {
        ...options.context
      })) : null
    }));
  }
}
const REPLICA_OPERATION_CANONICAL_OWNER = stryMutAct_9fa48("66058") ? "" : (stryCov_9fa48("66058"), 'RebalanceCoordinator');
const REPLICA_OPERATION_OWNER_FIELDS = new Set(stryMutAct_9fa48("66059") ? [] : (stryCov_9fa48("66059"), [stryMutAct_9fa48("66060") ? "" : (stryCov_9fa48("66060"), 'status'), stryMutAct_9fa48("66061") ? "" : (stryCov_9fa48("66061"), 'workflow_step'), stryMutAct_9fa48("66062") ? "" : (stryCov_9fa48("66062"), 'completed_at'), stryMutAct_9fa48("66063") ? "" : (stryCov_9fa48("66063"), 'error_message'), stryMutAct_9fa48("66064") ? "" : (stryCov_9fa48("66064"), 'steps_history'), stryMutAct_9fa48("66065") ? "" : (stryCov_9fa48("66065"), 'replica_id')]));
const INTERNAL_TOPOLOGY_READINESS_CONSUMERS = new Set(stryMutAct_9fa48("66066") ? [] : (stryCov_9fa48("66066"), [stryMutAct_9fa48("66067") ? "" : (stryCov_9fa48("66067"), 'ManagedSplitWorkflow'), stryMutAct_9fa48("66068") ? "" : (stryCov_9fa48("66068"), 'MovePlanner'), stryMutAct_9fa48("66069") ? "" : (stryCov_9fa48("66069"), 'RebalanceCoordinator'), stryMutAct_9fa48("66070") ? "" : (stryCov_9fa48("66070"), 'ReplicaDispatchService'), stryMutAct_9fa48("66071") ? "" : (stryCov_9fa48("66071"), 'StorageAdmissionService'), stryMutAct_9fa48("66072") ? "" : (stryCov_9fa48("66072"), 'UnifiedRebalancer')]));
const EXTERNAL_SERVE_READINESS_CONSUMERS = new Set(stryMutAct_9fa48("66073") ? [] : (stryCov_9fa48("66073"), [stryMutAct_9fa48("66074") ? "" : (stryCov_9fa48("66074"), 'BenchmarkAdmission'), stryMutAct_9fa48("66075") ? "" : (stryCov_9fa48("66075"), 'ExternalRouting'), stryMutAct_9fa48("66076") ? "" : (stryCov_9fa48("66076"), 'PgWireStartupSafetyGate'), stryMutAct_9fa48("66077") ? "" : (stryCov_9fa48("66077"), 'RoutingService')]));
const INVARIANT_ENTITY_ID_CONTEXT_FIELDS = Object.freeze(stryMutAct_9fa48("66078") ? [] : (stryCov_9fa48("66078"), [stryMutAct_9fa48("66079") ? "" : (stryCov_9fa48("66079"), 'operationId'), stryMutAct_9fa48("66080") ? "" : (stryCov_9fa48("66080"), 'workflowId'), stryMutAct_9fa48("66081") ? "" : (stryCov_9fa48("66081"), 'transitionId'), stryMutAct_9fa48("66082") ? "" : (stryCov_9fa48("66082"), 'entityId'), stryMutAct_9fa48("66083") ? "" : (stryCov_9fa48("66083"), 'nodeId'), stryMutAct_9fa48("66084") ? "" : (stryCov_9fa48("66084"), 'consumer')]));

/**
 * Determine whether a value is a non-empty plain object.
 * @param {*} value
 * @return {boolean}
 */
function isRecord(value) {
  if (stryMutAct_9fa48("66085")) {
    {}
  } else {
    stryCov_9fa48("66085");
    return stryMutAct_9fa48("66088") ? value !== null && typeof value === 'object' || !Array.isArray(value) : stryMutAct_9fa48("66087") ? false : stryMutAct_9fa48("66086") ? true : (stryCov_9fa48("66086", "66087", "66088"), (stryMutAct_9fa48("66090") ? value !== null || typeof value === 'object' : stryMutAct_9fa48("66089") ? true : (stryCov_9fa48("66089", "66090"), (stryMutAct_9fa48("66092") ? value === null : stryMutAct_9fa48("66091") ? true : (stryCov_9fa48("66091", "66092"), value !== null)) && (stryMutAct_9fa48("66094") ? typeof value !== 'object' : stryMutAct_9fa48("66093") ? true : (stryCov_9fa48("66093", "66094"), typeof value === (stryMutAct_9fa48("66095") ? "" : (stryCov_9fa48("66095"), 'object')))))) && (stryMutAct_9fa48("66096") ? Array.isArray(value) : (stryCov_9fa48("66096"), !Array.isArray(value))));
  }
}

/**
 * Convert a value into a finite timestamp when possible.
 * @param {*} value
 * @return {number|null}
 */
function toFiniteTimestamp(value) {
  if (stryMutAct_9fa48("66097")) {
    {}
  } else {
    stryCov_9fa48("66097");
    if (stryMutAct_9fa48("66099") ? false : stryMutAct_9fa48("66098") ? true : (stryCov_9fa48("66098", "66099"), Number.isFinite(value))) {
      if (stryMutAct_9fa48("66100")) {
        {}
      } else {
        stryCov_9fa48("66100");
        return Math.floor(value);
      }
    }
    if (stryMutAct_9fa48("66103") ? typeof value === 'string' || value.length > 0 : stryMutAct_9fa48("66102") ? false : stryMutAct_9fa48("66101") ? true : (stryCov_9fa48("66101", "66102", "66103"), (stryMutAct_9fa48("66105") ? typeof value !== 'string' : stryMutAct_9fa48("66104") ? true : (stryCov_9fa48("66104", "66105"), typeof value === (stryMutAct_9fa48("66106") ? "" : (stryCov_9fa48("66106"), 'string')))) && (stryMutAct_9fa48("66109") ? value.length <= 0 : stryMutAct_9fa48("66108") ? value.length >= 0 : stryMutAct_9fa48("66107") ? true : (stryCov_9fa48("66107", "66108", "66109"), value.length > 0)))) {
      if (stryMutAct_9fa48("66110")) {
        {}
      } else {
        stryCov_9fa48("66110");
        const parsed = Date.parse(value);
        if (stryMutAct_9fa48("66112") ? false : stryMutAct_9fa48("66111") ? true : (stryCov_9fa48("66111", "66112"), Number.isFinite(parsed))) {
          if (stryMutAct_9fa48("66113")) {
            {}
          } else {
            stryCov_9fa48("66113");
            return parsed;
          }
        }
      }
    }
    return null;
  }
}

/**
 * Resolve a stable entity id from invariant context when possible.
 * @param {Object} result - Invariant result.
 * @return {string|null}
 */
function resolveInvariantEntityId(result) {
  if (stryMutAct_9fa48("66114")) {
    {}
  } else {
    stryCov_9fa48("66114");
    const context = isRecord(stryMutAct_9fa48("66115") ? result.context : (stryCov_9fa48("66115"), result?.context)) ? result.context : null;
    if (stryMutAct_9fa48("66118") ? false : stryMutAct_9fa48("66117") ? true : stryMutAct_9fa48("66116") ? context : (stryCov_9fa48("66116", "66117", "66118"), !context)) {
      if (stryMutAct_9fa48("66119")) {
        {}
      } else {
        stryCov_9fa48("66119");
        return null;
      }
    }
    for (const field of INVARIANT_ENTITY_ID_CONTEXT_FIELDS) {
      if (stryMutAct_9fa48("66120")) {
        {}
      } else {
        stryCov_9fa48("66120");
        if (stryMutAct_9fa48("66123") ? typeof context[field] === 'string' || context[field].length > 0 : stryMutAct_9fa48("66122") ? false : stryMutAct_9fa48("66121") ? true : (stryCov_9fa48("66121", "66122", "66123"), (stryMutAct_9fa48("66125") ? typeof context[field] !== 'string' : stryMutAct_9fa48("66124") ? true : (stryCov_9fa48("66124", "66125"), typeof context[field] === (stryMutAct_9fa48("66126") ? "" : (stryCov_9fa48("66126"), 'string')))) && (stryMutAct_9fa48("66129") ? context[field].length <= 0 : stryMutAct_9fa48("66128") ? context[field].length >= 0 : stryMutAct_9fa48("66127") ? true : (stryCov_9fa48("66127", "66128", "66129"), context[field].length > 0)))) {
          if (stryMutAct_9fa48("66130")) {
            {}
          } else {
            stryCov_9fa48("66130");
            return context[field];
          }
        }
      }
    }
    return null;
  }
}

/**
 * Check leader uniqueness across owner rows.
 *
 * Each partition or message group must have at most one canonical
 * leader. The state snapshot provides `leaderRows`: an array of
 * objects with at least `{entityId, nodeId}`.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.leaderRows - Owner rows with leader
 *   claims. Each must have `entityId` and `nodeId`.
 * @return {Object} Frozen invariant result.
 */
function checkLeaderUniqueness(state) {
  if (stryMutAct_9fa48("66131")) {
    {}
  } else {
    stryCov_9fa48("66131");
    const rows = Array.isArray(stryMutAct_9fa48("66132") ? state.leaderRows : (stryCov_9fa48("66132"), state?.leaderRows)) ? state.leaderRows : stryMutAct_9fa48("66133") ? ["Stryker was here"] : (stryCov_9fa48("66133"), []);
    const leadersByEntity = new Map();
    for (const row of rows) {
      if (stryMutAct_9fa48("66134")) {
        {}
      } else {
        stryCov_9fa48("66134");
        const entityId = stryMutAct_9fa48("66135") ? row.entityId : (stryCov_9fa48("66135"), row?.entityId);
        const nodeId = stryMutAct_9fa48("66136") ? row.nodeId : (stryCov_9fa48("66136"), row?.nodeId);
        if (stryMutAct_9fa48("66139") ? typeof entityId !== 'string' && entityId.length === 0 : stryMutAct_9fa48("66138") ? false : stryMutAct_9fa48("66137") ? true : (stryCov_9fa48("66137", "66138", "66139"), (stryMutAct_9fa48("66141") ? typeof entityId === 'string' : stryMutAct_9fa48("66140") ? false : (stryCov_9fa48("66140", "66141"), typeof entityId !== (stryMutAct_9fa48("66142") ? "" : (stryCov_9fa48("66142"), 'string')))) || (stryMutAct_9fa48("66144") ? entityId.length !== 0 : stryMutAct_9fa48("66143") ? false : (stryCov_9fa48("66143", "66144"), entityId.length === 0)))) {
          if (stryMutAct_9fa48("66145")) {
            {}
          } else {
            stryCov_9fa48("66145");
            continue;
          }
        }
        if (stryMutAct_9fa48("66148") ? typeof nodeId !== 'string' && nodeId.length === 0 : stryMutAct_9fa48("66147") ? false : stryMutAct_9fa48("66146") ? true : (stryCov_9fa48("66146", "66147", "66148"), (stryMutAct_9fa48("66150") ? typeof nodeId === 'string' : stryMutAct_9fa48("66149") ? false : (stryCov_9fa48("66149", "66150"), typeof nodeId !== (stryMutAct_9fa48("66151") ? "" : (stryCov_9fa48("66151"), 'string')))) || (stryMutAct_9fa48("66153") ? nodeId.length !== 0 : stryMutAct_9fa48("66152") ? false : (stryCov_9fa48("66152", "66153"), nodeId.length === 0)))) {
          if (stryMutAct_9fa48("66154")) {
            {}
          } else {
            stryCov_9fa48("66154");
            continue;
          }
        }
        if (stryMutAct_9fa48("66157") ? false : stryMutAct_9fa48("66156") ? true : stryMutAct_9fa48("66155") ? leadersByEntity.has(entityId) : (stryCov_9fa48("66155", "66156", "66157"), !leadersByEntity.has(entityId))) {
          if (stryMutAct_9fa48("66158")) {
            {}
          } else {
            stryCov_9fa48("66158");
            leadersByEntity.set(entityId, stryMutAct_9fa48("66159") ? ["Stryker was here"] : (stryCov_9fa48("66159"), []));
          }
        }
        leadersByEntity.get(entityId).push(nodeId);
      }
    }
    const duplicates = stryMutAct_9fa48("66160") ? ["Stryker was here"] : (stryCov_9fa48("66160"), []);
    for (const [entityId, nodes] of leadersByEntity) {
      if (stryMutAct_9fa48("66161")) {
        {}
      } else {
        stryCov_9fa48("66161");
        if (stryMutAct_9fa48("66165") ? nodes.length <= 1 : stryMutAct_9fa48("66164") ? nodes.length >= 1 : stryMutAct_9fa48("66163") ? false : stryMutAct_9fa48("66162") ? true : (stryCov_9fa48("66162", "66163", "66164", "66165"), nodes.length > 1)) {
          if (stryMutAct_9fa48("66166")) {
            {}
          } else {
            stryCov_9fa48("66166");
            duplicates.push(stryMutAct_9fa48("66167") ? {} : (stryCov_9fa48("66167"), {
              entityId,
              nodes: Object.freeze(stryMutAct_9fa48("66168") ? [] : (stryCov_9fa48("66168"), [...nodes]))
            }));
          }
        }
      }
    }
    if (stryMutAct_9fa48("66172") ? duplicates.length <= 0 : stryMutAct_9fa48("66171") ? duplicates.length >= 0 : stryMutAct_9fa48("66170") ? false : stryMutAct_9fa48("66169") ? true : (stryCov_9fa48("66169", "66170", "66171", "66172"), duplicates.length > 0)) {
      if (stryMutAct_9fa48("66173")) {
        {}
      } else {
        stryCov_9fa48("66173");
        return buildInvariantResult(stryMutAct_9fa48("66174") ? {} : (stryCov_9fa48("66174"), {
          invariantId: INVARIANT_ID.LEADER_UNIQUENESS,
          severity: INVARIANT_OUTCOME_SEVERITY.HARD,
          passed: stryMutAct_9fa48("66175") ? true : (stryCov_9fa48("66175"), false),
          reason: INVARIANT_REASON.DUPLICATE_LEADER_DETECTED,
          context: stryMutAct_9fa48("66176") ? {} : (stryCov_9fa48("66176"), {
            duplicates: Object.freeze(duplicates)
          })
        }));
      }
    }
    return buildInvariantResult(stryMutAct_9fa48("66177") ? {} : (stryCov_9fa48("66177"), {
      invariantId: INVARIANT_ID.LEADER_UNIQUENESS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: stryMutAct_9fa48("66178") ? false : (stryCov_9fa48("66178"), true),
      reason: INVARIANT_REASON.LEADER_UNIQUE
    }));
  }
}

/**
 * Check workflow step monotonicity.
 *
 * Workflow transitions must not move backward unless through an
 * explicit terminal recovery step. The state snapshot provides
 * `workflows`: an array of workflow objects, each with a
 * `transitionHistory` array of `{previousStep, nextStep}` and
 * an optional `terminalRecoverySteps` set of allowed backward
 * target steps.
 *
 * Step ordering uses numeric comparison when both steps are
 * finite numbers, and lexicographic comparison otherwise.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.workflows - Workflow records.
 * @return {Object} Frozen invariant result.
 */
function checkMonotonicSteps(state) {
  if (stryMutAct_9fa48("66179")) {
    {}
  } else {
    stryCov_9fa48("66179");
    const workflows = Array.isArray(stryMutAct_9fa48("66180") ? state.workflows : (stryCov_9fa48("66180"), state?.workflows)) ? state.workflows : stryMutAct_9fa48("66181") ? ["Stryker was here"] : (stryCov_9fa48("66181"), []);
    const violations = stryMutAct_9fa48("66182") ? ["Stryker was here"] : (stryCov_9fa48("66182"), []);
    for (const workflow of workflows) {
      if (stryMutAct_9fa48("66183")) {
        {}
      } else {
        stryCov_9fa48("66183");
        const history = Array.isArray(stryMutAct_9fa48("66184") ? workflow.transitionHistory : (stryCov_9fa48("66184"), workflow?.transitionHistory)) ? workflow.transitionHistory : stryMutAct_9fa48("66185") ? ["Stryker was here"] : (stryCov_9fa48("66185"), []);
        const recoverySteps = (stryMutAct_9fa48("66186") ? workflow.terminalRecoverySteps : (stryCov_9fa48("66186"), workflow?.terminalRecoverySteps)) instanceof Set ? workflow.terminalRecoverySteps : new Set();
        const workflowId = stryMutAct_9fa48("66189") ? workflow?.workflowId && null : stryMutAct_9fa48("66188") ? false : stryMutAct_9fa48("66187") ? true : (stryCov_9fa48("66187", "66188", "66189"), (stryMutAct_9fa48("66190") ? workflow.workflowId : (stryCov_9fa48("66190"), workflow?.workflowId)) || null);
        for (const entry of history) {
          if (stryMutAct_9fa48("66191")) {
            {}
          } else {
            stryCov_9fa48("66191");
            const prev = stryMutAct_9fa48("66192") ? entry.previousStep : (stryCov_9fa48("66192"), entry?.previousStep);
            const next = stryMutAct_9fa48("66193") ? entry.nextStep : (stryCov_9fa48("66193"), entry?.nextStep);
            if (stryMutAct_9fa48("66196") ? prev == null && next == null : stryMutAct_9fa48("66195") ? false : stryMutAct_9fa48("66194") ? true : (stryCov_9fa48("66194", "66195", "66196"), (stryMutAct_9fa48("66198") ? prev != null : stryMutAct_9fa48("66197") ? false : (stryCov_9fa48("66197", "66198"), prev == null)) || (stryMutAct_9fa48("66200") ? next != null : stryMutAct_9fa48("66199") ? false : (stryCov_9fa48("66199", "66200"), next == null)))) {
              if (stryMutAct_9fa48("66201")) {
                {}
              } else {
                stryCov_9fa48("66201");
                continue;
              }
            }
            if (stryMutAct_9fa48("66203") ? false : stryMutAct_9fa48("66202") ? true : (stryCov_9fa48("66202", "66203"), recoverySteps.has(next))) {
              if (stryMutAct_9fa48("66204")) {
                {}
              } else {
                stryCov_9fa48("66204");
                continue;
              }
            }
            if (stryMutAct_9fa48("66206") ? false : stryMutAct_9fa48("66205") ? true : (stryCov_9fa48("66205", "66206"), isBackwardStep(prev, next))) {
              if (stryMutAct_9fa48("66207")) {
                {}
              } else {
                stryCov_9fa48("66207");
                violations.push(Object.freeze(stryMutAct_9fa48("66208") ? {} : (stryCov_9fa48("66208"), {
                  workflowId,
                  previousStep: prev,
                  nextStep: next
                })));
              }
            }
          }
        }
      }
    }
    if (stryMutAct_9fa48("66212") ? violations.length <= 0 : stryMutAct_9fa48("66211") ? violations.length >= 0 : stryMutAct_9fa48("66210") ? false : stryMutAct_9fa48("66209") ? true : (stryCov_9fa48("66209", "66210", "66211", "66212"), violations.length > 0)) {
      if (stryMutAct_9fa48("66213")) {
        {}
      } else {
        stryCov_9fa48("66213");
        return buildInvariantResult(stryMutAct_9fa48("66214") ? {} : (stryCov_9fa48("66214"), {
          invariantId: INVARIANT_ID.MONOTONIC_STEPS,
          severity: INVARIANT_OUTCOME_SEVERITY.HARD,
          passed: stryMutAct_9fa48("66215") ? true : (stryCov_9fa48("66215"), false),
          reason: INVARIANT_REASON.BACKWARD_STEP_DETECTED,
          context: stryMutAct_9fa48("66216") ? {} : (stryCov_9fa48("66216"), {
            violations: Object.freeze(violations)
          })
        }));
      }
    }
    return buildInvariantResult(stryMutAct_9fa48("66217") ? {} : (stryCov_9fa48("66217"), {
      invariantId: INVARIANT_ID.MONOTONIC_STEPS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: stryMutAct_9fa48("66218") ? false : (stryCov_9fa48("66218"), true),
      reason: INVARIANT_REASON.STEPS_MONOTONIC
    }));
  }
}

/**
 * Determine whether a step transition is backward.
 * Uses numeric comparison when both values are finite numbers,
 * lexicographic comparison otherwise.
 *
 * @param {*} prev - Previous step value.
 * @param {*} next - Next step value.
 * @return {boolean} True when next < prev.
 */
function isBackwardStep(prev, next) {
  if (stryMutAct_9fa48("66219")) {
    {}
  } else {
    stryCov_9fa48("66219");
    if (stryMutAct_9fa48("66222") ? Number.isFinite(prev) || Number.isFinite(next) : stryMutAct_9fa48("66221") ? false : stryMutAct_9fa48("66220") ? true : (stryCov_9fa48("66220", "66221", "66222"), Number.isFinite(prev) && Number.isFinite(next))) {
      if (stryMutAct_9fa48("66223")) {
        {}
      } else {
        stryCov_9fa48("66223");
        return stryMutAct_9fa48("66227") ? next >= prev : stryMutAct_9fa48("66226") ? next <= prev : stryMutAct_9fa48("66225") ? false : stryMutAct_9fa48("66224") ? true : (stryCov_9fa48("66224", "66225", "66226", "66227"), next < prev);
      }
    }
    return stryMutAct_9fa48("66231") ? String(next) >= String(prev) : stryMutAct_9fa48("66230") ? String(next) <= String(prev) : stryMutAct_9fa48("66229") ? false : stryMutAct_9fa48("66228") ? true : (stryCov_9fa48("66228", "66229", "66230", "66231"), String(next) < String(prev));
  }
}

/**
 * Check claim exclusivity by operation id and owner key.
 *
 * Each (operationId, ownerKey) pair must have at most one active
 * claim. The state snapshot provides `claims`: an array of
 * `{operationId, ownerKey}` objects.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.claims - Active claim records.
 * @return {Object} Frozen invariant result.
 */
function checkClaimExclusivity(state) {
  if (stryMutAct_9fa48("66232")) {
    {}
  } else {
    stryCov_9fa48("66232");
    const claims = Array.isArray(stryMutAct_9fa48("66233") ? state.claims : (stryCov_9fa48("66233"), state?.claims)) ? state.claims : stryMutAct_9fa48("66234") ? ["Stryker was here"] : (stryCov_9fa48("66234"), []);
    const seen = new Map();
    const duplicates = stryMutAct_9fa48("66235") ? ["Stryker was here"] : (stryCov_9fa48("66235"), []);
    for (const claim of claims) {
      if (stryMutAct_9fa48("66236")) {
        {}
      } else {
        stryCov_9fa48("66236");
        const opId = stryMutAct_9fa48("66237") ? claim.operationId : (stryCov_9fa48("66237"), claim?.operationId);
        const ownerKey = stryMutAct_9fa48("66238") ? claim.ownerKey : (stryCov_9fa48("66238"), claim?.ownerKey);
        if (stryMutAct_9fa48("66241") ? typeof opId !== 'string' && opId.length === 0 : stryMutAct_9fa48("66240") ? false : stryMutAct_9fa48("66239") ? true : (stryCov_9fa48("66239", "66240", "66241"), (stryMutAct_9fa48("66243") ? typeof opId === 'string' : stryMutAct_9fa48("66242") ? false : (stryCov_9fa48("66242", "66243"), typeof opId !== (stryMutAct_9fa48("66244") ? "" : (stryCov_9fa48("66244"), 'string')))) || (stryMutAct_9fa48("66246") ? opId.length !== 0 : stryMutAct_9fa48("66245") ? false : (stryCov_9fa48("66245", "66246"), opId.length === 0)))) {
          if (stryMutAct_9fa48("66247")) {
            {}
          } else {
            stryCov_9fa48("66247");
            continue;
          }
        }
        if (stryMutAct_9fa48("66250") ? typeof ownerKey !== 'string' && ownerKey.length === 0 : stryMutAct_9fa48("66249") ? false : stryMutAct_9fa48("66248") ? true : (stryCov_9fa48("66248", "66249", "66250"), (stryMutAct_9fa48("66252") ? typeof ownerKey === 'string' : stryMutAct_9fa48("66251") ? false : (stryCov_9fa48("66251", "66252"), typeof ownerKey !== (stryMutAct_9fa48("66253") ? "" : (stryCov_9fa48("66253"), 'string')))) || (stryMutAct_9fa48("66255") ? ownerKey.length !== 0 : stryMutAct_9fa48("66254") ? false : (stryCov_9fa48("66254", "66255"), ownerKey.length === 0)))) {
          if (stryMutAct_9fa48("66256")) {
            {}
          } else {
            stryCov_9fa48("66256");
            continue;
          }
        }
        const compositeKey = stryMutAct_9fa48("66257") ? `` : (stryCov_9fa48("66257"), `${opId}:${ownerKey}`);
        const count = stryMutAct_9fa48("66258") ? (seen.get(compositeKey) || 0) - 1 : (stryCov_9fa48("66258"), (stryMutAct_9fa48("66261") ? seen.get(compositeKey) && 0 : stryMutAct_9fa48("66260") ? false : stryMutAct_9fa48("66259") ? true : (stryCov_9fa48("66259", "66260", "66261"), seen.get(compositeKey) || 0)) + 1);
        seen.set(compositeKey, count);
        if (stryMutAct_9fa48("66264") ? count !== 2 : stryMutAct_9fa48("66263") ? false : stryMutAct_9fa48("66262") ? true : (stryCov_9fa48("66262", "66263", "66264"), count === 2)) {
          if (stryMutAct_9fa48("66265")) {
            {}
          } else {
            stryCov_9fa48("66265");
            duplicates.push(Object.freeze(stryMutAct_9fa48("66266") ? {} : (stryCov_9fa48("66266"), {
              operationId: opId,
              ownerKey
            })));
          }
        }
      }
    }
    if (stryMutAct_9fa48("66270") ? duplicates.length <= 0 : stryMutAct_9fa48("66269") ? duplicates.length >= 0 : stryMutAct_9fa48("66268") ? false : stryMutAct_9fa48("66267") ? true : (stryCov_9fa48("66267", "66268", "66269", "66270"), duplicates.length > 0)) {
      if (stryMutAct_9fa48("66271")) {
        {}
      } else {
        stryCov_9fa48("66271");
        return buildInvariantResult(stryMutAct_9fa48("66272") ? {} : (stryCov_9fa48("66272"), {
          invariantId: INVARIANT_ID.CLAIM_EXCLUSIVITY,
          severity: INVARIANT_OUTCOME_SEVERITY.HARD,
          passed: stryMutAct_9fa48("66273") ? true : (stryCov_9fa48("66273"), false),
          reason: INVARIANT_REASON.DUPLICATE_CLAIM_DETECTED,
          context: stryMutAct_9fa48("66274") ? {} : (stryCov_9fa48("66274"), {
            duplicates: Object.freeze(duplicates)
          })
        }));
      }
    }
    return buildInvariantResult(stryMutAct_9fa48("66275") ? {} : (stryCov_9fa48("66275"), {
      invariantId: INVARIANT_ID.CLAIM_EXCLUSIVITY,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: stryMutAct_9fa48("66276") ? false : (stryCov_9fa48("66276"), true),
      reason: INVARIANT_REASON.CLAIMS_EXCLUSIVE
    }));
  }
}

/**
 * Check for orphan in-flight operations without owner keys.
 *
 * Every in-flight operation must have a corresponding owner key
 * in the reconcile queue. The state snapshot provides:
 *   - `inFlightOperations`: array of `{operationId, ownerKey?}`
 *   - `registeredOwnerKeys`: Set of owner keys with active
 *     reconcile registrations.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.inFlightOperations - In-flight ops.
 * @param {Set<string>} state.registeredOwnerKeys - Active keys.
 * @return {Object} Frozen invariant result.
 */
function checkOrphanInFlight(state) {
  if (stryMutAct_9fa48("66277")) {
    {}
  } else {
    stryCov_9fa48("66277");
    const operations = Array.isArray(stryMutAct_9fa48("66278") ? state.inFlightOperations : (stryCov_9fa48("66278"), state?.inFlightOperations)) ? state.inFlightOperations : stryMutAct_9fa48("66279") ? ["Stryker was here"] : (stryCov_9fa48("66279"), []);
    const registered = (stryMutAct_9fa48("66280") ? state.registeredOwnerKeys : (stryCov_9fa48("66280"), state?.registeredOwnerKeys)) instanceof Set ? state.registeredOwnerKeys : new Set();
    const orphans = stryMutAct_9fa48("66281") ? ["Stryker was here"] : (stryCov_9fa48("66281"), []);
    for (const op of operations) {
      if (stryMutAct_9fa48("66282")) {
        {}
      } else {
        stryCov_9fa48("66282");
        const opId = stryMutAct_9fa48("66283") ? op.operationId : (stryCov_9fa48("66283"), op?.operationId);
        const ownerKey = stryMutAct_9fa48("66284") ? op.ownerKey : (stryCov_9fa48("66284"), op?.ownerKey);
        if (stryMutAct_9fa48("66287") ? typeof opId !== 'string' && opId.length === 0 : stryMutAct_9fa48("66286") ? false : stryMutAct_9fa48("66285") ? true : (stryCov_9fa48("66285", "66286", "66287"), (stryMutAct_9fa48("66289") ? typeof opId === 'string' : stryMutAct_9fa48("66288") ? false : (stryCov_9fa48("66288", "66289"), typeof opId !== (stryMutAct_9fa48("66290") ? "" : (stryCov_9fa48("66290"), 'string')))) || (stryMutAct_9fa48("66292") ? opId.length !== 0 : stryMutAct_9fa48("66291") ? false : (stryCov_9fa48("66291", "66292"), opId.length === 0)))) {
          if (stryMutAct_9fa48("66293")) {
            {}
          } else {
            stryCov_9fa48("66293");
            continue;
          }
        }
        const hasOwner = stryMutAct_9fa48("66296") ? typeof ownerKey === 'string' && ownerKey.length > 0 || registered.has(ownerKey) : stryMutAct_9fa48("66295") ? false : stryMutAct_9fa48("66294") ? true : (stryCov_9fa48("66294", "66295", "66296"), (stryMutAct_9fa48("66298") ? typeof ownerKey === 'string' || ownerKey.length > 0 : stryMutAct_9fa48("66297") ? true : (stryCov_9fa48("66297", "66298"), (stryMutAct_9fa48("66300") ? typeof ownerKey !== 'string' : stryMutAct_9fa48("66299") ? true : (stryCov_9fa48("66299", "66300"), typeof ownerKey === (stryMutAct_9fa48("66301") ? "" : (stryCov_9fa48("66301"), 'string')))) && (stryMutAct_9fa48("66304") ? ownerKey.length <= 0 : stryMutAct_9fa48("66303") ? ownerKey.length >= 0 : stryMutAct_9fa48("66302") ? true : (stryCov_9fa48("66302", "66303", "66304"), ownerKey.length > 0)))) && registered.has(ownerKey));
        if (stryMutAct_9fa48("66307") ? false : stryMutAct_9fa48("66306") ? true : stryMutAct_9fa48("66305") ? hasOwner : (stryCov_9fa48("66305", "66306", "66307"), !hasOwner)) {
          if (stryMutAct_9fa48("66308")) {
            {}
          } else {
            stryCov_9fa48("66308");
            orphans.push(Object.freeze(stryMutAct_9fa48("66309") ? {} : (stryCov_9fa48("66309"), {
              operationId: opId,
              ownerKey: stryMutAct_9fa48("66312") ? ownerKey && null : stryMutAct_9fa48("66311") ? false : stryMutAct_9fa48("66310") ? true : (stryCov_9fa48("66310", "66311", "66312"), ownerKey || null)
            })));
          }
        }
      }
    }
    if (stryMutAct_9fa48("66316") ? orphans.length <= 0 : stryMutAct_9fa48("66315") ? orphans.length >= 0 : stryMutAct_9fa48("66314") ? false : stryMutAct_9fa48("66313") ? true : (stryCov_9fa48("66313", "66314", "66315", "66316"), orphans.length > 0)) {
      if (stryMutAct_9fa48("66317")) {
        {}
      } else {
        stryCov_9fa48("66317");
        return buildInvariantResult(stryMutAct_9fa48("66318") ? {} : (stryCov_9fa48("66318"), {
          invariantId: INVARIANT_ID.ORPHAN_IN_FLIGHT,
          severity: INVARIANT_OUTCOME_SEVERITY.SOFT,
          passed: stryMutAct_9fa48("66319") ? true : (stryCov_9fa48("66319"), false),
          reason: INVARIANT_REASON.ORPHAN_DETECTED,
          context: stryMutAct_9fa48("66320") ? {} : (stryCov_9fa48("66320"), {
            orphans: Object.freeze(orphans)
          })
        }));
      }
    }
    return buildInvariantResult(stryMutAct_9fa48("66321") ? {} : (stryCov_9fa48("66321"), {
      invariantId: INVARIANT_ID.ORPHAN_IN_FLIGHT,
      severity: INVARIANT_OUTCOME_SEVERITY.SOFT,
      passed: stryMutAct_9fa48("66322") ? false : (stryCov_9fa48("66322"), true),
      reason: INVARIANT_REASON.NO_ORPHANS
    }));
  }
}

/**
 * Check that owner-managed replica_operations fields have one writer only.
 *
 * The state snapshot provides `replicaOperationWrites`: an array of
 * `{operationId, writer, fields}` entries describing writes against
 * owner-managed workflow fields.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.replicaOperationWrites - Workflow writes.
 * @return {Object} Frozen invariant result.
 */
function checkReplicaOperationSingleWriter(state) {
  if (stryMutAct_9fa48("66323")) {
    {}
  } else {
    stryCov_9fa48("66323");
    const writes = Array.isArray(stryMutAct_9fa48("66324") ? state.replicaOperationWrites : (stryCov_9fa48("66324"), state?.replicaOperationWrites)) ? state.replicaOperationWrites : stryMutAct_9fa48("66325") ? ["Stryker was here"] : (stryCov_9fa48("66325"), []);
    const writesByOperation = new Map();
    for (const write of writes) {
      if (stryMutAct_9fa48("66326")) {
        {}
      } else {
        stryCov_9fa48("66326");
        const operationId = stryMutAct_9fa48("66327") ? write.operationId : (stryCov_9fa48("66327"), write?.operationId);
        const writer = stryMutAct_9fa48("66328") ? write.writer : (stryCov_9fa48("66328"), write?.writer);
        const fields = Array.isArray(stryMutAct_9fa48("66329") ? write.fields : (stryCov_9fa48("66329"), write?.fields)) ? write.fields : stryMutAct_9fa48("66330") ? ["Stryker was here"] : (stryCov_9fa48("66330"), []);
        if (stryMutAct_9fa48("66333") ? typeof operationId !== 'string' && operationId.length === 0 : stryMutAct_9fa48("66332") ? false : stryMutAct_9fa48("66331") ? true : (stryCov_9fa48("66331", "66332", "66333"), (stryMutAct_9fa48("66335") ? typeof operationId === 'string' : stryMutAct_9fa48("66334") ? false : (stryCov_9fa48("66334", "66335"), typeof operationId !== (stryMutAct_9fa48("66336") ? "" : (stryCov_9fa48("66336"), 'string')))) || (stryMutAct_9fa48("66338") ? operationId.length !== 0 : stryMutAct_9fa48("66337") ? false : (stryCov_9fa48("66337", "66338"), operationId.length === 0)))) {
          if (stryMutAct_9fa48("66339")) {
            {}
          } else {
            stryCov_9fa48("66339");
            continue;
          }
        }
        if (stryMutAct_9fa48("66342") ? typeof writer !== 'string' && writer.length === 0 : stryMutAct_9fa48("66341") ? false : stryMutAct_9fa48("66340") ? true : (stryCov_9fa48("66340", "66341", "66342"), (stryMutAct_9fa48("66344") ? typeof writer === 'string' : stryMutAct_9fa48("66343") ? false : (stryCov_9fa48("66343", "66344"), typeof writer !== (stryMutAct_9fa48("66345") ? "" : (stryCov_9fa48("66345"), 'string')))) || (stryMutAct_9fa48("66347") ? writer.length !== 0 : stryMutAct_9fa48("66346") ? false : (stryCov_9fa48("66346", "66347"), writer.length === 0)))) {
          if (stryMutAct_9fa48("66348")) {
            {}
          } else {
            stryCov_9fa48("66348");
            continue;
          }
        }
        const ownerFields = stryMutAct_9fa48("66349") ? fields : (stryCov_9fa48("66349"), fields.filter(stryMutAct_9fa48("66350") ? () => undefined : (stryCov_9fa48("66350"), field => REPLICA_OPERATION_OWNER_FIELDS.has(field))));
        if (stryMutAct_9fa48("66353") ? ownerFields.length !== 0 : stryMutAct_9fa48("66352") ? false : stryMutAct_9fa48("66351") ? true : (stryCov_9fa48("66351", "66352", "66353"), ownerFields.length === 0)) {
          if (stryMutAct_9fa48("66354")) {
            {}
          } else {
            stryCov_9fa48("66354");
            continue;
          }
        }
        if (stryMutAct_9fa48("66357") ? false : stryMutAct_9fa48("66356") ? true : stryMutAct_9fa48("66355") ? writesByOperation.has(operationId) : (stryCov_9fa48("66355", "66356", "66357"), !writesByOperation.has(operationId))) {
          if (stryMutAct_9fa48("66358")) {
            {}
          } else {
            stryCov_9fa48("66358");
            writesByOperation.set(operationId, stryMutAct_9fa48("66359") ? {} : (stryCov_9fa48("66359"), {
              writers: new Set(),
              ownerFields: new Set()
            }));
          }
        }
        const entry = writesByOperation.get(operationId);
        entry.writers.add(writer);
        for (const field of ownerFields) {
          if (stryMutAct_9fa48("66360")) {
            {}
          } else {
            stryCov_9fa48("66360");
            entry.ownerFields.add(field);
          }
        }
      }
    }
    const violations = stryMutAct_9fa48("66361") ? ["Stryker was here"] : (stryCov_9fa48("66361"), []);
    for (const [operationId, entry] of writesByOperation.entries()) {
      if (stryMutAct_9fa48("66362")) {
        {}
      } else {
        stryCov_9fa48("66362");
        const writers = stryMutAct_9fa48("66363") ? [...entry.writers] : (stryCov_9fa48("66363"), (stryMutAct_9fa48("66364") ? [] : (stryCov_9fa48("66364"), [...entry.writers])).sort());
        if (stryMutAct_9fa48("66367") ? writers.length === 1 || writers[0] === REPLICA_OPERATION_CANONICAL_OWNER : stryMutAct_9fa48("66366") ? false : stryMutAct_9fa48("66365") ? true : (stryCov_9fa48("66365", "66366", "66367"), (stryMutAct_9fa48("66369") ? writers.length !== 1 : stryMutAct_9fa48("66368") ? true : (stryCov_9fa48("66368", "66369"), writers.length === 1)) && (stryMutAct_9fa48("66371") ? writers[0] !== REPLICA_OPERATION_CANONICAL_OWNER : stryMutAct_9fa48("66370") ? true : (stryCov_9fa48("66370", "66371"), writers[0] === REPLICA_OPERATION_CANONICAL_OWNER)))) {
          if (stryMutAct_9fa48("66372")) {
            {}
          } else {
            stryCov_9fa48("66372");
            continue;
          }
        }
        violations.push(Object.freeze(stryMutAct_9fa48("66373") ? {} : (stryCov_9fa48("66373"), {
          operationId,
          canonicalOwner: REPLICA_OPERATION_CANONICAL_OWNER,
          writers: Object.freeze(writers),
          ownerFields: Object.freeze(stryMutAct_9fa48("66374") ? [...entry.ownerFields] : (stryCov_9fa48("66374"), (stryMutAct_9fa48("66375") ? [] : (stryCov_9fa48("66375"), [...entry.ownerFields])).sort()))
        })));
      }
    }
    if (stryMutAct_9fa48("66379") ? violations.length <= 0 : stryMutAct_9fa48("66378") ? violations.length >= 0 : stryMutAct_9fa48("66377") ? false : stryMutAct_9fa48("66376") ? true : (stryCov_9fa48("66376", "66377", "66378", "66379"), violations.length > 0)) {
      if (stryMutAct_9fa48("66380")) {
        {}
      } else {
        stryCov_9fa48("66380");
        return buildInvariantResult(stryMutAct_9fa48("66381") ? {} : (stryCov_9fa48("66381"), {
          invariantId: INVARIANT_ID.CONTROL_PLANE_REPLICA_OPERATIONS_SINGLE_WRITER,
          severity: INVARIANT_OUTCOME_SEVERITY.HARD,
          passed: stryMutAct_9fa48("66382") ? true : (stryCov_9fa48("66382"), false),
          reason: INVARIANT_REASON.REPLICA_OPERATION_MULTI_WRITER_DETECTED,
          context: stryMutAct_9fa48("66383") ? {} : (stryCov_9fa48("66383"), {
            violations: Object.freeze(violations)
          })
        }));
      }
    }
    return buildInvariantResult(stryMutAct_9fa48("66384") ? {} : (stryCov_9fa48("66384"), {
      invariantId: INVARIANT_ID.CONTROL_PLANE_REPLICA_OPERATIONS_SINGLE_WRITER,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: stryMutAct_9fa48("66385") ? false : (stryCov_9fa48("66385"), true),
      reason: INVARIANT_REASON.REPLICA_OPERATION_SINGLE_WRITER
    }));
  }
}

/**
 * Check that executor-owned phase boundaries advance only after acknowledgement.
 *
 * The state snapshot provides `phaseAdvances`: an array of
 * `{workflowId, participantKey, acknowledged, acknowledgedAt, advancedAt}`.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.phaseAdvances - Phase transition evidence.
 * @return {Object} Frozen invariant result.
 */
function checkAckBeforeAdvance(state) {
  if (stryMutAct_9fa48("66386")) {
    {}
  } else {
    stryCov_9fa48("66386");
    const phaseAdvances = Array.isArray(stryMutAct_9fa48("66387") ? state.phaseAdvances : (stryCov_9fa48("66387"), state?.phaseAdvances)) ? state.phaseAdvances : stryMutAct_9fa48("66388") ? ["Stryker was here"] : (stryCov_9fa48("66388"), []);
    const violations = stryMutAct_9fa48("66389") ? ["Stryker was here"] : (stryCov_9fa48("66389"), []);
    for (const entry of phaseAdvances) {
      if (stryMutAct_9fa48("66390")) {
        {}
      } else {
        stryCov_9fa48("66390");
        const advancedAt = toFiniteTimestamp(stryMutAct_9fa48("66391") ? entry.advancedAt : (stryCov_9fa48("66391"), entry?.advancedAt));
        if (stryMutAct_9fa48("66394") ? false : stryMutAct_9fa48("66393") ? true : stryMutAct_9fa48("66392") ? Number.isFinite(advancedAt) : (stryCov_9fa48("66392", "66393", "66394"), !Number.isFinite(advancedAt))) {
          if (stryMutAct_9fa48("66395")) {
            {}
          } else {
            stryCov_9fa48("66395");
            continue;
          }
        }
        const acknowledged = stryMutAct_9fa48("66398") ? entry?.acknowledged !== true : stryMutAct_9fa48("66397") ? false : stryMutAct_9fa48("66396") ? true : (stryCov_9fa48("66396", "66397", "66398"), (stryMutAct_9fa48("66399") ? entry.acknowledged : (stryCov_9fa48("66399"), entry?.acknowledged)) === (stryMutAct_9fa48("66400") ? false : (stryCov_9fa48("66400"), true)));
        const acknowledgedAt = toFiniteTimestamp(stryMutAct_9fa48("66401") ? entry.acknowledgedAt : (stryCov_9fa48("66401"), entry?.acknowledgedAt));
        if (stryMutAct_9fa48("66404") ? acknowledged && Number.isFinite(acknowledgedAt) || acknowledgedAt <= advancedAt : stryMutAct_9fa48("66403") ? false : stryMutAct_9fa48("66402") ? true : (stryCov_9fa48("66402", "66403", "66404"), (stryMutAct_9fa48("66406") ? acknowledged || Number.isFinite(acknowledgedAt) : stryMutAct_9fa48("66405") ? true : (stryCov_9fa48("66405", "66406"), acknowledged && Number.isFinite(acknowledgedAt))) && (stryMutAct_9fa48("66409") ? acknowledgedAt > advancedAt : stryMutAct_9fa48("66408") ? acknowledgedAt < advancedAt : stryMutAct_9fa48("66407") ? true : (stryCov_9fa48("66407", "66408", "66409"), acknowledgedAt <= advancedAt)))) {
          if (stryMutAct_9fa48("66410")) {
            {}
          } else {
            stryCov_9fa48("66410");
            continue;
          }
        }
        violations.push(Object.freeze(stryMutAct_9fa48("66411") ? {} : (stryCov_9fa48("66411"), {
          workflowId: stryMutAct_9fa48("66414") ? entry?.workflowId && null : stryMutAct_9fa48("66413") ? false : stryMutAct_9fa48("66412") ? true : (stryCov_9fa48("66412", "66413", "66414"), (stryMutAct_9fa48("66415") ? entry.workflowId : (stryCov_9fa48("66415"), entry?.workflowId)) || null),
          participantKey: stryMutAct_9fa48("66418") ? entry?.participantKey && null : stryMutAct_9fa48("66417") ? false : stryMutAct_9fa48("66416") ? true : (stryCov_9fa48("66416", "66417", "66418"), (stryMutAct_9fa48("66419") ? entry.participantKey : (stryCov_9fa48("66419"), entry?.participantKey)) || null),
          acknowledged,
          acknowledgedAt: stryMutAct_9fa48("66420") ? acknowledgedAt && null : (stryCov_9fa48("66420"), acknowledgedAt ?? null),
          advancedAt
        })));
      }
    }
    if (stryMutAct_9fa48("66424") ? violations.length <= 0 : stryMutAct_9fa48("66423") ? violations.length >= 0 : stryMutAct_9fa48("66422") ? false : stryMutAct_9fa48("66421") ? true : (stryCov_9fa48("66421", "66422", "66423", "66424"), violations.length > 0)) {
      if (stryMutAct_9fa48("66425")) {
        {}
      } else {
        stryCov_9fa48("66425");
        return buildInvariantResult(stryMutAct_9fa48("66426") ? {} : (stryCov_9fa48("66426"), {
          invariantId: INVARIANT_ID.CONTROL_PLANE_ACK_BEFORE_ADVANCE,
          severity: INVARIANT_OUTCOME_SEVERITY.HARD,
          passed: stryMutAct_9fa48("66427") ? true : (stryCov_9fa48("66427"), false),
          reason: INVARIANT_REASON.PHASE_ADVANCED_WITHOUT_ACK,
          context: stryMutAct_9fa48("66428") ? {} : (stryCov_9fa48("66428"), {
            violations: Object.freeze(violations)
          })
        }));
      }
    }
    return buildInvariantResult(stryMutAct_9fa48("66429") ? {} : (stryCov_9fa48("66429"), {
      invariantId: INVARIANT_ID.CONTROL_PLANE_ACK_BEFORE_ADVANCE,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: stryMutAct_9fa48("66430") ? false : (stryCov_9fa48("66430"), true),
      reason: INVARIANT_REASON.ACK_BEFORE_ADVANCE_ENFORCED
    }));
  }
}

/**
 * Check that resumable split workflows persist complete recovery state.
 *
 * The state snapshot provides `splitResumes`: an array of
 * `{workflowId?, metadata?, status, participants?, sourceCheckpoint?,
 *   requiresResume, requiresSourceCheckpoint?}`.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.splitResumes - Resumable split workflows.
 * @return {Object} Frozen invariant result.
 */
function checkSplitResumeCompleteness(state) {
  if (stryMutAct_9fa48("66431")) {
    {}
  } else {
    stryCov_9fa48("66431");
    const splitResumes = Array.isArray(stryMutAct_9fa48("66432") ? state.splitResumes : (stryCov_9fa48("66432"), state?.splitResumes)) ? state.splitResumes : stryMutAct_9fa48("66433") ? ["Stryker was here"] : (stryCov_9fa48("66433"), []);
    const violations = stryMutAct_9fa48("66434") ? ["Stryker was here"] : (stryCov_9fa48("66434"), []);
    for (const entry of splitResumes) {
      if (stryMutAct_9fa48("66435")) {
        {}
      } else {
        stryCov_9fa48("66435");
        if (stryMutAct_9fa48("66438") ? entry?.requiresResume === true : stryMutAct_9fa48("66437") ? false : stryMutAct_9fa48("66436") ? true : (stryCov_9fa48("66436", "66437", "66438"), (stryMutAct_9fa48("66439") ? entry.requiresResume : (stryCov_9fa48("66439"), entry?.requiresResume)) !== (stryMutAct_9fa48("66440") ? false : (stryCov_9fa48("66440"), true)))) {
          if (stryMutAct_9fa48("66441")) {
            {}
          } else {
            stryCov_9fa48("66441");
            continue;
          }
        }
        const metadata = isRecord(stryMutAct_9fa48("66442") ? entry.metadata : (stryCov_9fa48("66442"), entry?.metadata)) ? entry.metadata : {};
        const workflowId = (stryMutAct_9fa48("66445") ? typeof entry?.workflowId === 'string' || entry.workflowId.length > 0 : stryMutAct_9fa48("66444") ? false : stryMutAct_9fa48("66443") ? true : (stryCov_9fa48("66443", "66444", "66445"), (stryMutAct_9fa48("66447") ? typeof entry?.workflowId !== 'string' : stryMutAct_9fa48("66446") ? true : (stryCov_9fa48("66446", "66447"), typeof (stryMutAct_9fa48("66448") ? entry.workflowId : (stryCov_9fa48("66448"), entry?.workflowId)) === (stryMutAct_9fa48("66449") ? "" : (stryCov_9fa48("66449"), 'string')))) && (stryMutAct_9fa48("66452") ? entry.workflowId.length <= 0 : stryMutAct_9fa48("66451") ? entry.workflowId.length >= 0 : stryMutAct_9fa48("66450") ? true : (stryCov_9fa48("66450", "66451", "66452"), entry.workflowId.length > 0)))) ? entry.workflowId : metadata.workflowId;
        const participants = isRecord(stryMutAct_9fa48("66453") ? entry.participants : (stryCov_9fa48("66453"), entry?.participants)) ? entry.participants : isRecord(metadata.participants) ? metadata.participants : null;
        const sourceCheckpoint = isRecord(stryMutAct_9fa48("66454") ? entry.sourceCheckpoint : (stryCov_9fa48("66454"), entry?.sourceCheckpoint)) ? entry.sourceCheckpoint : isRecord(metadata.sourceCheckpoint) ? metadata.sourceCheckpoint : null;
        const missingFields = stryMutAct_9fa48("66455") ? ["Stryker was here"] : (stryCov_9fa48("66455"), []);
        if (stryMutAct_9fa48("66458") ? typeof workflowId !== 'string' && workflowId.length === 0 : stryMutAct_9fa48("66457") ? false : stryMutAct_9fa48("66456") ? true : (stryCov_9fa48("66456", "66457", "66458"), (stryMutAct_9fa48("66460") ? typeof workflowId === 'string' : stryMutAct_9fa48("66459") ? false : (stryCov_9fa48("66459", "66460"), typeof workflowId !== (stryMutAct_9fa48("66461") ? "" : (stryCov_9fa48("66461"), 'string')))) || (stryMutAct_9fa48("66463") ? workflowId.length !== 0 : stryMutAct_9fa48("66462") ? false : (stryCov_9fa48("66462", "66463"), workflowId.length === 0)))) {
          if (stryMutAct_9fa48("66464")) {
            {}
          } else {
            stryCov_9fa48("66464");
            missingFields.push(stryMutAct_9fa48("66465") ? "" : (stryCov_9fa48("66465"), 'workflowId'));
          }
        }
        if (stryMutAct_9fa48("66468") ? typeof entry?.status !== 'string' && entry.status.length === 0 : stryMutAct_9fa48("66467") ? false : stryMutAct_9fa48("66466") ? true : (stryCov_9fa48("66466", "66467", "66468"), (stryMutAct_9fa48("66470") ? typeof entry?.status === 'string' : stryMutAct_9fa48("66469") ? false : (stryCov_9fa48("66469", "66470"), typeof (stryMutAct_9fa48("66471") ? entry.status : (stryCov_9fa48("66471"), entry?.status)) !== (stryMutAct_9fa48("66472") ? "" : (stryCov_9fa48("66472"), 'string')))) || (stryMutAct_9fa48("66474") ? entry.status.length !== 0 : stryMutAct_9fa48("66473") ? false : (stryCov_9fa48("66473", "66474"), entry.status.length === 0)))) {
          if (stryMutAct_9fa48("66475")) {
            {}
          } else {
            stryCov_9fa48("66475");
            missingFields.push(stryMutAct_9fa48("66476") ? "" : (stryCov_9fa48("66476"), 'status'));
          }
        }
        if (stryMutAct_9fa48("66479") ? !participants && Object.keys(participants).length === 0 : stryMutAct_9fa48("66478") ? false : stryMutAct_9fa48("66477") ? true : (stryCov_9fa48("66477", "66478", "66479"), (stryMutAct_9fa48("66480") ? participants : (stryCov_9fa48("66480"), !participants)) || (stryMutAct_9fa48("66482") ? Object.keys(participants).length !== 0 : stryMutAct_9fa48("66481") ? false : (stryCov_9fa48("66481", "66482"), Object.keys(participants).length === 0)))) {
          if (stryMutAct_9fa48("66483")) {
            {}
          } else {
            stryCov_9fa48("66483");
            missingFields.push(stryMutAct_9fa48("66484") ? "" : (stryCov_9fa48("66484"), 'participants'));
          }
        }
        if (stryMutAct_9fa48("66487") ? entry?.requiresSourceCheckpoint === true || !sourceCheckpoint : stryMutAct_9fa48("66486") ? false : stryMutAct_9fa48("66485") ? true : (stryCov_9fa48("66485", "66486", "66487"), (stryMutAct_9fa48("66489") ? entry?.requiresSourceCheckpoint !== true : stryMutAct_9fa48("66488") ? true : (stryCov_9fa48("66488", "66489"), (stryMutAct_9fa48("66490") ? entry.requiresSourceCheckpoint : (stryCov_9fa48("66490"), entry?.requiresSourceCheckpoint)) === (stryMutAct_9fa48("66491") ? false : (stryCov_9fa48("66491"), true)))) && (stryMutAct_9fa48("66492") ? sourceCheckpoint : (stryCov_9fa48("66492"), !sourceCheckpoint)))) {
          if (stryMutAct_9fa48("66493")) {
            {}
          } else {
            stryCov_9fa48("66493");
            missingFields.push(stryMutAct_9fa48("66494") ? "" : (stryCov_9fa48("66494"), 'sourceCheckpoint'));
          }
        }
        if (stryMutAct_9fa48("66498") ? missingFields.length <= 0 : stryMutAct_9fa48("66497") ? missingFields.length >= 0 : stryMutAct_9fa48("66496") ? false : stryMutAct_9fa48("66495") ? true : (stryCov_9fa48("66495", "66496", "66497", "66498"), missingFields.length > 0)) {
          if (stryMutAct_9fa48("66499")) {
            {}
          } else {
            stryCov_9fa48("66499");
            violations.push(Object.freeze(stryMutAct_9fa48("66500") ? {} : (stryCov_9fa48("66500"), {
              workflowId: (stryMutAct_9fa48("66503") ? typeof workflowId !== 'string' : stryMutAct_9fa48("66502") ? false : stryMutAct_9fa48("66501") ? true : (stryCov_9fa48("66501", "66502", "66503"), typeof workflowId === (stryMutAct_9fa48("66504") ? "" : (stryCov_9fa48("66504"), 'string')))) ? workflowId : null,
              status: (stryMutAct_9fa48("66507") ? typeof entry?.status !== 'string' : stryMutAct_9fa48("66506") ? false : stryMutAct_9fa48("66505") ? true : (stryCov_9fa48("66505", "66506", "66507"), typeof (stryMutAct_9fa48("66508") ? entry.status : (stryCov_9fa48("66508"), entry?.status)) === (stryMutAct_9fa48("66509") ? "" : (stryCov_9fa48("66509"), 'string')))) ? entry.status : null,
              missingFields: Object.freeze(missingFields)
            })));
          }
        }
      }
    }
    if (stryMutAct_9fa48("66513") ? violations.length <= 0 : stryMutAct_9fa48("66512") ? violations.length >= 0 : stryMutAct_9fa48("66511") ? false : stryMutAct_9fa48("66510") ? true : (stryCov_9fa48("66510", "66511", "66512", "66513"), violations.length > 0)) {
      if (stryMutAct_9fa48("66514")) {
        {}
      } else {
        stryCov_9fa48("66514");
        return buildInvariantResult(stryMutAct_9fa48("66515") ? {} : (stryCov_9fa48("66515"), {
          invariantId: INVARIANT_ID.CONTROL_PLANE_SPLIT_RESUME_COMPLETENESS,
          severity: INVARIANT_OUTCOME_SEVERITY.HARD,
          passed: stryMutAct_9fa48("66516") ? true : (stryCov_9fa48("66516"), false),
          reason: INVARIANT_REASON.SPLIT_RESUME_INCOMPLETE,
          context: stryMutAct_9fa48("66517") ? {} : (stryCov_9fa48("66517"), {
            violations: Object.freeze(violations)
          })
        }));
      }
    }
    return buildInvariantResult(stryMutAct_9fa48("66518") ? {} : (stryCov_9fa48("66518"), {
      invariantId: INVARIANT_ID.CONTROL_PLANE_SPLIT_RESUME_COMPLETENESS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: stryMutAct_9fa48("66519") ? false : (stryCov_9fa48("66519"), true),
      reason: INVARIANT_REASON.SPLIT_RESUME_COMPLETE
    }));
  }
}

/**
 * Check that readiness consumers use the canonical readiness dimension.
 *
 * The state snapshot provides `readinessDecisions`: an array of
 * `{consumer, nodeId?, decisionDimension, repairEligible, serveEligible,
 *   consumerOutcome?}` entries.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.readinessDecisions - Readiness decisions.
 * @return {Object} Frozen invariant result.
 */
function checkReadinessDimensionCorrectness(state) {
  if (stryMutAct_9fa48("66520")) {
    {}
  } else {
    stryCov_9fa48("66520");
    const decisions = Array.isArray(stryMutAct_9fa48("66521") ? state.readinessDecisions : (stryCov_9fa48("66521"), state?.readinessDecisions)) ? state.readinessDecisions : stryMutAct_9fa48("66522") ? ["Stryker was here"] : (stryCov_9fa48("66522"), []);
    const violations = stryMutAct_9fa48("66523") ? ["Stryker was here"] : (stryCov_9fa48("66523"), []);
    for (const decision of decisions) {
      if (stryMutAct_9fa48("66524")) {
        {}
      } else {
        stryCov_9fa48("66524");
        const consumer = (stryMutAct_9fa48("66527") ? typeof decision?.consumer !== 'string' : stryMutAct_9fa48("66526") ? false : stryMutAct_9fa48("66525") ? true : (stryCov_9fa48("66525", "66526", "66527"), typeof (stryMutAct_9fa48("66528") ? decision.consumer : (stryCov_9fa48("66528"), decision?.consumer)) === (stryMutAct_9fa48("66529") ? "" : (stryCov_9fa48("66529"), 'string')))) ? decision.consumer : null;
        const decisionDimension = (stryMutAct_9fa48("66532") ? typeof decision?.decisionDimension !== 'string' : stryMutAct_9fa48("66531") ? false : stryMutAct_9fa48("66530") ? true : (stryCov_9fa48("66530", "66531", "66532"), typeof (stryMutAct_9fa48("66533") ? decision.decisionDimension : (stryCov_9fa48("66533"), decision?.decisionDimension)) === (stryMutAct_9fa48("66534") ? "" : (stryCov_9fa48("66534"), 'string')))) ? decision.decisionDimension : null;
        const repairEligible = stryMutAct_9fa48("66537") ? decision?.repairEligible !== true : stryMutAct_9fa48("66536") ? false : stryMutAct_9fa48("66535") ? true : (stryCov_9fa48("66535", "66536", "66537"), (stryMutAct_9fa48("66538") ? decision.repairEligible : (stryCov_9fa48("66538"), decision?.repairEligible)) === (stryMutAct_9fa48("66539") ? false : (stryCov_9fa48("66539"), true)));
        const serveEligible = stryMutAct_9fa48("66542") ? decision?.serveEligible !== true : stryMutAct_9fa48("66541") ? false : stryMutAct_9fa48("66540") ? true : (stryCov_9fa48("66540", "66541", "66542"), (stryMutAct_9fa48("66543") ? decision.serveEligible : (stryCov_9fa48("66543"), decision?.serveEligible)) === (stryMutAct_9fa48("66544") ? false : (stryCov_9fa48("66544"), true)));
        const consumerOutcome = (stryMutAct_9fa48("66547") ? typeof decision?.consumerOutcome !== 'boolean' : stryMutAct_9fa48("66546") ? false : stryMutAct_9fa48("66545") ? true : (stryCov_9fa48("66545", "66546", "66547"), typeof (stryMutAct_9fa48("66548") ? decision.consumerOutcome : (stryCov_9fa48("66548"), decision?.consumerOutcome)) === (stryMutAct_9fa48("66549") ? "" : (stryCov_9fa48("66549"), 'boolean')))) ? decision.consumerOutcome : (stryMutAct_9fa48("66552") ? typeof decision?.allowed !== 'boolean' : stryMutAct_9fa48("66551") ? false : stryMutAct_9fa48("66550") ? true : (stryCov_9fa48("66550", "66551", "66552"), typeof (stryMutAct_9fa48("66553") ? decision.allowed : (stryCov_9fa48("66553"), decision?.allowed)) === (stryMutAct_9fa48("66554") ? "" : (stryCov_9fa48("66554"), 'boolean')))) ? decision.allowed : null;
        const expectedDimension = INTERNAL_TOPOLOGY_READINESS_CONSUMERS.has(consumer) ? CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE : EXTERNAL_SERVE_READINESS_CONSUMERS.has(consumer) ? CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE : null;
        if (stryMutAct_9fa48("66557") ? serveEligible || !repairEligible : stryMutAct_9fa48("66556") ? false : stryMutAct_9fa48("66555") ? true : (stryCov_9fa48("66555", "66556", "66557"), serveEligible && (stryMutAct_9fa48("66558") ? repairEligible : (stryCov_9fa48("66558"), !repairEligible)))) {
          if (stryMutAct_9fa48("66559")) {
            {}
          } else {
            stryCov_9fa48("66559");
            violations.push(Object.freeze(stryMutAct_9fa48("66560") ? {} : (stryCov_9fa48("66560"), {
              consumer,
              nodeId: stryMutAct_9fa48("66563") ? decision?.nodeId && null : stryMutAct_9fa48("66562") ? false : stryMutAct_9fa48("66561") ? true : (stryCov_9fa48("66561", "66562", "66563"), (stryMutAct_9fa48("66564") ? decision.nodeId : (stryCov_9fa48("66564"), decision?.nodeId)) || null),
              decisionDimension,
              expectedDimension,
              repairEligible,
              serveEligible,
              consumerOutcome,
              violationType: stryMutAct_9fa48("66565") ? "" : (stryCov_9fa48("66565"), 'serve_without_repair')
            })));
            continue;
          }
        }
        if (stryMutAct_9fa48("66568") ? expectedDimension || decisionDimension !== expectedDimension : stryMutAct_9fa48("66567") ? false : stryMutAct_9fa48("66566") ? true : (stryCov_9fa48("66566", "66567", "66568"), expectedDimension && (stryMutAct_9fa48("66570") ? decisionDimension === expectedDimension : stryMutAct_9fa48("66569") ? true : (stryCov_9fa48("66569", "66570"), decisionDimension !== expectedDimension)))) {
          if (stryMutAct_9fa48("66571")) {
            {}
          } else {
            stryCov_9fa48("66571");
            violations.push(Object.freeze(stryMutAct_9fa48("66572") ? {} : (stryCov_9fa48("66572"), {
              consumer,
              nodeId: stryMutAct_9fa48("66575") ? decision?.nodeId && null : stryMutAct_9fa48("66574") ? false : stryMutAct_9fa48("66573") ? true : (stryCov_9fa48("66573", "66574", "66575"), (stryMutAct_9fa48("66576") ? decision.nodeId : (stryCov_9fa48("66576"), decision?.nodeId)) || null),
              decisionDimension,
              expectedDimension,
              repairEligible,
              serveEligible,
              consumerOutcome,
              violationType: stryMutAct_9fa48("66577") ? "" : (stryCov_9fa48("66577"), 'wrong_dimension')
            })));
            continue;
          }
        }
        if (stryMutAct_9fa48("66580") ? expectedDimension || consumerOutcome !== null : stryMutAct_9fa48("66579") ? false : stryMutAct_9fa48("66578") ? true : (stryCov_9fa48("66578", "66579", "66580"), expectedDimension && (stryMutAct_9fa48("66582") ? consumerOutcome === null : stryMutAct_9fa48("66581") ? true : (stryCov_9fa48("66581", "66582"), consumerOutcome !== null)))) {
          if (stryMutAct_9fa48("66583")) {
            {}
          } else {
            stryCov_9fa48("66583");
            const expectedOutcome = (stryMutAct_9fa48("66586") ? expectedDimension !== CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE : stryMutAct_9fa48("66585") ? false : stryMutAct_9fa48("66584") ? true : (stryCov_9fa48("66584", "66585", "66586"), expectedDimension === CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE)) ? repairEligible : serveEligible;
            if (stryMutAct_9fa48("66589") ? consumerOutcome === expectedOutcome : stryMutAct_9fa48("66588") ? false : stryMutAct_9fa48("66587") ? true : (stryCov_9fa48("66587", "66588", "66589"), consumerOutcome !== expectedOutcome)) {
              if (stryMutAct_9fa48("66590")) {
                {}
              } else {
                stryCov_9fa48("66590");
                violations.push(Object.freeze(stryMutAct_9fa48("66591") ? {} : (stryCov_9fa48("66591"), {
                  consumer,
                  nodeId: stryMutAct_9fa48("66594") ? decision?.nodeId && null : stryMutAct_9fa48("66593") ? false : stryMutAct_9fa48("66592") ? true : (stryCov_9fa48("66592", "66593", "66594"), (stryMutAct_9fa48("66595") ? decision.nodeId : (stryCov_9fa48("66595"), decision?.nodeId)) || null),
                  decisionDimension,
                  expectedDimension,
                  repairEligible,
                  serveEligible,
                  consumerOutcome,
                  violationType: stryMutAct_9fa48("66596") ? "" : (stryCov_9fa48("66596"), 'outcome_mismatch')
                })));
              }
            }
          }
        }
      }
    }
    if (stryMutAct_9fa48("66600") ? violations.length <= 0 : stryMutAct_9fa48("66599") ? violations.length >= 0 : stryMutAct_9fa48("66598") ? false : stryMutAct_9fa48("66597") ? true : (stryCov_9fa48("66597", "66598", "66599", "66600"), violations.length > 0)) {
      if (stryMutAct_9fa48("66601")) {
        {}
      } else {
        stryCov_9fa48("66601");
        return buildInvariantResult(stryMutAct_9fa48("66602") ? {} : (stryCov_9fa48("66602"), {
          invariantId: INVARIANT_ID.CONTROL_PLANE_READINESS_DIMENSION_CORRECTNESS,
          severity: INVARIANT_OUTCOME_SEVERITY.HARD,
          passed: stryMutAct_9fa48("66603") ? true : (stryCov_9fa48("66603"), false),
          reason: INVARIANT_REASON.READINESS_DIMENSION_INCORRECT,
          context: stryMutAct_9fa48("66604") ? {} : (stryCov_9fa48("66604"), {
            violations: Object.freeze(violations)
          })
        }));
      }
    }
    return buildInvariantResult(stryMutAct_9fa48("66605") ? {} : (stryCov_9fa48("66605"), {
      invariantId: INVARIANT_ID.CONTROL_PLANE_READINESS_DIMENSION_CORRECTNESS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: stryMutAct_9fa48("66606") ? false : (stryCov_9fa48("66606"), true),
      reason: INVARIANT_REASON.READINESS_DIMENSION_CORRECT
    }));
  }
}

/**
 * Check that atomic topology transitions only run with a transaction coordinator.
 *
 * The state snapshot provides `atomicTransitions`: an array of
 * `{transitionId, ownerComponent?, requiresTransactionCoordinator,
 *   hasTransactionCoordinator}` entries.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.atomicTransitions - Atomic transition evidence.
 * @return {Object} Frozen invariant result.
 */
function checkTransactionAvailability(state) {
  if (stryMutAct_9fa48("66607")) {
    {}
  } else {
    stryCov_9fa48("66607");
    const atomicTransitions = Array.isArray(stryMutAct_9fa48("66608") ? state.atomicTransitions : (stryCov_9fa48("66608"), state?.atomicTransitions)) ? state.atomicTransitions : stryMutAct_9fa48("66609") ? ["Stryker was here"] : (stryCov_9fa48("66609"), []);
    const violations = stryMutAct_9fa48("66610") ? ["Stryker was here"] : (stryCov_9fa48("66610"), []);
    for (const transition of atomicTransitions) {
      if (stryMutAct_9fa48("66611")) {
        {}
      } else {
        stryCov_9fa48("66611");
        if (stryMutAct_9fa48("66614") ? transition?.requiresTransactionCoordinator === true : stryMutAct_9fa48("66613") ? false : stryMutAct_9fa48("66612") ? true : (stryCov_9fa48("66612", "66613", "66614"), (stryMutAct_9fa48("66615") ? transition.requiresTransactionCoordinator : (stryCov_9fa48("66615"), transition?.requiresTransactionCoordinator)) !== (stryMutAct_9fa48("66616") ? false : (stryCov_9fa48("66616"), true)))) {
          if (stryMutAct_9fa48("66617")) {
            {}
          } else {
            stryCov_9fa48("66617");
            continue;
          }
        }
        if (stryMutAct_9fa48("66620") ? transition?.hasTransactionCoordinator !== true : stryMutAct_9fa48("66619") ? false : stryMutAct_9fa48("66618") ? true : (stryCov_9fa48("66618", "66619", "66620"), (stryMutAct_9fa48("66621") ? transition.hasTransactionCoordinator : (stryCov_9fa48("66621"), transition?.hasTransactionCoordinator)) === (stryMutAct_9fa48("66622") ? false : (stryCov_9fa48("66622"), true)))) {
          if (stryMutAct_9fa48("66623")) {
            {}
          } else {
            stryCov_9fa48("66623");
            continue;
          }
        }
        violations.push(Object.freeze(stryMutAct_9fa48("66624") ? {} : (stryCov_9fa48("66624"), {
          transitionId: stryMutAct_9fa48("66627") ? transition?.transitionId && null : stryMutAct_9fa48("66626") ? false : stryMutAct_9fa48("66625") ? true : (stryCov_9fa48("66625", "66626", "66627"), (stryMutAct_9fa48("66628") ? transition.transitionId : (stryCov_9fa48("66628"), transition?.transitionId)) || null),
          ownerComponent: stryMutAct_9fa48("66631") ? transition?.ownerComponent && null : stryMutAct_9fa48("66630") ? false : stryMutAct_9fa48("66629") ? true : (stryCov_9fa48("66629", "66630", "66631"), (stryMutAct_9fa48("66632") ? transition.ownerComponent : (stryCov_9fa48("66632"), transition?.ownerComponent)) || null)
        })));
      }
    }
    if (stryMutAct_9fa48("66636") ? violations.length <= 0 : stryMutAct_9fa48("66635") ? violations.length >= 0 : stryMutAct_9fa48("66634") ? false : stryMutAct_9fa48("66633") ? true : (stryCov_9fa48("66633", "66634", "66635", "66636"), violations.length > 0)) {
      if (stryMutAct_9fa48("66637")) {
        {}
      } else {
        stryCov_9fa48("66637");
        return buildInvariantResult(stryMutAct_9fa48("66638") ? {} : (stryCov_9fa48("66638"), {
          invariantId: INVARIANT_ID.CONTROL_PLANE_TRANSACTION_COORDINATOR_REQUIRED,
          severity: INVARIANT_OUTCOME_SEVERITY.HARD,
          passed: stryMutAct_9fa48("66639") ? true : (stryCov_9fa48("66639"), false),
          reason: INVARIANT_REASON.TRANSACTION_COORDINATOR_MISSING,
          context: stryMutAct_9fa48("66640") ? {} : (stryCov_9fa48("66640"), {
            violations: Object.freeze(violations)
          })
        }));
      }
    }
    return buildInvariantResult(stryMutAct_9fa48("66641") ? {} : (stryCov_9fa48("66641"), {
      invariantId: INVARIANT_ID.CONTROL_PLANE_TRANSACTION_COORDINATOR_REQUIRED,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: stryMutAct_9fa48("66642") ? false : (stryCov_9fa48("66642"), true),
      reason: INVARIANT_REASON.TRANSACTION_COORDINATOR_AVAILABLE
    }));
  }
}

/**
 * Evaluate the full canonical invariant set against a state
 * snapshot.
 *
 * @param {Object} state - Combined state snapshot containing
 *   fields consumed by each individual invariant check.
 * @return {Array<Object>} Array of frozen invariant results.
 */
function evaluateInvariants(state) {
  if (stryMutAct_9fa48("66643")) {
    {}
  } else {
    stryCov_9fa48("66643");
    const snapshot = (stryMutAct_9fa48("66646") ? state || typeof state === 'object' : stryMutAct_9fa48("66645") ? false : stryMutAct_9fa48("66644") ? true : (stryCov_9fa48("66644", "66645", "66646"), state && (stryMutAct_9fa48("66648") ? typeof state !== 'object' : stryMutAct_9fa48("66647") ? true : (stryCov_9fa48("66647", "66648"), typeof state === (stryMutAct_9fa48("66649") ? "" : (stryCov_9fa48("66649"), 'object')))))) ? state : {};
    return Object.freeze(stryMutAct_9fa48("66650") ? [] : (stryCov_9fa48("66650"), [checkLeaderUniqueness(snapshot), checkMonotonicSteps(snapshot), checkClaimExclusivity(snapshot), checkOrphanInFlight(snapshot), checkReplicaOperationSingleWriter(snapshot), checkAckBeforeAdvance(snapshot), checkSplitResumeCompleteness(snapshot), checkReadinessDimensionCorrectness(snapshot), checkTransactionAvailability(snapshot)]));
  }
}

/**
 * Convert control-plane invariant results into invariant-catalog records
 * suitable for diagnostics bundles and harness artifacts.
 *
 * @param {Array<Object>} invariantResults - Results from evaluateInvariants().
 * @return {Array<Object>} Frozen array of invariant records.
 */
function buildInvariantArtifactRecords(invariantResults) {
  if (stryMutAct_9fa48("66651")) {
    {}
  } else {
    stryCov_9fa48("66651");
    const results = Array.isArray(invariantResults) ? invariantResults : stryMutAct_9fa48("66652") ? ["Stryker was here"] : (stryCov_9fa48("66652"), []);
    const records = results.map(result => {
      if (stryMutAct_9fa48("66653")) {
        {}
      } else {
        stryCov_9fa48("66653");
        const context = isRecord(stryMutAct_9fa48("66654") ? result.context : (stryCov_9fa48("66654"), result?.context)) ? stryMutAct_9fa48("66655") ? {} : (stryCov_9fa48("66655"), {
          ...result.context
        }) : {};
        return createInvariantRecord(stryMutAct_9fa48("66656") ? {} : (stryCov_9fa48("66656"), {
          invariantId: stryMutAct_9fa48("66657") ? result.invariantId : (stryCov_9fa48("66657"), result?.invariantId),
          passed: stryMutAct_9fa48("66660") ? result?.passed === false : stryMutAct_9fa48("66659") ? false : stryMutAct_9fa48("66658") ? true : (stryCov_9fa48("66658", "66659", "66660"), (stryMutAct_9fa48("66661") ? result.passed : (stryCov_9fa48("66661"), result?.passed)) !== (stryMutAct_9fa48("66662") ? true : (stryCov_9fa48("66662"), false))),
          entityId: resolveInvariantEntityId(result),
          owningSubsystem: INVARIANT_ENGINE_SUBSYSTEM,
          reasonCode: stryMutAct_9fa48("66663") ? result.reason : (stryCov_9fa48("66663"), result?.reason),
          observed: context,
          details: stryMutAct_9fa48("66664") ? {} : (stryCov_9fa48("66664"), {
            ...context,
            controlPlaneSeverity: stryMutAct_9fa48("66667") ? result?.severity && null : stryMutAct_9fa48("66666") ? false : stryMutAct_9fa48("66665") ? true : (stryCov_9fa48("66665", "66666", "66667"), (stryMutAct_9fa48("66668") ? result.severity : (stryCov_9fa48("66668"), result?.severity)) || null)
          })
        }));
      }
    });
    return Object.freeze(records);
  }
}

/**
 * Build a diagnostics bundle from invariant evaluation results.
 *
 * The bundle includes a summary of pass/fail counts separated by
 * severity, and a breaches array with full context including owner
 * key and operation id when available.
 *
 * Requirements: 7.2 (Requirement 7, 9)
 *
 * @param {Array<Object>} invariantResults - Results from
 *   evaluateInvariants().
 * @return {Object} Frozen diagnostics bundle.
 */
function buildInvariantDiagnosticsBundle(invariantResults) {
  if (stryMutAct_9fa48("66669")) {
    {}
  } else {
    stryCov_9fa48("66669");
    const results = Array.isArray(invariantResults) ? invariantResults : stryMutAct_9fa48("66670") ? ["Stryker was here"] : (stryCov_9fa48("66670"), []);
    const artifactRecords = buildInvariantArtifactRecords(results);
    let passed = 0;
    let failed = 0;
    let hardFailures = 0;
    let softFailures = 0;
    const breaches = stryMutAct_9fa48("66671") ? ["Stryker was here"] : (stryCov_9fa48("66671"), []);
    for (const result of results) {
      if (stryMutAct_9fa48("66672")) {
        {}
      } else {
        stryCov_9fa48("66672");
        if (stryMutAct_9fa48("66675") ? result.passed : stryMutAct_9fa48("66674") ? false : stryMutAct_9fa48("66673") ? true : (stryCov_9fa48("66673", "66674", "66675"), result?.passed)) {
          if (stryMutAct_9fa48("66676")) {
            {}
          } else {
            stryCov_9fa48("66676");
            stryMutAct_9fa48("66677") ? passed-- : (stryCov_9fa48("66677"), passed++);
          }
        } else {
          if (stryMutAct_9fa48("66678")) {
            {}
          } else {
            stryCov_9fa48("66678");
            stryMutAct_9fa48("66679") ? failed-- : (stryCov_9fa48("66679"), failed++);
            if (stryMutAct_9fa48("66682") ? result?.severity !== INVARIANT_OUTCOME_SEVERITY.HARD : stryMutAct_9fa48("66681") ? false : stryMutAct_9fa48("66680") ? true : (stryCov_9fa48("66680", "66681", "66682"), (stryMutAct_9fa48("66683") ? result.severity : (stryCov_9fa48("66683"), result?.severity)) === INVARIANT_OUTCOME_SEVERITY.HARD)) {
              if (stryMutAct_9fa48("66684")) {
                {}
              } else {
                stryCov_9fa48("66684");
                stryMutAct_9fa48("66685") ? hardFailures-- : (stryCov_9fa48("66685"), hardFailures++);
              }
            } else {
              if (stryMutAct_9fa48("66686")) {
                {}
              } else {
                stryCov_9fa48("66686");
                stryMutAct_9fa48("66687") ? softFailures-- : (stryCov_9fa48("66687"), softFailures++);
              }
            }
            breaches.push(Object.freeze(stryMutAct_9fa48("66688") ? {} : (stryCov_9fa48("66688"), {
              invariantId: stryMutAct_9fa48("66691") ? result?.invariantId && null : stryMutAct_9fa48("66690") ? false : stryMutAct_9fa48("66689") ? true : (stryCov_9fa48("66689", "66690", "66691"), (stryMutAct_9fa48("66692") ? result.invariantId : (stryCov_9fa48("66692"), result?.invariantId)) || null),
              severity: stryMutAct_9fa48("66695") ? result?.severity && null : stryMutAct_9fa48("66694") ? false : stryMutAct_9fa48("66693") ? true : (stryCov_9fa48("66693", "66694", "66695"), (stryMutAct_9fa48("66696") ? result.severity : (stryCov_9fa48("66696"), result?.severity)) || null),
              reason: stryMutAct_9fa48("66699") ? result?.reason && null : stryMutAct_9fa48("66698") ? false : stryMutAct_9fa48("66697") ? true : (stryCov_9fa48("66697", "66698", "66699"), (stryMutAct_9fa48("66700") ? result.reason : (stryCov_9fa48("66700"), result?.reason)) || null),
              ownerKey: stryMutAct_9fa48("66703") ? result?.context?.ownerKey && null : stryMutAct_9fa48("66702") ? false : stryMutAct_9fa48("66701") ? true : (stryCov_9fa48("66701", "66702", "66703"), (stryMutAct_9fa48("66705") ? result.context?.ownerKey : stryMutAct_9fa48("66704") ? result?.context.ownerKey : (stryCov_9fa48("66704", "66705"), result?.context?.ownerKey)) || null),
              operationId: stryMutAct_9fa48("66708") ? result?.context?.operationId && null : stryMutAct_9fa48("66707") ? false : stryMutAct_9fa48("66706") ? true : (stryCov_9fa48("66706", "66707", "66708"), (stryMutAct_9fa48("66710") ? result.context?.operationId : stryMutAct_9fa48("66709") ? result?.context.operationId : (stryCov_9fa48("66709", "66710"), result?.context?.operationId)) || null),
              context: (stryMutAct_9fa48("66711") ? result.context : (stryCov_9fa48("66711"), result?.context)) ? Object.freeze(stryMutAct_9fa48("66712") ? {} : (stryCov_9fa48("66712"), {
                ...result.context
              })) : null
            })));
          }
        }
      }
    }
    return Object.freeze(stryMutAct_9fa48("66713") ? {} : (stryCov_9fa48("66713"), {
      [INVARIANT_BUNDLE_FIELD.SUMMARY]: Object.freeze(stryMutAct_9fa48("66714") ? {} : (stryCov_9fa48("66714"), {
        [INVARIANT_BUNDLE_FIELD.TOTAL]: results.length,
        [INVARIANT_BUNDLE_FIELD.PASSED]: passed,
        [INVARIANT_BUNDLE_FIELD.FAILED]: failed,
        [INVARIANT_BUNDLE_FIELD.HARD_FAILURES]: hardFailures,
        [INVARIANT_BUNDLE_FIELD.SOFT_FAILURES]: softFailures
      })),
      [INVARIANT_BUNDLE_FIELD.BREACHES]: Object.freeze(breaches),
      [INVARIANT_BUNDLE_FIELD.ARTIFACT_RECORDS]: artifactRecords,
      [INVARIANT_BUNDLE_FIELD.TIMESTAMP]: Date.now()
    }));
  }
}

/**
 * Assert that no hard invariant has failed. Throws a typed error
 * with the diagnostics bundle attached when any hard invariant
 * breaches.
 *
 * Soft-only failures do not trigger the gate.
 *
 * Requirements: 7.3 (Requirement 7)
 *
 * @param {Array<Object>} invariantResults - Results from
 *   evaluateInvariants().
 * @throws {Error} When any result has severity 'hard' and
 *   passed === false. The error includes a `diagnosticsBundle`
 *   property.
 */
function assertInvariantGate(invariantResults) {
  if (stryMutAct_9fa48("66715")) {
    {}
  } else {
    stryCov_9fa48("66715");
    const results = Array.isArray(invariantResults) ? invariantResults : stryMutAct_9fa48("66716") ? ["Stryker was here"] : (stryCov_9fa48("66716"), []);
    const hasHardFailure = stryMutAct_9fa48("66717") ? results.every(r => r?.severity === INVARIANT_OUTCOME_SEVERITY.HARD && r?.passed === false) : (stryCov_9fa48("66717"), results.some(stryMutAct_9fa48("66718") ? () => undefined : (stryCov_9fa48("66718"), r => stryMutAct_9fa48("66721") ? r?.severity === INVARIANT_OUTCOME_SEVERITY.HARD || r?.passed === false : stryMutAct_9fa48("66720") ? false : stryMutAct_9fa48("66719") ? true : (stryCov_9fa48("66719", "66720", "66721"), (stryMutAct_9fa48("66723") ? r?.severity !== INVARIANT_OUTCOME_SEVERITY.HARD : stryMutAct_9fa48("66722") ? true : (stryCov_9fa48("66722", "66723"), (stryMutAct_9fa48("66724") ? r.severity : (stryCov_9fa48("66724"), r?.severity)) === INVARIANT_OUTCOME_SEVERITY.HARD)) && (stryMutAct_9fa48("66726") ? r?.passed !== false : stryMutAct_9fa48("66725") ? true : (stryCov_9fa48("66725", "66726"), (stryMutAct_9fa48("66727") ? r.passed : (stryCov_9fa48("66727"), r?.passed)) === (stryMutAct_9fa48("66728") ? true : (stryCov_9fa48("66728"), false))))))));
    if (stryMutAct_9fa48("66731") ? false : stryMutAct_9fa48("66730") ? true : stryMutAct_9fa48("66729") ? hasHardFailure : (stryCov_9fa48("66729", "66730", "66731"), !hasHardFailure)) {
      if (stryMutAct_9fa48("66732")) {
        {}
      } else {
        stryCov_9fa48("66732");
        return;
      }
    }
    const bundle = buildInvariantDiagnosticsBundle(results);
    const error = new Error(INVARIANT_GATE_ERROR_MESSAGE);
    error.diagnosticsBundle = bundle;
    throw error;
  }
}
export { assertInvariantGate, buildInvariantArtifactRecords, buildInvariantDiagnosticsBundle, buildInvariantResult, checkAckBeforeAdvance, checkClaimExclusivity, checkLeaderUniqueness, checkMonotonicSteps, checkOrphanInFlight, checkReadinessDimensionCorrectness, checkReplicaOperationSingleWriter, checkSplitResumeCompleteness, checkTransactionAvailability, evaluateInvariants, isBackwardStep };
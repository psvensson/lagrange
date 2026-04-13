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
import { createHash } from 'node:crypto';
import { LoggingService } from '../../logging/logging-service.js';
import { QUERY_AST_NODE, QUERY_AST_TYPE, QUERY_ERROR_CODE, QUERY_ERROR_MSG, QUERY_LOG_MSG, QUERY_SUBSYSTEM } from '../query-constants.js';
const WRITE_COORDINATOR_DEFAULT = Object.freeze(stryMutAct_9fa48("111757") ? {} : (stryCov_9fa48("111757"), {
  MAX_RETRIES: 1
}));
const ERR_NO_PARTITION_FOR_KEY = stryMutAct_9fa48("111758") ? "" : (stryCov_9fa48("111758"), 'No partition found for key: ');
const WRITE_EXHAUSTED_RETRIES_MSG = stryMutAct_9fa48("111759") ? "" : (stryCov_9fa48("111759"), 'Distributed write exhausted retries');
const DEFAULT_PRIMARY_KEY_COLUMN = stryMutAct_9fa48("111760") ? "" : (stryCov_9fa48("111760"), 'id');
const HASH_ALGORITHM = stryMutAct_9fa48("111761") ? "" : (stryCov_9fa48("111761"), 'sha1');
const DIGEST_ENCODING = stryMutAct_9fa48("111762") ? "" : (stryCov_9fa48("111762"), 'hex');
const DIGEST_PREFIX_LENGTH = 16;
const OPERATION_ID_PREFIX = stryMutAct_9fa48("111763") ? "" : (stryCov_9fa48("111763"), 'dwrite-');
const PROMISE_STATUS_FULFILLED = stryMutAct_9fa48("111764") ? "" : (stryCov_9fa48("111764"), 'fulfilled');
const UNARY_MINUS = stryMutAct_9fa48("111765") ? "" : (stryCov_9fa48("111765"), '-');
const UNARY_PLUS = stryMutAct_9fa48("111766") ? "" : (stryCov_9fa48("111766"), '+');
const PARTICIPANT_ROLE_PRIMARY = stryMutAct_9fa48("111767") ? "" : (stryCov_9fa48("111767"), 'primary');
const PARTICIPANT_ROLE_MIRROR = stryMutAct_9fa48("111768") ? "" : (stryCov_9fa48("111768"), 'mirror');

/**
 * Canonical owner for distributed INSERT/UPDATE/DELETE execution.
 */
class DistributedWriteCoordinator {
  /**
   * @param {Object} options - Coordinator options.
   * @param {Object} options.partitionResolver - Partition resolver.
   * @param {Object} options.queryExecutor - Query executor.
   * @param {Function} options.getTablePartitions - Table partitions resolver.
   * @param {Function} options.getTableInfo - Table metadata resolver.
   * @param {number} [options.maxRetries] - Retry count per partition.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("111769")) {
      {}
    } else {
      stryCov_9fa48("111769");
      this.partitionResolver = stryMutAct_9fa48("111772") ? options.partitionResolver && null : stryMutAct_9fa48("111771") ? false : stryMutAct_9fa48("111770") ? true : (stryCov_9fa48("111770", "111771", "111772"), options.partitionResolver || null);
      this.queryExecutor = stryMutAct_9fa48("111775") ? options.queryExecutor && null : stryMutAct_9fa48("111774") ? false : stryMutAct_9fa48("111773") ? true : (stryCov_9fa48("111773", "111774", "111775"), options.queryExecutor || null);
      this.getTablePartitions = stryMutAct_9fa48("111778") ? options.getTablePartitions && (() => []) : stryMutAct_9fa48("111777") ? false : stryMutAct_9fa48("111776") ? true : (stryCov_9fa48("111776", "111777", "111778"), options.getTablePartitions || (stryMutAct_9fa48("111779") ? () => undefined : (stryCov_9fa48("111779"), () => stryMutAct_9fa48("111780") ? ["Stryker was here"] : (stryCov_9fa48("111780"), []))));
      this.getTableInfo = stryMutAct_9fa48("111783") ? options.getTableInfo && (() => null) : stryMutAct_9fa48("111782") ? false : stryMutAct_9fa48("111781") ? true : (stryCov_9fa48("111781", "111782", "111783"), options.getTableInfo || (stryMutAct_9fa48("111784") ? () => undefined : (stryCov_9fa48("111784"), () => null)));
      this.maxRetries = stryMutAct_9fa48("111785") ? options.maxRetries && WRITE_COORDINATOR_DEFAULT.MAX_RETRIES : (stryCov_9fa48("111785"), options.maxRetries ?? WRITE_COORDINATOR_DEFAULT.MAX_RETRIES);
      this.logger = this.initLogger();
    }
  }

  /**
   * Initialize logger.
   * @return {Object} logger.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("111786")) {
      {}
    } else {
      stryCov_9fa48("111786");
      try {
        if (stryMutAct_9fa48("111787")) {
          {}
        } else {
          stryCov_9fa48("111787");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("111789") ? false : stryMutAct_9fa48("111788") ? true : (stryCov_9fa48("111788", "111789"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("111790")) {
              {}
            } else {
              stryCov_9fa48("111790");
              return loggingService.forSubsystem(QUERY_SUBSYSTEM.SQL_QUERY_ENGINE);
            }
          }
        }
      } catch (logErr) {
        if (stryMutAct_9fa48("111791")) {
          {}
        } else {
          stryCov_9fa48("111791");
          console.warn(QUERY_LOG_MSG.INIT_LOGGER_FAILED, logErr);
        }
      }
      return console;
    }
  }

  /**
   * Build a distributed write plan for INSERT/UPDATE/DELETE.
   * @param {Object} ast - Statement AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Plan options.
   * @return {Object} DistributedWritePlan.
   */
  createWritePlan(ast, params = stryMutAct_9fa48("111792") ? ["Stryker was here"] : (stryCov_9fa48("111792"), []), options = {}) {
    if (stryMutAct_9fa48("111793")) {
      {}
    } else {
      stryCov_9fa48("111793");
      const operationId = stryMutAct_9fa48("111796") ? options.operationId && this.createOperationId(ast, params, options.sessionId || null) : stryMutAct_9fa48("111795") ? false : stryMutAct_9fa48("111794") ? true : (stryCov_9fa48("111794", "111795", "111796"), options.operationId || this.createOperationId(ast, params, stryMutAct_9fa48("111799") ? options.sessionId && null : stryMutAct_9fa48("111798") ? false : stryMutAct_9fa48("111797") ? true : (stryCov_9fa48("111797", "111798", "111799"), options.sessionId || null)));
      const idempotencyKey = stryMutAct_9fa48("111802") ? options.idempotencyKey && operationId : stryMutAct_9fa48("111801") ? false : stryMutAct_9fa48("111800") ? true : (stryCov_9fa48("111800", "111801", "111802"), options.idempotencyKey || operationId);
      const partitionStatements = new Map();
      if (stryMutAct_9fa48("111805") ? ast.type !== QUERY_AST_TYPE.INSERT : stryMutAct_9fa48("111804") ? false : stryMutAct_9fa48("111803") ? true : (stryCov_9fa48("111803", "111804", "111805"), ast.type === QUERY_AST_TYPE.INSERT)) {
        if (stryMutAct_9fa48("111806")) {
          {}
        } else {
          stryCov_9fa48("111806");
          this.createInsertPartitionStatements(ast, params, partitionStatements);
        }
      } else {
        if (stryMutAct_9fa48("111807")) {
          {}
        } else {
          stryCov_9fa48("111807");
          const partitionIds = Array.isArray(options.partitionIds) ? options.partitionIds : stryMutAct_9fa48("111808") ? ["Stryker was here"] : (stryCov_9fa48("111808"), []);
          for (const partitionId of partitionIds) {
            if (stryMutAct_9fa48("111809")) {
              {}
            } else {
              stryCov_9fa48("111809");
              partitionStatements.set(partitionId, stryMutAct_9fa48("111810") ? {} : (stryCov_9fa48("111810"), {
                ast: stryMutAct_9fa48("111811") ? {} : (stryCov_9fa48("111811"), {
                  ...ast
                }),
                role: PARTICIPANT_ROLE_PRIMARY,
                executionOptions: {}
              }));
            }
          }
        }
      }
      return stryMutAct_9fa48("111812") ? {} : (stryCov_9fa48("111812"), {
        operationId,
        statementType: ast.type,
        partitionStatements,
        returningSpec: stryMutAct_9fa48("111815") ? ast.returning && null : stryMutAct_9fa48("111814") ? false : stryMutAct_9fa48("111813") ? true : (stryCov_9fa48("111813", "111814", "111815"), ast.returning || null),
        idempotencyKey
      });
    }
  }

  /**
   * Append one mirror-only participant to an existing write plan.
   * Mirror participants affect success/failure but are excluded from
   * user-facing affected-row and RETURNING aggregation.
   * @param {Object} plan - Existing write plan.
   * @param {string} partitionId - Mirror partition ID.
   * @param {Object} ast - Statement AST.
   * @param {Object} executionOptions - Delivery options.
   * @return {Object} The mutated write plan.
   */
  addMirrorParticipant(plan, partitionId, ast, executionOptions = {}) {
    if (stryMutAct_9fa48("111816")) {
      {}
    } else {
      stryCov_9fa48("111816");
      if (stryMutAct_9fa48("111819") ? (!plan || !partitionId) && !ast : stryMutAct_9fa48("111818") ? false : stryMutAct_9fa48("111817") ? true : (stryCov_9fa48("111817", "111818", "111819"), (stryMutAct_9fa48("111821") ? !plan && !partitionId : stryMutAct_9fa48("111820") ? false : (stryCov_9fa48("111820", "111821"), (stryMutAct_9fa48("111822") ? plan : (stryCov_9fa48("111822"), !plan)) || (stryMutAct_9fa48("111823") ? partitionId : (stryCov_9fa48("111823"), !partitionId)))) || (stryMutAct_9fa48("111824") ? ast : (stryCov_9fa48("111824"), !ast)))) {
        if (stryMutAct_9fa48("111825")) {
          {}
        } else {
          stryCov_9fa48("111825");
          return plan;
        }
      }
      plan.partitionStatements.set(partitionId, stryMutAct_9fa48("111826") ? {} : (stryCov_9fa48("111826"), {
        ast: stryMutAct_9fa48("111827") ? {} : (stryCov_9fa48("111827"), {
          ...ast
        }),
        role: PARTICIPANT_ROLE_MIRROR,
        executionOptions: stryMutAct_9fa48("111828") ? {} : (stryCov_9fa48("111828"), {
          ...executionOptions
        })
      }));
      return plan;
    }
  }

  /**
   * Execute a distributed write plan and merge participant results.
   * @param {Object} plan - Distributed write plan.
   * @param {Array} params - Bound parameters.
   * @param {Object} [executionOptions] - Global execution options.
   * @return {Promise<Object>} Aggregated write result.
   */
  async executePlan(plan, params = stryMutAct_9fa48("111829") ? ["Stryker was here"] : (stryCov_9fa48("111829"), []), executionOptions = {}) {
    if (stryMutAct_9fa48("111830")) {
      {}
    } else {
      stryCov_9fa48("111830");
      const participantResults = stryMutAct_9fa48("111831") ? ["Stryker was here"] : (stryCov_9fa48("111831"), []);
      const orderedPartitions = stryMutAct_9fa48("111832") ? Array.from(plan.partitionStatements.keys()) : (stryCov_9fa48("111832"), Array.from(plan.partitionStatements.keys()).sort());
      if (stryMutAct_9fa48("111835") ? orderedPartitions.length !== 1 : stryMutAct_9fa48("111834") ? false : stryMutAct_9fa48("111833") ? true : (stryCov_9fa48("111833", "111834", "111835"), orderedPartitions.length === 1)) {
        if (stryMutAct_9fa48("111836")) {
          {}
        } else {
          stryCov_9fa48("111836");
          const partitionId = orderedPartitions[0];
          const participant = plan.partitionStatements.get(partitionId);
          const result = await this.executePartitionStatement(plan.statementType, participant.ast, partitionId, params, stryMutAct_9fa48("111837") ? {} : (stryCov_9fa48("111837"), {
            ...(stryMutAct_9fa48("111840") ? executionOptions && {} : stryMutAct_9fa48("111839") ? false : stryMutAct_9fa48("111838") ? true : (stryCov_9fa48("111838", "111839", "111840"), executionOptions || {})),
            ...(stryMutAct_9fa48("111843") ? participant.executionOptions && {} : stryMutAct_9fa48("111842") ? false : stryMutAct_9fa48("111841") ? true : (stryCov_9fa48("111841", "111842", "111843"), participant.executionOptions || {}))
          }));
          participantResults.push(stryMutAct_9fa48("111844") ? {} : (stryCov_9fa48("111844"), {
            partitionId,
            role: stryMutAct_9fa48("111847") ? participant.role && PARTICIPANT_ROLE_PRIMARY : stryMutAct_9fa48("111846") ? false : stryMutAct_9fa48("111845") ? true : (stryCov_9fa48("111845", "111846", "111847"), participant.role || PARTICIPANT_ROLE_PRIMARY),
            ...result
          }));
        }
      } else {
        if (stryMutAct_9fa48("111848")) {
          {}
        } else {
          stryCov_9fa48("111848");
          const promises = orderedPartitions.map(partitionId => {
            if (stryMutAct_9fa48("111849")) {
              {}
            } else {
              stryCov_9fa48("111849");
              const participant = plan.partitionStatements.get(partitionId);
              return this.executePartitionStatement(plan.statementType, participant.ast, partitionId, params, stryMutAct_9fa48("111850") ? {} : (stryCov_9fa48("111850"), {
                ...(stryMutAct_9fa48("111853") ? executionOptions && {} : stryMutAct_9fa48("111852") ? false : stryMutAct_9fa48("111851") ? true : (stryCov_9fa48("111851", "111852", "111853"), executionOptions || {})),
                ...(stryMutAct_9fa48("111856") ? participant.executionOptions && {} : stryMutAct_9fa48("111855") ? false : stryMutAct_9fa48("111854") ? true : (stryCov_9fa48("111854", "111855", "111856"), participant.executionOptions || {}))
              })).then(stryMutAct_9fa48("111857") ? () => undefined : (stryCov_9fa48("111857"), result => stryMutAct_9fa48("111858") ? {} : (stryCov_9fa48("111858"), {
                partitionId,
                role: stryMutAct_9fa48("111861") ? participant.role && PARTICIPANT_ROLE_PRIMARY : stryMutAct_9fa48("111860") ? false : stryMutAct_9fa48("111859") ? true : (stryCov_9fa48("111859", "111860", "111861"), participant.role || PARTICIPANT_ROLE_PRIMARY),
                ...result
              })));
            }
          });
          const settled = await Promise.allSettled(promises);
          for (const outcome of settled) {
            if (stryMutAct_9fa48("111862")) {
              {}
            } else {
              stryCov_9fa48("111862");
              if (stryMutAct_9fa48("111865") ? outcome.status !== PROMISE_STATUS_FULFILLED : stryMutAct_9fa48("111864") ? false : stryMutAct_9fa48("111863") ? true : (stryCov_9fa48("111863", "111864", "111865"), outcome.status === PROMISE_STATUS_FULFILLED)) {
                if (stryMutAct_9fa48("111866")) {
                  {}
                } else {
                  stryCov_9fa48("111866");
                  participantResults.push(outcome.value);
                }
              } else {
                if (stryMutAct_9fa48("111867")) {
                  {}
                } else {
                  stryCov_9fa48("111867");
                  participantResults.push(stryMutAct_9fa48("111868") ? {} : (stryCov_9fa48("111868"), {
                    partitionId: null,
                    success: stryMutAct_9fa48("111869") ? true : (stryCov_9fa48("111869"), false),
                    error: stryMutAct_9fa48("111872") ? outcome.reason?.message && QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE : stryMutAct_9fa48("111871") ? false : stryMutAct_9fa48("111870") ? true : (stryCov_9fa48("111870", "111871", "111872"), (stryMutAct_9fa48("111873") ? outcome.reason.message : (stryCov_9fa48("111873"), outcome.reason?.message)) || QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE)
                  }));
                }
              }
            }
          }
          stryMutAct_9fa48("111874") ? participantResults : (stryCov_9fa48("111874"), participantResults.sort((a, b) => {
            if (stryMutAct_9fa48("111875")) {
              {}
            } else {
              stryCov_9fa48("111875");
              if (stryMutAct_9fa48("111878") ? a.partitionId === null || b.partitionId === null : stryMutAct_9fa48("111877") ? false : stryMutAct_9fa48("111876") ? true : (stryCov_9fa48("111876", "111877", "111878"), (stryMutAct_9fa48("111880") ? a.partitionId !== null : stryMutAct_9fa48("111879") ? true : (stryCov_9fa48("111879", "111880"), a.partitionId === null)) && (stryMutAct_9fa48("111882") ? b.partitionId !== null : stryMutAct_9fa48("111881") ? true : (stryCov_9fa48("111881", "111882"), b.partitionId === null)))) return 0;
              if (stryMutAct_9fa48("111885") ? a.partitionId !== null : stryMutAct_9fa48("111884") ? false : stryMutAct_9fa48("111883") ? true : (stryCov_9fa48("111883", "111884", "111885"), a.partitionId === null)) return 1;
              if (stryMutAct_9fa48("111888") ? b.partitionId !== null : stryMutAct_9fa48("111887") ? false : stryMutAct_9fa48("111886") ? true : (stryCov_9fa48("111886", "111887", "111888"), b.partitionId === null)) return stryMutAct_9fa48("111889") ? +1 : (stryCov_9fa48("111889"), -1);
              return (stryMutAct_9fa48("111893") ? a.partitionId >= b.partitionId : stryMutAct_9fa48("111892") ? a.partitionId <= b.partitionId : stryMutAct_9fa48("111891") ? false : stryMutAct_9fa48("111890") ? true : (stryCov_9fa48("111890", "111891", "111892", "111893"), a.partitionId < b.partitionId)) ? stryMutAct_9fa48("111894") ? +1 : (stryCov_9fa48("111894"), -1) : (stryMutAct_9fa48("111898") ? a.partitionId <= b.partitionId : stryMutAct_9fa48("111897") ? a.partitionId >= b.partitionId : stryMutAct_9fa48("111896") ? false : stryMutAct_9fa48("111895") ? true : (stryCov_9fa48("111895", "111896", "111897", "111898"), a.partitionId > b.partitionId)) ? 1 : 0;
            }
          }));
        }
      }
      const failedParticipants = stryMutAct_9fa48("111899") ? participantResults : (stryCov_9fa48("111899"), participantResults.filter(stryMutAct_9fa48("111900") ? () => undefined : (stryCov_9fa48("111900"), result => stryMutAct_9fa48("111901") ? result.success : (stryCov_9fa48("111901"), !result.success))));
      const primaryPartitions = stryMutAct_9fa48("111903") ? participantResults.map(result => result.partitionId).filter(Boolean) : stryMutAct_9fa48("111902") ? participantResults.filter(result => result.role !== PARTICIPANT_ROLE_MIRROR).map(result => result.partitionId) : (stryCov_9fa48("111902", "111903"), participantResults.filter(stryMutAct_9fa48("111904") ? () => undefined : (stryCov_9fa48("111904"), result => stryMutAct_9fa48("111907") ? result.role === PARTICIPANT_ROLE_MIRROR : stryMutAct_9fa48("111906") ? false : stryMutAct_9fa48("111905") ? true : (stryCov_9fa48("111905", "111906", "111907"), result.role !== PARTICIPANT_ROLE_MIRROR))).map(stryMutAct_9fa48("111908") ? () => undefined : (stryCov_9fa48("111908"), result => result.partitionId)).filter(Boolean));
      const mirrorPartitions = stryMutAct_9fa48("111910") ? participantResults.map(result => result.partitionId).filter(Boolean) : stryMutAct_9fa48("111909") ? participantResults.filter(result => result.role === PARTICIPANT_ROLE_MIRROR).map(result => result.partitionId) : (stryCov_9fa48("111909", "111910"), participantResults.filter(stryMutAct_9fa48("111911") ? () => undefined : (stryCov_9fa48("111911"), result => stryMutAct_9fa48("111914") ? result.role !== PARTICIPANT_ROLE_MIRROR : stryMutAct_9fa48("111913") ? false : stryMutAct_9fa48("111912") ? true : (stryCov_9fa48("111912", "111913", "111914"), result.role === PARTICIPANT_ROLE_MIRROR))).map(stryMutAct_9fa48("111915") ? () => undefined : (stryCov_9fa48("111915"), result => result.partitionId)).filter(Boolean));
      const rows = stryMutAct_9fa48("111916") ? ["Stryker was here"] : (stryCov_9fa48("111916"), []);
      let affectedRows = 0;
      const retryCount = participantResults.reduce((sum, result) => {
        if (stryMutAct_9fa48("111917")) {
          {}
        } else {
          stryCov_9fa48("111917");
          const attempts = Number.isInteger(result.attempts) ? result.attempts : 1;
          return stryMutAct_9fa48("111918") ? sum - Math.max(attempts - 1, 0) : (stryCov_9fa48("111918"), sum + (stryMutAct_9fa48("111919") ? Math.min(attempts - 1, 0) : (stryCov_9fa48("111919"), Math.max(stryMutAct_9fa48("111920") ? attempts + 1 : (stryCov_9fa48("111920"), attempts - 1), 0))));
        }
      }, 0);
      for (const result of participantResults) {
        if (stryMutAct_9fa48("111921")) {
          {}
        } else {
          stryCov_9fa48("111921");
          if (stryMutAct_9fa48("111924") ? false : stryMutAct_9fa48("111923") ? true : stryMutAct_9fa48("111922") ? result.success : (stryCov_9fa48("111922", "111923", "111924"), !result.success)) {
            if (stryMutAct_9fa48("111925")) {
              {}
            } else {
              stryCov_9fa48("111925");
              continue;
            }
          }
          if (stryMutAct_9fa48("111928") ? result.role !== PARTICIPANT_ROLE_MIRROR : stryMutAct_9fa48("111927") ? false : stryMutAct_9fa48("111926") ? true : (stryCov_9fa48("111926", "111927", "111928"), result.role === PARTICIPANT_ROLE_MIRROR)) {
            if (stryMutAct_9fa48("111929")) {
              {}
            } else {
              stryCov_9fa48("111929");
              continue;
            }
          }
          stryMutAct_9fa48("111930") ? affectedRows -= result.affectedRows || 0 : (stryCov_9fa48("111930"), affectedRows += stryMutAct_9fa48("111933") ? result.affectedRows && 0 : stryMutAct_9fa48("111932") ? false : stryMutAct_9fa48("111931") ? true : (stryCov_9fa48("111931", "111932", "111933"), result.affectedRows || 0));
          if (stryMutAct_9fa48("111936") ? Array.isArray(result.rows) || result.rows.length > 0 : stryMutAct_9fa48("111935") ? false : stryMutAct_9fa48("111934") ? true : (stryCov_9fa48("111934", "111935", "111936"), Array.isArray(result.rows) && (stryMutAct_9fa48("111939") ? result.rows.length <= 0 : stryMutAct_9fa48("111938") ? result.rows.length >= 0 : stryMutAct_9fa48("111937") ? true : (stryCov_9fa48("111937", "111938", "111939"), result.rows.length > 0)))) {
            if (stryMutAct_9fa48("111940")) {
              {}
            } else {
              stryCov_9fa48("111940");
              rows.push(...result.rows);
            }
          }
        }
      }
      if (stryMutAct_9fa48("111944") ? failedParticipants.length <= 0 : stryMutAct_9fa48("111943") ? failedParticipants.length >= 0 : stryMutAct_9fa48("111942") ? false : stryMutAct_9fa48("111941") ? true : (stryCov_9fa48("111941", "111942", "111943", "111944"), failedParticipants.length > 0)) {
        if (stryMutAct_9fa48("111945")) {
          {}
        } else {
          stryCov_9fa48("111945");
          return stryMutAct_9fa48("111946") ? {} : (stryCov_9fa48("111946"), {
            success: stryMutAct_9fa48("111947") ? true : (stryCov_9fa48("111947"), false),
            operation: plan.statementType,
            affectedRows,
            rows,
            partitions: primaryPartitions,
            mirrorPartitions,
            failedPartitions: failedParticipants.map(stryMutAct_9fa48("111948") ? () => undefined : (stryCov_9fa48("111948"), result => result.partitionId)),
            partitionErrors: failedParticipants.map(stryMutAct_9fa48("111949") ? () => undefined : (stryCov_9fa48("111949"), result => stryMutAct_9fa48("111950") ? {} : (stryCov_9fa48("111950"), {
              partitionId: result.partitionId,
              error: stryMutAct_9fa48("111953") ? result.error && QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE : stryMutAct_9fa48("111952") ? false : stryMutAct_9fa48("111951") ? true : (stryCov_9fa48("111951", "111952", "111953"), result.error || QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE)
            }))),
            participantResults,
            errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
            error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
            idempotencyKey: plan.idempotencyKey,
            operationId: plan.operationId,
            retryCount
          });
        }
      }
      return stryMutAct_9fa48("111954") ? {} : (stryCov_9fa48("111954"), {
        success: stryMutAct_9fa48("111955") ? false : (stryCov_9fa48("111955"), true),
        operation: plan.statementType,
        affectedRows,
        rows,
        partitions: primaryPartitions,
        mirrorPartitions,
        participantResults,
        idempotencyKey: plan.idempotencyKey,
        operationId: plan.operationId,
        retryCount
      });
    }
  }

  /**
   * Execute one partition write with bounded retry.
   * @param {string} statementType - Statement type.
   * @param {Object} statementAst - Partition-scoped statement AST.
   * @param {string} partitionId - Target partition.
   * @param {Array} params - Bound parameters.
   * @return {Promise<Object>} Participant execution result.
   * @private
   */
  async executePartitionStatement(statementType, statementAst, partitionId, params, executionOptions = {}) {
    if (stryMutAct_9fa48("111956")) {
      {}
    } else {
      stryCov_9fa48("111956");
      for (let attempt = 0; stryMutAct_9fa48("111959") ? attempt > this.maxRetries : stryMutAct_9fa48("111958") ? attempt < this.maxRetries : stryMutAct_9fa48("111957") ? false : (stryCov_9fa48("111957", "111958", "111959"), attempt <= this.maxRetries); stryMutAct_9fa48("111960") ? attempt-- : (stryCov_9fa48("111960"), attempt++)) {
        if (stryMutAct_9fa48("111961")) {
          {}
        } else {
          stryCov_9fa48("111961");
          try {
            if (stryMutAct_9fa48("111962")) {
              {}
            } else {
              stryCov_9fa48("111962");
              const result = await this.executePartitionStatementOnce(statementType, statementAst, partitionId, params, executionOptions);
              if (stryMutAct_9fa48("111965") ? result.success === false : stryMutAct_9fa48("111964") ? false : stryMutAct_9fa48("111963") ? true : (stryCov_9fa48("111963", "111964", "111965"), result.success !== (stryMutAct_9fa48("111966") ? true : (stryCov_9fa48("111966"), false)))) {
                if (stryMutAct_9fa48("111967")) {
                  {}
                } else {
                  stryCov_9fa48("111967");
                  return stryMutAct_9fa48("111968") ? {} : (stryCov_9fa48("111968"), {
                    ...result,
                    attempts: stryMutAct_9fa48("111969") ? attempt - 1 : (stryCov_9fa48("111969"), attempt + 1)
                  });
                }
              }
              if (stryMutAct_9fa48("111973") ? attempt < this.maxRetries : stryMutAct_9fa48("111972") ? attempt > this.maxRetries : stryMutAct_9fa48("111971") ? false : stryMutAct_9fa48("111970") ? true : (stryCov_9fa48("111970", "111971", "111972", "111973"), attempt >= this.maxRetries)) {
                if (stryMutAct_9fa48("111974")) {
                  {}
                } else {
                  stryCov_9fa48("111974");
                  return stryMutAct_9fa48("111975") ? {} : (stryCov_9fa48("111975"), {
                    ...result,
                    attempts: stryMutAct_9fa48("111976") ? attempt - 1 : (stryCov_9fa48("111976"), attempt + 1)
                  });
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("111977")) {
              {}
            } else {
              stryCov_9fa48("111977");
              if (stryMutAct_9fa48("111981") ? attempt < this.maxRetries : stryMutAct_9fa48("111980") ? attempt > this.maxRetries : stryMutAct_9fa48("111979") ? false : stryMutAct_9fa48("111978") ? true : (stryCov_9fa48("111978", "111979", "111980", "111981"), attempt >= this.maxRetries)) {
                if (stryMutAct_9fa48("111982")) {
                  {}
                } else {
                  stryCov_9fa48("111982");
                  return stryMutAct_9fa48("111983") ? {} : (stryCov_9fa48("111983"), {
                    success: stryMutAct_9fa48("111984") ? true : (stryCov_9fa48("111984"), false),
                    error: error.message,
                    attempts: stryMutAct_9fa48("111985") ? attempt - 1 : (stryCov_9fa48("111985"), attempt + 1)
                  });
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("111986") ? {} : (stryCov_9fa48("111986"), {
        success: stryMutAct_9fa48("111987") ? true : (stryCov_9fa48("111987"), false),
        error: WRITE_EXHAUSTED_RETRIES_MSG,
        attempts: stryMutAct_9fa48("111988") ? this.maxRetries - 1 : (stryCov_9fa48("111988"), this.maxRetries + 1)
      });
    }
  }

  /**
   * Execute one partition write without retry.
   * @param {string} statementType - Statement type.
   * @param {Object} statementAst - Partition-scoped statement AST.
   * @param {string} partitionId - Target partition.
   * @param {Array} params - Bound parameters.
   * @return {Promise<Object>} Participant result.
   * @private
   */
  async executePartitionStatementOnce(statementType, statementAst, partitionId, params, executionOptions = {}) {
    if (stryMutAct_9fa48("111989")) {
      {}
    } else {
      stryCov_9fa48("111989");
      if (stryMutAct_9fa48("111992") ? statementType !== QUERY_AST_TYPE.INSERT : stryMutAct_9fa48("111991") ? false : stryMutAct_9fa48("111990") ? true : (stryCov_9fa48("111990", "111991", "111992"), statementType === QUERY_AST_TYPE.INSERT)) {
        if (stryMutAct_9fa48("111993")) {
          {}
        } else {
          stryCov_9fa48("111993");
          return this.queryExecutor.executeInsert(statementAst, partitionId, params, executionOptions);
        }
      }
      if (stryMutAct_9fa48("111996") ? statementType !== QUERY_AST_TYPE.UPDATE : stryMutAct_9fa48("111995") ? false : stryMutAct_9fa48("111994") ? true : (stryCov_9fa48("111994", "111995", "111996"), statementType === QUERY_AST_TYPE.UPDATE)) {
        if (stryMutAct_9fa48("111997")) {
          {}
        } else {
          stryCov_9fa48("111997");
          return this.queryExecutor.executeUpdate(statementAst, stryMutAct_9fa48("111998") ? [] : (stryCov_9fa48("111998"), [partitionId]), params, executionOptions);
        }
      }
      return this.queryExecutor.executeDelete(statementAst, stryMutAct_9fa48("111999") ? [] : (stryCov_9fa48("111999"), [partitionId]), params, executionOptions);
    }
  }

  /**
   * Build INSERT partition statements grouped by partition key.
   * @param {Object} ast - INSERT AST.
   * @param {Array} params - Bound parameters.
   * @param {Map<string, Object>} partitionStatements - Output map.
   * @private
   */
  createInsertPartitionStatements(ast, params, partitionStatements) {
    if (stryMutAct_9fa48("112000")) {
      {}
    } else {
      stryCov_9fa48("112000");
      const partitions = stryMutAct_9fa48("112003") ? this.getTablePartitions(ast.table) && [] : stryMutAct_9fa48("112002") ? false : stryMutAct_9fa48("112001") ? true : (stryCov_9fa48("112001", "112002", "112003"), this.getTablePartitions(ast.table) || (stryMutAct_9fa48("112004") ? ["Stryker was here"] : (stryCov_9fa48("112004"), [])));
      const tableInfo = this.getTableInfo(ast.table);
      const primaryKeyColumns = this.resolvePrimaryKeyColumns(tableInfo);
      const primaryKey = primaryKeyColumns[0];
      const keyIndex = this.findPrimaryKeyIndex(ast, primaryKey);
      for (const row of stryMutAct_9fa48("112007") ? ast.values && [] : stryMutAct_9fa48("112006") ? false : stryMutAct_9fa48("112005") ? true : (stryCov_9fa48("112005", "112006", "112007"), ast.values || (stryMutAct_9fa48("112008") ? ["Stryker was here"] : (stryCov_9fa48("112008"), [])))) {
        if (stryMutAct_9fa48("112009")) {
          {}
        } else {
          stryCov_9fa48("112009");
          const keyValue = this.extractKeyValue(row[keyIndex], params);
          const partitionId = this.partitionResolver.resolvePartitionForKey(ast.table, keyValue, partitions);
          if (stryMutAct_9fa48("112012") ? false : stryMutAct_9fa48("112011") ? true : stryMutAct_9fa48("112010") ? partitionId : (stryCov_9fa48("112010", "112011", "112012"), !partitionId)) {
            if (stryMutAct_9fa48("112013")) {
              {}
            } else {
              stryCov_9fa48("112013");
              throw new Error(stryMutAct_9fa48("112014") ? ERR_NO_PARTITION_FOR_KEY - keyValue : (stryCov_9fa48("112014"), ERR_NO_PARTITION_FOR_KEY + keyValue));
            }
          }
          if (stryMutAct_9fa48("112017") ? false : stryMutAct_9fa48("112016") ? true : stryMutAct_9fa48("112015") ? partitionStatements.has(partitionId) : (stryCov_9fa48("112015", "112016", "112017"), !partitionStatements.has(partitionId))) {
            if (stryMutAct_9fa48("112018")) {
              {}
            } else {
              stryCov_9fa48("112018");
              partitionStatements.set(partitionId, stryMutAct_9fa48("112019") ? {} : (stryCov_9fa48("112019"), {
                ast: stryMutAct_9fa48("112020") ? {} : (stryCov_9fa48("112020"), {
                  ...ast,
                  values: stryMutAct_9fa48("112021") ? ["Stryker was here"] : (stryCov_9fa48("112021"), [])
                }),
                role: PARTICIPANT_ROLE_PRIMARY,
                executionOptions: {}
              }));
            }
          }
          partitionStatements.get(partitionId).ast.values.push(row);
        }
      }
    }
  }

  /**
   * Resolve primary key columns from table metadata.
   * @param {Object|null} tableInfo - Table metadata.
   * @return {string[]} Key columns.
   * @private
   */
  resolvePrimaryKeyColumns(tableInfo) {
    if (stryMutAct_9fa48("112022")) {
      {}
    } else {
      stryCov_9fa48("112022");
      const primaryKey = stryMutAct_9fa48("112025") ? tableInfo?.primaryKey && tableInfo?.primary_key : stryMutAct_9fa48("112024") ? false : stryMutAct_9fa48("112023") ? true : (stryCov_9fa48("112023", "112024", "112025"), (stryMutAct_9fa48("112026") ? tableInfo.primaryKey : (stryCov_9fa48("112026"), tableInfo?.primaryKey)) || (stryMutAct_9fa48("112027") ? tableInfo.primary_key : (stryCov_9fa48("112027"), tableInfo?.primary_key)));
      if (stryMutAct_9fa48("112030") ? Array.isArray(primaryKey) || primaryKey.length > 0 : stryMutAct_9fa48("112029") ? false : stryMutAct_9fa48("112028") ? true : (stryCov_9fa48("112028", "112029", "112030"), Array.isArray(primaryKey) && (stryMutAct_9fa48("112033") ? primaryKey.length <= 0 : stryMutAct_9fa48("112032") ? primaryKey.length >= 0 : stryMutAct_9fa48("112031") ? true : (stryCov_9fa48("112031", "112032", "112033"), primaryKey.length > 0)))) {
        if (stryMutAct_9fa48("112034")) {
          {}
        } else {
          stryCov_9fa48("112034");
          return primaryKey;
        }
      }
      if (stryMutAct_9fa48("112037") ? typeof primaryKey === 'string' || primaryKey.length > 0 : stryMutAct_9fa48("112036") ? false : stryMutAct_9fa48("112035") ? true : (stryCov_9fa48("112035", "112036", "112037"), (stryMutAct_9fa48("112039") ? typeof primaryKey !== 'string' : stryMutAct_9fa48("112038") ? true : (stryCov_9fa48("112038", "112039"), typeof primaryKey === (stryMutAct_9fa48("112040") ? "" : (stryCov_9fa48("112040"), 'string')))) && (stryMutAct_9fa48("112043") ? primaryKey.length <= 0 : stryMutAct_9fa48("112042") ? primaryKey.length >= 0 : stryMutAct_9fa48("112041") ? true : (stryCov_9fa48("112041", "112042", "112043"), primaryKey.length > 0)))) {
        if (stryMutAct_9fa48("112044")) {
          {}
        } else {
          stryCov_9fa48("112044");
          return stryMutAct_9fa48("112045") ? [] : (stryCov_9fa48("112045"), [primaryKey]);
        }
      }
      return stryMutAct_9fa48("112046") ? [] : (stryCov_9fa48("112046"), [DEFAULT_PRIMARY_KEY_COLUMN]);
    }
  }

  /**
   * Find primary key column index in INSERT columns list.
   * @param {Object} ast - INSERT AST.
   * @param {string} primaryKey - Primary key column.
   * @return {number} Column index.
   * @private
   */
  findPrimaryKeyIndex(ast, primaryKey) {
    if (stryMutAct_9fa48("112047")) {
      {}
    } else {
      stryCov_9fa48("112047");
      if (stryMutAct_9fa48("112050") ? !Array.isArray(ast.columns) && ast.columns.length === 0 : stryMutAct_9fa48("112049") ? false : stryMutAct_9fa48("112048") ? true : (stryCov_9fa48("112048", "112049", "112050"), (stryMutAct_9fa48("112051") ? Array.isArray(ast.columns) : (stryCov_9fa48("112051"), !Array.isArray(ast.columns))) || (stryMutAct_9fa48("112053") ? ast.columns.length !== 0 : stryMutAct_9fa48("112052") ? false : (stryCov_9fa48("112052", "112053"), ast.columns.length === 0)))) {
        if (stryMutAct_9fa48("112054")) {
          {}
        } else {
          stryCov_9fa48("112054");
          return 0;
        }
      }
      const index = ast.columns.findIndex(stryMutAct_9fa48("112055") ? () => undefined : (stryCov_9fa48("112055"), columnName => stryMutAct_9fa48("112058") ? String(columnName).toLowerCase() !== String(primaryKey).toLowerCase() : stryMutAct_9fa48("112057") ? false : stryMutAct_9fa48("112056") ? true : (stryCov_9fa48("112056", "112057", "112058"), (stryMutAct_9fa48("112059") ? String(columnName).toUpperCase() : (stryCov_9fa48("112059"), String(columnName).toLowerCase())) === (stryMutAct_9fa48("112060") ? String(primaryKey).toUpperCase() : (stryCov_9fa48("112060"), String(primaryKey).toLowerCase())))));
      return (stryMutAct_9fa48("112064") ? index < 0 : stryMutAct_9fa48("112063") ? index > 0 : stryMutAct_9fa48("112062") ? false : stryMutAct_9fa48("112061") ? true : (stryCov_9fa48("112061", "112062", "112063", "112064"), index >= 0)) ? index : 0;
    }
  }

  /**
   * Extract key value from INSERT row expression.
   * @param {Object} expr - Value expression.
   * @param {Array} params - Bound parameters.
   * @return {*} Key value.
   * @private
   */
  extractKeyValue(expr, params) {
    if (stryMutAct_9fa48("112065")) {
      {}
    } else {
      stryCov_9fa48("112065");
      if (stryMutAct_9fa48("112068") ? !expr && typeof expr !== 'object' : stryMutAct_9fa48("112067") ? false : stryMutAct_9fa48("112066") ? true : (stryCov_9fa48("112066", "112067", "112068"), (stryMutAct_9fa48("112069") ? expr : (stryCov_9fa48("112069"), !expr)) || (stryMutAct_9fa48("112071") ? typeof expr === 'object' : stryMutAct_9fa48("112070") ? false : (stryCov_9fa48("112070", "112071"), typeof expr !== (stryMutAct_9fa48("112072") ? "" : (stryCov_9fa48("112072"), 'object')))))) {
        if (stryMutAct_9fa48("112073")) {
          {}
        } else {
          stryCov_9fa48("112073");
          return expr;
        }
      }
      if (stryMutAct_9fa48("112076") ? expr.type !== QUERY_AST_NODE.LITERAL : stryMutAct_9fa48("112075") ? false : stryMutAct_9fa48("112074") ? true : (stryCov_9fa48("112074", "112075", "112076"), expr.type === QUERY_AST_NODE.LITERAL)) {
        if (stryMutAct_9fa48("112077")) {
          {}
        } else {
          stryCov_9fa48("112077");
          return expr.value;
        }
      }
      if (stryMutAct_9fa48("112080") ? expr.type !== QUERY_AST_NODE.PARAMETER : stryMutAct_9fa48("112079") ? false : stryMutAct_9fa48("112078") ? true : (stryCov_9fa48("112078", "112079", "112080"), expr.type === QUERY_AST_NODE.PARAMETER)) {
        if (stryMutAct_9fa48("112081")) {
          {}
        } else {
          stryCov_9fa48("112081");
          if (stryMutAct_9fa48("112084") ? typeof expr.index === 'number' && expr.index >= 0 || expr.index < params.length : stryMutAct_9fa48("112083") ? false : stryMutAct_9fa48("112082") ? true : (stryCov_9fa48("112082", "112083", "112084"), (stryMutAct_9fa48("112086") ? typeof expr.index === 'number' || expr.index >= 0 : stryMutAct_9fa48("112085") ? true : (stryCov_9fa48("112085", "112086"), (stryMutAct_9fa48("112088") ? typeof expr.index !== 'number' : stryMutAct_9fa48("112087") ? true : (stryCov_9fa48("112087", "112088"), typeof expr.index === (stryMutAct_9fa48("112089") ? "" : (stryCov_9fa48("112089"), 'number')))) && (stryMutAct_9fa48("112092") ? expr.index < 0 : stryMutAct_9fa48("112091") ? expr.index > 0 : stryMutAct_9fa48("112090") ? true : (stryCov_9fa48("112090", "112091", "112092"), expr.index >= 0)))) && (stryMutAct_9fa48("112095") ? expr.index >= params.length : stryMutAct_9fa48("112094") ? expr.index <= params.length : stryMutAct_9fa48("112093") ? true : (stryCov_9fa48("112093", "112094", "112095"), expr.index < params.length)))) {
            if (stryMutAct_9fa48("112096")) {
              {}
            } else {
              stryCov_9fa48("112096");
              return params[expr.index];
            }
          }
          return params[0];
        }
      }
      if (stryMutAct_9fa48("112099") ? expr.type !== QUERY_AST_NODE.UNARY : stryMutAct_9fa48("112098") ? false : stryMutAct_9fa48("112097") ? true : (stryCov_9fa48("112097", "112098", "112099"), expr.type === QUERY_AST_NODE.UNARY)) {
        if (stryMutAct_9fa48("112100")) {
          {}
        } else {
          stryCov_9fa48("112100");
          const operand = this.extractKeyValue(expr.operand, params);
          if (stryMutAct_9fa48("112103") ? expr.operator !== UNARY_MINUS : stryMutAct_9fa48("112102") ? false : stryMutAct_9fa48("112101") ? true : (stryCov_9fa48("112101", "112102", "112103"), expr.operator === UNARY_MINUS)) {
            if (stryMutAct_9fa48("112104")) {
              {}
            } else {
              stryCov_9fa48("112104");
              return stryMutAct_9fa48("112105") ? +Number(operand) : (stryCov_9fa48("112105"), -Number(operand));
            }
          }
          if (stryMutAct_9fa48("112108") ? expr.operator !== UNARY_PLUS : stryMutAct_9fa48("112107") ? false : stryMutAct_9fa48("112106") ? true : (stryCov_9fa48("112106", "112107", "112108"), expr.operator === UNARY_PLUS)) {
            if (stryMutAct_9fa48("112109")) {
              {}
            } else {
              stryCov_9fa48("112109");
              return Number(operand);
            }
          }
          return operand;
        }
      }
      return expr.value;
    }
  }

  /**
   * Create a deterministic operation identifier.
   * @param {Object} ast - Write AST.
   * @param {Array} params - Bound parameters.
   * @param {string|null} sessionId - Session identifier.
   * @return {string} Operation identifier.
   * @private
   */
  createOperationId(ast, params, sessionId) {
    if (stryMutAct_9fa48("112110")) {
      {}
    } else {
      stryCov_9fa48("112110");
      const payload = JSON.stringify(stryMutAct_9fa48("112111") ? {} : (stryCov_9fa48("112111"), {
        ast,
        paramsCount: params.length,
        sessionId: stryMutAct_9fa48("112114") ? sessionId && null : stryMutAct_9fa48("112113") ? false : stryMutAct_9fa48("112112") ? true : (stryCov_9fa48("112112", "112113", "112114"), sessionId || null)
      }));
      const digest = stryMutAct_9fa48("112115") ? createHash(HASH_ALGORITHM).update(payload).digest(DIGEST_ENCODING) : (stryCov_9fa48("112115"), createHash(HASH_ALGORITHM).update(payload).digest(DIGEST_ENCODING).slice(0, DIGEST_PREFIX_LENGTH));
      return stryMutAct_9fa48("112116") ? `` : (stryCov_9fa48("112116"), `${OPERATION_ID_PREFIX}${digest}`);
    }
  }
}
export { DistributedWriteCoordinator };
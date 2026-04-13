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
import { COLUMN, HTTP_STATUS, TYPEOF } from '../../constants/index.js';
import { BOOTSTRAP_API_ASSIGNMENT, BOOTSTRAP_API_DEFAULT, BOOTSTRAP_API_ERROR, BOOTSTRAP_API_LOG_MSG } from '../bootstrap-api-constants.js';
import { BOOTSTRAP_API_HANDOFF_PHASE, BOOTSTRAP_API_HANDOFF_STATUS } from '../bootstrap-api-constants.js';
import { BOOTSTRAP_PIPELINE_ERROR_CODE } from '../bootstrap-constants.js';
import { TABLES } from '../../constants/index.js';
import { runRetryableControlPlaneWrite } from '../shared/retryable-control-plane-write.js';
class ServiceRegistrationHandoffOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("23689")) {
      {}
    } else {
      stryCov_9fa48("23689");
      this.delegates = stryMutAct_9fa48("23692") ? options.delegates && {} : stryMutAct_9fa48("23691") ? false : stryMutAct_9fa48("23690") ? true : (stryCov_9fa48("23690", "23691", "23692"), options.delegates || {});
    }
  }
  getLogger() {
    if (stryMutAct_9fa48("23693")) {
      {}
    } else {
      stryCov_9fa48("23693");
      return stryMutAct_9fa48("23696") ? this.delegates.getLogger?.() && console : stryMutAct_9fa48("23695") ? false : stryMutAct_9fa48("23694") ? true : (stryCov_9fa48("23694", "23695", "23696"), (stryMutAct_9fa48("23697") ? this.delegates.getLogger() : (stryCov_9fa48("23697"), this.delegates.getLogger?.())) || console);
    }
  }
  getSqlQueryEngine() {
    if (stryMutAct_9fa48("23698")) {
      {}
    } else {
      stryCov_9fa48("23698");
      return stryMutAct_9fa48("23701") ? this.delegates.getSqlQueryEngine?.() && null : stryMutAct_9fa48("23700") ? false : stryMutAct_9fa48("23699") ? true : (stryCov_9fa48("23699", "23700", "23701"), (stryMutAct_9fa48("23702") ? this.delegates.getSqlQueryEngine() : (stryCov_9fa48("23702"), this.delegates.getSqlQueryEngine?.())) || null);
    }
  }
  getNow() {
    if (stryMutAct_9fa48("23703")) {
      {}
    } else {
      stryCov_9fa48("23703");
      return stryMutAct_9fa48("23706") ? this.delegates.getNow?.() && Date.now() : stryMutAct_9fa48("23705") ? false : stryMutAct_9fa48("23704") ? true : (stryCov_9fa48("23704", "23705", "23706"), (stryMutAct_9fa48("23707") ? this.delegates.getNow() : (stryCov_9fa48("23707"), this.delegates.getNow?.())) || Date.now());
    }
  }
  getRegisterServiceWriteRetryTimeoutMs() {
    if (stryMutAct_9fa48("23708")) {
      {}
    } else {
      stryCov_9fa48("23708");
      return stryMutAct_9fa48("23711") ? this.delegates.getRegisterServiceWriteRetryTimeoutMs?.() && BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_WRITE_RETRY_TIMEOUT_MS : stryMutAct_9fa48("23710") ? false : stryMutAct_9fa48("23709") ? true : (stryCov_9fa48("23709", "23710", "23711"), (stryMutAct_9fa48("23712") ? this.delegates.getRegisterServiceWriteRetryTimeoutMs() : (stryCov_9fa48("23712"), this.delegates.getRegisterServiceWriteRetryTimeoutMs?.())) || BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_WRITE_RETRY_TIMEOUT_MS);
    }
  }
  async sleep(delayMs) {
    if (stryMutAct_9fa48("23713")) {
      {}
    } else {
      stryCov_9fa48("23713");
      const sleepImpl = stryMutAct_9fa48("23714") ? this.delegates.getSleep() : (stryCov_9fa48("23714"), this.delegates.getSleep?.());
      if (stryMutAct_9fa48("23717") ? typeof sleepImpl !== TYPEOF.FUNCTION : stryMutAct_9fa48("23716") ? false : stryMutAct_9fa48("23715") ? true : (stryCov_9fa48("23715", "23716", "23717"), typeof sleepImpl === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("23718")) {
          {}
        } else {
          stryCov_9fa48("23718");
          await sleepImpl(delayMs);
          return;
        }
      }
      await new Promise(stryMutAct_9fa48("23719") ? () => undefined : (stryCov_9fa48("23719"), resolve => setTimeout(resolve, delayMs)));
    }
  }
  async writeRegisteredServiceRowWithRetry(serviceData, registeredServiceRow) {
    if (stryMutAct_9fa48("23720")) {
      {}
    } else {
      stryCov_9fa48("23720");
      return runRetryableControlPlaneWrite(stryMutAct_9fa48("23721") ? () => undefined : (stryCov_9fa48("23721"), () => this.delegates.executeBootstrapControlPlaneMutation(stryMutAct_9fa48("23722") ? {} : (stryCov_9fa48("23722"), {
        operation: stryMutAct_9fa48("23723") ? "" : (stryCov_9fa48("23723"), 'upsert'),
        tableName: TABLES.SERVICES,
        row: registeredServiceRow
      }), stryMutAct_9fa48("23724") ? {} : (stryCov_9fa48("23724"), {
        skipCacheWait: stryMutAct_9fa48("23725") ? false : (stryCov_9fa48("23725"), true)
      }))), stryMutAct_9fa48("23726") ? {} : (stryCov_9fa48("23726"), {
        timeoutMs: this.getRegisterServiceWriteRetryTimeoutMs(),
        now: stryMutAct_9fa48("23727") ? () => undefined : (stryCov_9fa48("23727"), () => this.getNow()),
        onRetry: ({
          attempt,
          delayMs,
          remainingMs,
          retryAfterMs,
          resultOrError
        }) => {
          if (stryMutAct_9fa48("23728")) {
            {}
          } else {
            stryCov_9fa48("23728");
            this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_WRITE_RETRY, stryMutAct_9fa48("23729") ? {} : (stryCov_9fa48("23729"), {
              serviceId: serviceData[COLUMN.SERVICE_ID],
              serviceType: serviceData[COLUMN.SERVICE_TYPE],
              nodeId: serviceData[COLUMN.NODE_ID],
              groupId: stryMutAct_9fa48("23732") ? serviceData[COLUMN.GROUP_ID] && null : stryMutAct_9fa48("23731") ? false : stryMutAct_9fa48("23730") ? true : (stryCov_9fa48("23730", "23731", "23732"), serviceData[COLUMN.GROUP_ID] || null),
              tableName: TABLES.SERVICES,
              attempt,
              retryAfterMs,
              delayMs,
              remainingMs,
              error: stryMutAct_9fa48("23735") ? (resultOrError?.error || resultOrError?.message) && 'retryable register-service metadata write failure' : stryMutAct_9fa48("23734") ? false : stryMutAct_9fa48("23733") ? true : (stryCov_9fa48("23733", "23734", "23735"), (stryMutAct_9fa48("23737") ? resultOrError?.error && resultOrError?.message : stryMutAct_9fa48("23736") ? false : (stryCov_9fa48("23736", "23737"), (stryMutAct_9fa48("23738") ? resultOrError.error : (stryCov_9fa48("23738"), resultOrError?.error)) || (stryMutAct_9fa48("23739") ? resultOrError.message : (stryCov_9fa48("23739"), resultOrError?.message)))) || (stryMutAct_9fa48("23740") ? "" : (stryCov_9fa48("23740"), 'retryable register-service metadata write failure')))
            }));
          }
        },
        sleep: stryMutAct_9fa48("23741") ? () => undefined : (stryCov_9fa48("23741"), delayMs => this.sleep(delayMs))
      }));
    }
  }
  isRetryableRegisteredServicePublicationError(error) {
    if (stryMutAct_9fa48("23742")) {
      {}
    } else {
      stryCov_9fa48("23742");
      return stryMutAct_9fa48("23745") ? Number.isFinite(error?.statusCode) && Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE || error?.details?.tableName === TABLES.SERVICES : stryMutAct_9fa48("23744") ? false : stryMutAct_9fa48("23743") ? true : (stryCov_9fa48("23743", "23744", "23745"), (stryMutAct_9fa48("23747") ? Number.isFinite(error?.statusCode) || Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE : stryMutAct_9fa48("23746") ? true : (stryCov_9fa48("23746", "23747"), Number.isFinite(stryMutAct_9fa48("23748") ? error.statusCode : (stryCov_9fa48("23748"), error?.statusCode)) && (stryMutAct_9fa48("23750") ? Math.floor(error.statusCode) !== HTTP_STATUS.SERVICE_UNAVAILABLE : stryMutAct_9fa48("23749") ? true : (stryCov_9fa48("23749", "23750"), Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE)))) && (stryMutAct_9fa48("23752") ? error?.details?.tableName !== TABLES.SERVICES : stryMutAct_9fa48("23751") ? true : (stryCov_9fa48("23751", "23752"), (stryMutAct_9fa48("23754") ? error.details?.tableName : stryMutAct_9fa48("23753") ? error?.details.tableName : (stryCov_9fa48("23753", "23754"), error?.details?.tableName)) === TABLES.SERVICES)));
    }
  }
  resolveTypedRegisterServiceErrorLogMessage(error) {
    if (stryMutAct_9fa48("23755")) {
      {}
    } else {
      stryCov_9fa48("23755");
      if (stryMutAct_9fa48("23758") ? error?.errorCode !== BOOTSTRAP_PIPELINE_ERROR_CODE.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT : stryMutAct_9fa48("23757") ? false : stryMutAct_9fa48("23756") ? true : (stryCov_9fa48("23756", "23757", "23758"), (stryMutAct_9fa48("23759") ? error.errorCode : (stryCov_9fa48("23759"), error?.errorCode)) === BOOTSTRAP_PIPELINE_ERROR_CODE.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT)) {
        if (stryMutAct_9fa48("23760")) {
          {}
        } else {
          stryCov_9fa48("23760");
          return BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT;
        }
      }
      if (stryMutAct_9fa48("23762") ? false : stryMutAct_9fa48("23761") ? true : (stryCov_9fa48("23761", "23762"), this.isRetryableRegisteredServicePublicationError(error))) {
        if (stryMutAct_9fa48("23763")) {
          {}
        } else {
          stryCov_9fa48("23763");
          return BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_DEFERRED;
        }
      }
      return BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED;
    }
  }
  async handleRegisterServiceRequest(request, reply) {
    if (stryMutAct_9fa48("23764")) {
      {}
    } else {
      stryCov_9fa48("23764");
      const serviceData = stryMutAct_9fa48("23767") ? request.body && {} : stryMutAct_9fa48("23766") ? false : stryMutAct_9fa48("23765") ? true : (stryCov_9fa48("23765", "23766", "23767"), request.body || {});
      let assignmentContext = null;
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.RECEIVED_REGISTER_SERVICE, stryMutAct_9fa48("23768") ? {} : (stryCov_9fa48("23768"), {
        serviceId: serviceData[COLUMN.SERVICE_ID],
        serviceType: serviceData[COLUMN.SERVICE_TYPE],
        nodeId: serviceData[COLUMN.NODE_ID],
        groupId: serviceData[COLUMN.GROUP_ID]
      }));
      if (stryMutAct_9fa48("23771") ? false : stryMutAct_9fa48("23770") ? true : stryMutAct_9fa48("23769") ? serviceData[COLUMN.SERVICE_ID] : (stryCov_9fa48("23769", "23770", "23771"), !serviceData[COLUMN.SERVICE_ID])) {
        if (stryMutAct_9fa48("23772")) {
          {}
        } else {
          stryCov_9fa48("23772");
          reply.code(HTTP_STATUS.BAD_REQUEST);
          return stryMutAct_9fa48("23773") ? {} : (stryCov_9fa48("23773"), {
            success: stryMutAct_9fa48("23774") ? true : (stryCov_9fa48("23774"), false),
            error: BOOTSTRAP_API_ERROR.SERVICE_ID_REQUIRED
          });
        }
      }
      if (stryMutAct_9fa48("23777") ? false : stryMutAct_9fa48("23776") ? true : stryMutAct_9fa48("23775") ? serviceData[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("23775", "23776", "23777"), !serviceData[COLUMN.SERVICE_TYPE])) {
        if (stryMutAct_9fa48("23778")) {
          {}
        } else {
          stryCov_9fa48("23778");
          reply.code(HTTP_STATUS.BAD_REQUEST);
          return stryMutAct_9fa48("23779") ? {} : (stryCov_9fa48("23779"), {
            success: stryMutAct_9fa48("23780") ? true : (stryCov_9fa48("23780"), false),
            error: BOOTSTRAP_API_ERROR.SERVICE_TYPE_REQUIRED
          });
        }
      }
      if (stryMutAct_9fa48("23783") ? false : stryMutAct_9fa48("23782") ? true : stryMutAct_9fa48("23781") ? serviceData[COLUMN.NODE_ID] : (stryCov_9fa48("23781", "23782", "23783"), !serviceData[COLUMN.NODE_ID])) {
        if (stryMutAct_9fa48("23784")) {
          {}
        } else {
          stryCov_9fa48("23784");
          reply.code(HTTP_STATUS.BAD_REQUEST);
          return stryMutAct_9fa48("23785") ? {} : (stryCov_9fa48("23785"), {
            success: stryMutAct_9fa48("23786") ? true : (stryCov_9fa48("23786"), false),
            error: BOOTSTRAP_API_ERROR.SERVICE_NODE_ID_REQUIRED
          });
        }
      }
      let handoffContext = null;
      let previousRegisteredServiceRow = null;
      let targetServiceRowWritten = stryMutAct_9fa48("23787") ? true : (stryCov_9fa48("23787"), false);
      let sourceRemovalCompleted = stryMutAct_9fa48("23788") ? true : (stryCov_9fa48("23788"), false);
      try {
        if (stryMutAct_9fa48("23789")) {
          {}
        } else {
          stryCov_9fa48("23789");
          if (stryMutAct_9fa48("23792") ? false : stryMutAct_9fa48("23791") ? true : stryMutAct_9fa48("23790") ? this.getSqlQueryEngine() : (stryCov_9fa48("23790", "23791", "23792"), !this.getSqlQueryEngine())) {
            if (stryMutAct_9fa48("23793")) {
              {}
            } else {
              stryCov_9fa48("23793");
              this.getLogger().error(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_MISSING);
              reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
              return stryMutAct_9fa48("23794") ? {} : (stryCov_9fa48("23794"), {
                success: stryMutAct_9fa48("23795") ? true : (stryCov_9fa48("23795"), false),
                error: BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE
              });
            }
          }
          assignmentContext = await this.delegates.validateMoveReplicaAssignmentToken(serviceData);
          this.delegates.assertSingleOwnerReplicaRegistration(serviceData, assignmentContext);
          handoffContext = await this.delegates.startMoveReplicaHandoff(serviceData, assignmentContext);
          if (stryMutAct_9fa48("23797") ? false : stryMutAct_9fa48("23796") ? true : (stryCov_9fa48("23796", "23797"), handoffContext)) {
            if (stryMutAct_9fa48("23798")) {
              {}
            } else {
              stryCov_9fa48("23798");
              previousRegisteredServiceRow = await this.delegates.readCurrentRegisteredServiceRow(serviceData[COLUMN.SERVICE_ID]);
            }
          }
          if (stryMutAct_9fa48("23800") ? false : stryMutAct_9fa48("23799") ? true : (stryCov_9fa48("23799", "23800"), handoffContext)) {
            if (stryMutAct_9fa48("23801")) {
              {}
            } else {
              stryCov_9fa48("23801");
              await this.delegates.executeMoveReplicaHandoffPhase(handoffContext, BOOTSTRAP_API_HANDOFF_PHASE.VERIFY_TARGET, stryMutAct_9fa48("23802") ? "" : (stryCov_9fa48("23802"), 'syncing'), BOOTSTRAP_API_HANDOFF_STATUS.VERIFYING, stryMutAct_9fa48("23803") ? () => undefined : (stryCov_9fa48("23803"), () => this.delegates.verifyMoveReplicaHandoffTarget(handoffContext, serviceData)));
            }
          }
          const registeredServiceRow = this.delegates.buildRegisteredServiceMutationRow(serviceData);
          try {
            if (stryMutAct_9fa48("23804")) {
              {}
            } else {
              stryCov_9fa48("23804");
              const mutationResult = await this.writeRegisteredServiceRowWithRetry(serviceData, registeredServiceRow);
              if (stryMutAct_9fa48("23807") ? mutationResult?.success !== false : stryMutAct_9fa48("23806") ? false : stryMutAct_9fa48("23805") ? true : (stryCov_9fa48("23805", "23806", "23807"), (stryMutAct_9fa48("23808") ? mutationResult.success : (stryCov_9fa48("23808"), mutationResult?.success)) === (stryMutAct_9fa48("23809") ? true : (stryCov_9fa48("23809"), false)))) {
                if (stryMutAct_9fa48("23810")) {
                  {}
                } else {
                  stryCov_9fa48("23810");
                  throw this.delegates.buildBootstrapControlPlaneQueryError(mutationResult, BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED);
                }
              }
            }
          } catch (mutationError) {
            if (stryMutAct_9fa48("23811")) {
              {}
            } else {
              stryCov_9fa48("23811");
              throw this.delegates.buildBootstrapControlPlaneMutationError(mutationError, TABLES.SERVICES, BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED);
            }
          }
          targetServiceRowWritten = stryMutAct_9fa48("23812") ? false : (stryCov_9fa48("23812"), true);
          if (stryMutAct_9fa48("23814") ? false : stryMutAct_9fa48("23813") ? true : (stryCov_9fa48("23813", "23814"), handoffContext)) {
            if (stryMutAct_9fa48("23815")) {
              {}
            } else {
              stryCov_9fa48("23815");
              const expectedRegisteredService = this.delegates.buildExpectedRegisteredServiceData(registeredServiceRow);
              await this.delegates.waitForRegisteredServiceCacheVisibility(expectedRegisteredService);
            }
          }
          if (stryMutAct_9fa48("23817") ? false : stryMutAct_9fa48("23816") ? true : (stryCov_9fa48("23816", "23817"), handoffContext)) {
            if (stryMutAct_9fa48("23818")) {
              {}
            } else {
              stryCov_9fa48("23818");
              await this.delegates.executeMoveReplicaHandoffPhase(handoffContext, BOOTSTRAP_API_HANDOFF_PHASE.REMOVE_SOURCE, stryMutAct_9fa48("23819") ? "" : (stryCov_9fa48("23819"), 'stopping'), BOOTSTRAP_API_HANDOFF_STATUS.REMOVING, async () => {
                if (stryMutAct_9fa48("23820")) {
                  {}
                } else {
                  stryCov_9fa48("23820");
                  await this.delegates.removeLocalSourceReplicaForMoveReplica(serviceData);
                  sourceRemovalCompleted = stryMutAct_9fa48("23821") ? false : (stryCov_9fa48("23821"), true);
                }
              });
              await this.delegates.completeMoveReplicaHandoff(handoffContext);
            }
          }
          this.getLogger().info(BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTERED, stryMutAct_9fa48("23822") ? {} : (stryCov_9fa48("23822"), {
            serviceId: serviceData[COLUMN.SERVICE_ID],
            serviceType: serviceData[COLUMN.SERVICE_TYPE],
            nodeId: serviceData[COLUMN.NODE_ID],
            groupId: serviceData[COLUMN.GROUP_ID],
            assignmentId: stryMutAct_9fa48("23825") ? assignmentContext?.assignmentId && null : stryMutAct_9fa48("23824") ? false : stryMutAct_9fa48("23823") ? true : (stryCov_9fa48("23823", "23824", "23825"), (stryMutAct_9fa48("23826") ? assignmentContext.assignmentId : (stryCov_9fa48("23826"), assignmentContext?.assignmentId)) || null),
            operationId: stryMutAct_9fa48("23829") ? handoffContext?.operationId && null : stryMutAct_9fa48("23828") ? false : stryMutAct_9fa48("23827") ? true : (stryCov_9fa48("23827", "23828", "23829"), (stryMutAct_9fa48("23830") ? handoffContext.operationId : (stryCov_9fa48("23830"), handoffContext?.operationId)) || null)
          }));
          return stryMutAct_9fa48("23831") ? {} : (stryCov_9fa48("23831"), {
            success: stryMutAct_9fa48("23832") ? false : (stryCov_9fa48("23832"), true),
            serviceId: serviceData[COLUMN.SERVICE_ID],
            assignmentId: stryMutAct_9fa48("23835") ? assignmentContext?.assignmentId && null : stryMutAct_9fa48("23834") ? false : stryMutAct_9fa48("23833") ? true : (stryCov_9fa48("23833", "23834", "23835"), (stryMutAct_9fa48("23836") ? assignmentContext.assignmentId : (stryCov_9fa48("23836"), assignmentContext?.assignmentId)) || null),
            operationId: stryMutAct_9fa48("23839") ? handoffContext?.operationId && null : stryMutAct_9fa48("23838") ? false : stryMutAct_9fa48("23837") ? true : (stryCov_9fa48("23837", "23838", "23839"), (stryMutAct_9fa48("23840") ? handoffContext.operationId : (stryCov_9fa48("23840"), handoffContext?.operationId)) || null)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("23841")) {
          {}
        } else {
          stryCov_9fa48("23841");
          if (stryMutAct_9fa48("23844") ? handoffContext && targetServiceRowWritten || !sourceRemovalCompleted : stryMutAct_9fa48("23843") ? false : stryMutAct_9fa48("23842") ? true : (stryCov_9fa48("23842", "23843", "23844"), (stryMutAct_9fa48("23846") ? handoffContext || targetServiceRowWritten : stryMutAct_9fa48("23845") ? true : (stryCov_9fa48("23845", "23846"), handoffContext && targetServiceRowWritten)) && (stryMutAct_9fa48("23847") ? sourceRemovalCompleted : (stryCov_9fa48("23847"), !sourceRemovalCompleted)))) {
            if (stryMutAct_9fa48("23848")) {
              {}
            } else {
              stryCov_9fa48("23848");
              await this.delegates.restoreRegisteredServiceRowAfterFailedHandoff(previousRegisteredServiceRow, serviceData, error);
            }
          }
          if (stryMutAct_9fa48("23850") ? false : stryMutAct_9fa48("23849") ? true : (stryCov_9fa48("23849", "23850"), handoffContext)) {
            if (stryMutAct_9fa48("23851")) {
              {}
            } else {
              stryCov_9fa48("23851");
              const shouldPreserveRetryableHandoff = this.delegates.shouldPreserveMoveReplicaHandoffReservation(handoffContext, error, sourceRemovalCompleted);
              if (stryMutAct_9fa48("23853") ? false : stryMutAct_9fa48("23852") ? true : (stryCov_9fa48("23852", "23853"), shouldPreserveRetryableHandoff)) {
                if (stryMutAct_9fa48("23854")) {
                  {}
                } else {
                  stryCov_9fa48("23854");
                  this.getLogger().warn(stryMutAct_9fa48("23855") ? "" : (stryCov_9fa48("23855"), 'Preserving MOVE_REPLICA handoff reservation after retryable register-service failure'), stryMutAct_9fa48("23856") ? {} : (stryCov_9fa48("23856"), {
                    operationId: handoffContext.operationId,
                    serviceId: handoffContext.replicaId,
                    sourceNodeId: handoffContext.sourceNodeId,
                    targetNodeId: handoffContext.targetNodeId,
                    code: stryMutAct_9fa48("23859") ? error?.errorCode && null : stryMutAct_9fa48("23858") ? false : stryMutAct_9fa48("23857") ? true : (stryCov_9fa48("23857", "23858", "23859"), (stryMutAct_9fa48("23860") ? error.errorCode : (stryCov_9fa48("23860"), error?.errorCode)) || null),
                    error: stryMutAct_9fa48("23863") ? error?.message && null : stryMutAct_9fa48("23862") ? false : stryMutAct_9fa48("23861") ? true : (stryCov_9fa48("23861", "23862", "23863"), (stryMutAct_9fa48("23864") ? error.message : (stryCov_9fa48("23864"), error?.message)) || null)
                  }));
                }
              } else {
                if (stryMutAct_9fa48("23865")) {
                  {}
                } else {
                  stryCov_9fa48("23865");
                  await this.delegates.failMoveReplicaHandoff(handoffContext, error);
                }
              }
            }
          }
          if (stryMutAct_9fa48("23868") ? Number.isFinite(error?.statusCode) || typeof error?.errorCode === TYPEOF.STRING : stryMutAct_9fa48("23867") ? false : stryMutAct_9fa48("23866") ? true : (stryCov_9fa48("23866", "23867", "23868"), Number.isFinite(stryMutAct_9fa48("23869") ? error.statusCode : (stryCov_9fa48("23869"), error?.statusCode)) && (stryMutAct_9fa48("23871") ? typeof error?.errorCode !== TYPEOF.STRING : stryMutAct_9fa48("23870") ? true : (stryCov_9fa48("23870", "23871"), typeof (stryMutAct_9fa48("23872") ? error.errorCode : (stryCov_9fa48("23872"), error?.errorCode)) === TYPEOF.STRING)))) {
            if (stryMutAct_9fa48("23873")) {
              {}
            } else {
              stryCov_9fa48("23873");
              const typedErrorLogMessage = this.resolveTypedRegisterServiceErrorLogMessage(error);
              this.getLogger().warn(typedErrorLogMessage, stryMutAct_9fa48("23874") ? {} : (stryCov_9fa48("23874"), {
                serviceId: serviceData[COLUMN.SERVICE_ID],
                assignmentId: stryMutAct_9fa48("23877") ? serviceData[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID] && null : stryMutAct_9fa48("23876") ? false : stryMutAct_9fa48("23875") ? true : (stryCov_9fa48("23875", "23876", "23877"), serviceData[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID] || null),
                code: error.errorCode,
                error: error.message,
                details: stryMutAct_9fa48("23880") ? error.details && null : stryMutAct_9fa48("23879") ? false : stryMutAct_9fa48("23878") ? true : (stryCov_9fa48("23878", "23879", "23880"), error.details || null)
              }));
              reply.code(Math.floor(error.statusCode));
              return stryMutAct_9fa48("23881") ? {} : (stryCov_9fa48("23881"), {
                success: stryMutAct_9fa48("23882") ? true : (stryCov_9fa48("23882"), false),
                error: error.message,
                code: error.errorCode,
                ...(Number.isFinite(error.retryAfterMs) ? stryMutAct_9fa48("23883") ? {} : (stryCov_9fa48("23883"), {
                  retryAfterMs: Math.floor(error.retryAfterMs)
                }) : {}),
                ...((stryMutAct_9fa48("23886") ? error.details || typeof error.details === TYPEOF.OBJECT : stryMutAct_9fa48("23885") ? false : stryMutAct_9fa48("23884") ? true : (stryCov_9fa48("23884", "23885", "23886"), error.details && (stryMutAct_9fa48("23888") ? typeof error.details !== TYPEOF.OBJECT : stryMutAct_9fa48("23887") ? true : (stryCov_9fa48("23887", "23888"), typeof error.details === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("23889") ? {} : (stryCov_9fa48("23889"), {
                  details: error.details
                }) : {})
              });
            }
          }
          this.getLogger().error(BOOTSTRAP_API_LOG_MSG.REGISTER_SERVICE_FAILED, stryMutAct_9fa48("23890") ? {} : (stryCov_9fa48("23890"), {
            serviceId: serviceData[COLUMN.SERVICE_ID],
            error: error.message,
            stack: error.stack
          }));
          reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
          throw error;
        }
      }
    }
  }
}
export { ServiceRegistrationHandoffOwner };
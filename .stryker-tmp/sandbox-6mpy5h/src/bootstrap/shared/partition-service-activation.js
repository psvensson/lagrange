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
import { AddressManager } from '../../address/address-manager.js';
import { PartitionServiceRowOwner } from '../../partition/partition-service-row-owner.js';
import { isRetryableControlPlaneError } from '../../control-plane/control-plane-error-classification.js';
import { ENTITY_TYPE, TYPEOF } from '../../constants/index.js';
const PARTITION_SERVICE_ACTIVATION_ERROR = Object.freeze(stryMutAct_9fa48("30296") ? {} : (stryCov_9fa48("30296"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("30297") ? "" : (stryCov_9fa48("30297"), 'Partition service activation requires nodeId'),
  WRITER_REQUIRED: stryMutAct_9fa48("30298") ? "" : (stryCov_9fa48("30298"), 'Partition service activation requires system table writer'),
  ROUTER_REQUIRED: stryMutAct_9fa48("30299") ? "" : (stryCov_9fa48("30299"), 'Partition service activation requires router registration lookup'),
  runtimeRequired: stryMutAct_9fa48("30300") ? () => undefined : (stryCov_9fa48("30300"), replicaId => stryMutAct_9fa48("30301") ? `` : (stryCov_9fa48("30301"), `Partition service activation requires initialized runtime for ${replicaId}`)),
  replicaHandlerRequired: stryMutAct_9fa48("30302") ? () => undefined : (stryCov_9fa48("30302"), replicaId => (stryMutAct_9fa48("30303") ? `` : (stryCov_9fa48("30303"), `Partition service activation requires replica handler `)) + (stryMutAct_9fa48("30304") ? `` : (stryCov_9fa48("30304"), `registration for ${replicaId}`)))
}));
function resolveReplicaUnifiedAddress(nodeId, replicaId, service) {
  if (stryMutAct_9fa48("30305")) {
    {}
  } else {
    stryCov_9fa48("30305");
    if (stryMutAct_9fa48("30308") ? service || typeof service.getUnifiedAddress === TYPEOF.FUNCTION : stryMutAct_9fa48("30307") ? false : stryMutAct_9fa48("30306") ? true : (stryCov_9fa48("30306", "30307", "30308"), service && (stryMutAct_9fa48("30310") ? typeof service.getUnifiedAddress !== TYPEOF.FUNCTION : stryMutAct_9fa48("30309") ? true : (stryCov_9fa48("30309", "30310"), typeof service.getUnifiedAddress === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("30311")) {
        {}
      } else {
        stryCov_9fa48("30311");
        return service.getUnifiedAddress();
      }
    }
    if (stryMutAct_9fa48("30314") ? typeof service?.unifiedAddress === TYPEOF.STRING || service.unifiedAddress.length > 0 : stryMutAct_9fa48("30313") ? false : stryMutAct_9fa48("30312") ? true : (stryCov_9fa48("30312", "30313", "30314"), (stryMutAct_9fa48("30316") ? typeof service?.unifiedAddress !== TYPEOF.STRING : stryMutAct_9fa48("30315") ? true : (stryCov_9fa48("30315", "30316"), typeof (stryMutAct_9fa48("30317") ? service.unifiedAddress : (stryCov_9fa48("30317"), service?.unifiedAddress)) === TYPEOF.STRING)) && (stryMutAct_9fa48("30320") ? service.unifiedAddress.length <= 0 : stryMutAct_9fa48("30319") ? service.unifiedAddress.length >= 0 : stryMutAct_9fa48("30318") ? true : (stryCov_9fa48("30318", "30319", "30320"), service.unifiedAddress.length > 0)))) {
      if (stryMutAct_9fa48("30321")) {
        {}
      } else {
        stryCov_9fa48("30321");
        return service.unifiedAddress;
      }
    }
    return AddressManager.getInstance().format(nodeId, ENTITY_TYPE.PARTITION, replicaId);
  }
}
function isTransientActivationError(error) {
  if (stryMutAct_9fa48("30322")) {
    {}
  } else {
    stryCov_9fa48("30322");
    return isRetryableControlPlaneError(error);
  }
}
async function activatePartitionServiceRows(options = {}) {
  if (stryMutAct_9fa48("30323")) {
    {}
  } else {
    stryCov_9fa48("30323");
    if (stryMutAct_9fa48("30326") ? typeof options.nodeId !== TYPEOF.STRING && options.nodeId.length === 0 : stryMutAct_9fa48("30325") ? false : stryMutAct_9fa48("30324") ? true : (stryCov_9fa48("30324", "30325", "30326"), (stryMutAct_9fa48("30328") ? typeof options.nodeId === TYPEOF.STRING : stryMutAct_9fa48("30327") ? false : (stryCov_9fa48("30327", "30328"), typeof options.nodeId !== TYPEOF.STRING)) || (stryMutAct_9fa48("30330") ? options.nodeId.length !== 0 : stryMutAct_9fa48("30329") ? false : (stryCov_9fa48("30329", "30330"), options.nodeId.length === 0)))) {
      if (stryMutAct_9fa48("30331")) {
        {}
      } else {
        stryCov_9fa48("30331");
        throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.NODE_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("30334") ? false : stryMutAct_9fa48("30333") ? true : stryMutAct_9fa48("30332") ? options.systemTableWriter : (stryCov_9fa48("30332", "30333", "30334"), !options.systemTableWriter)) {
      if (stryMutAct_9fa48("30335")) {
        {}
      } else {
        stryCov_9fa48("30335");
        throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.WRITER_REQUIRED);
      }
    }
    const isReplicaHandlerRegistered = (stryMutAct_9fa48("30338") ? typeof options.isReplicaHandlerRegistered !== TYPEOF.FUNCTION : stryMutAct_9fa48("30337") ? false : stryMutAct_9fa48("30336") ? true : (stryCov_9fa48("30336", "30337", "30338"), typeof options.isReplicaHandlerRegistered === TYPEOF.FUNCTION)) ? options.isReplicaHandlerRegistered : (stryMutAct_9fa48("30341") ? options.messageRouter || typeof options.messageRouter.isRegistered === TYPEOF.FUNCTION : stryMutAct_9fa48("30340") ? false : stryMutAct_9fa48("30339") ? true : (stryCov_9fa48("30339", "30340", "30341"), options.messageRouter && (stryMutAct_9fa48("30343") ? typeof options.messageRouter.isRegistered !== TYPEOF.FUNCTION : stryMutAct_9fa48("30342") ? true : (stryCov_9fa48("30342", "30343"), typeof options.messageRouter.isRegistered === TYPEOF.FUNCTION)))) ? (replicaId, service) => {
      if (stryMutAct_9fa48("30344")) {
        {}
      } else {
        stryCov_9fa48("30344");
        return options.messageRouter.isRegistered(resolveReplicaUnifiedAddress(options.nodeId, replicaId, service));
      }
    } : null;
    if (stryMutAct_9fa48("30347") ? false : stryMutAct_9fa48("30346") ? true : stryMutAct_9fa48("30345") ? isReplicaHandlerRegistered : (stryCov_9fa48("30345", "30346", "30347"), !isReplicaHandlerRegistered)) {
      if (stryMutAct_9fa48("30348")) {
        {}
      } else {
        stryCov_9fa48("30348");
        throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.ROUTER_REQUIRED);
      }
    }
    const isPartitionServiceReady = (stryMutAct_9fa48("30351") ? typeof options.isPartitionServiceReady !== TYPEOF.FUNCTION : stryMutAct_9fa48("30350") ? false : stryMutAct_9fa48("30349") ? true : (stryCov_9fa48("30349", "30350", "30351"), typeof options.isPartitionServiceReady === TYPEOF.FUNCTION)) ? options.isPartitionServiceReady : stryMutAct_9fa48("30352") ? () => undefined : (stryCov_9fa48("30352"), (_replicaId, service) => stryMutAct_9fa48("30355") ? service?.initialized === false : stryMutAct_9fa48("30354") ? false : stryMutAct_9fa48("30353") ? true : (stryCov_9fa48("30353", "30354", "30355"), (stryMutAct_9fa48("30356") ? service.initialized : (stryCov_9fa48("30356"), service?.initialized)) !== (stryMutAct_9fa48("30357") ? true : (stryCov_9fa48("30357"), false))));
    const partitionServices = options.partitionServices instanceof Map ? options.partitionServices : new Map();
    const owner = new PartitionServiceRowOwner(stryMutAct_9fa48("30358") ? {} : (stryCov_9fa48("30358"), {
      systemTableWriter: options.systemTableWriter,
      now: (stryMutAct_9fa48("30361") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("30360") ? false : stryMutAct_9fa48("30359") ? true : (stryCov_9fa48("30359", "30360", "30361"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("30362") ? () => undefined : (stryCov_9fa48("30362"), () => Date.now())
    }));
    let activatedCount = 0;
    for (const [replicaId, service] of partitionServices.entries()) {
      if (stryMutAct_9fa48("30363")) {
        {}
      } else {
        stryCov_9fa48("30363");
        const partitionId = stryMutAct_9fa48("30366") ? service?.partitionId && null : stryMutAct_9fa48("30365") ? false : stryMutAct_9fa48("30364") ? true : (stryCov_9fa48("30364", "30365", "30366"), (stryMutAct_9fa48("30367") ? service.partitionId : (stryCov_9fa48("30367"), service?.partitionId)) || null);
        if (stryMutAct_9fa48("30370") ? typeof partitionId !== TYPEOF.STRING && partitionId.length === 0 : stryMutAct_9fa48("30369") ? false : stryMutAct_9fa48("30368") ? true : (stryCov_9fa48("30368", "30369", "30370"), (stryMutAct_9fa48("30372") ? typeof partitionId === TYPEOF.STRING : stryMutAct_9fa48("30371") ? false : (stryCov_9fa48("30371", "30372"), typeof partitionId !== TYPEOF.STRING)) || (stryMutAct_9fa48("30374") ? partitionId.length !== 0 : stryMutAct_9fa48("30373") ? false : (stryCov_9fa48("30373", "30374"), partitionId.length === 0)))) {
          if (stryMutAct_9fa48("30375")) {
            {}
          } else {
            stryCov_9fa48("30375");
            continue;
          }
        }
        const runtimeReady = await Promise.resolve(isPartitionServiceReady(replicaId, service));
        if (stryMutAct_9fa48("30378") ? runtimeReady === true : stryMutAct_9fa48("30377") ? false : stryMutAct_9fa48("30376") ? true : (stryCov_9fa48("30376", "30377", "30378"), runtimeReady !== (stryMutAct_9fa48("30379") ? false : (stryCov_9fa48("30379"), true)))) {
          if (stryMutAct_9fa48("30380")) {
            {}
          } else {
            stryCov_9fa48("30380");
            throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.runtimeRequired(replicaId));
          }
        }
        const handlerRegistered = await Promise.resolve(isReplicaHandlerRegistered(replicaId, service));
        if (stryMutAct_9fa48("30383") ? handlerRegistered === true : stryMutAct_9fa48("30382") ? false : stryMutAct_9fa48("30381") ? true : (stryCov_9fa48("30381", "30382", "30383"), handlerRegistered !== (stryMutAct_9fa48("30384") ? false : (stryCov_9fa48("30384"), true)))) {
          if (stryMutAct_9fa48("30385")) {
            {}
          } else {
            stryCov_9fa48("30385");
            throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.replicaHandlerRequired(replicaId));
          }
        }
        try {
          if (stryMutAct_9fa48("30386")) {
            {}
          } else {
            stryCov_9fa48("30386");
            await owner.activateReplica(stryMutAct_9fa48("30387") ? {} : (stryCov_9fa48("30387"), {
              partitionId,
              replicaId,
              nodeId: options.nodeId,
              service
            }));
            stryMutAct_9fa48("30388") ? activatedCount -= 1 : (stryCov_9fa48("30388"), activatedCount += 1);
          }
        } catch (error) {
          if (stryMutAct_9fa48("30389")) {
            {}
          } else {
            stryCov_9fa48("30389");
            if (stryMutAct_9fa48("30392") ? options.deferTransientFailures === true || isTransientActivationError(error) : stryMutAct_9fa48("30391") ? false : stryMutAct_9fa48("30390") ? true : (stryCov_9fa48("30390", "30391", "30392"), (stryMutAct_9fa48("30394") ? options.deferTransientFailures !== true : stryMutAct_9fa48("30393") ? true : (stryCov_9fa48("30393", "30394"), options.deferTransientFailures === (stryMutAct_9fa48("30395") ? false : (stryCov_9fa48("30395"), true)))) && isTransientActivationError(error))) {
              if (stryMutAct_9fa48("30396")) {
                {}
              } else {
                stryCov_9fa48("30396");
                if (stryMutAct_9fa48("30399") ? typeof options.onDeferredActivation !== TYPEOF.FUNCTION : stryMutAct_9fa48("30398") ? false : stryMutAct_9fa48("30397") ? true : (stryCov_9fa48("30397", "30398", "30399"), typeof options.onDeferredActivation === TYPEOF.FUNCTION)) {
                  if (stryMutAct_9fa48("30400")) {
                    {}
                  } else {
                    stryCov_9fa48("30400");
                    await Promise.resolve(options.onDeferredActivation(stryMutAct_9fa48("30401") ? {} : (stryCov_9fa48("30401"), {
                      partitionId,
                      replicaId,
                      nodeId: options.nodeId,
                      error
                    })));
                  }
                }
                continue;
              }
            }
            throw error;
          }
        }
      }
    }
    return activatedCount;
  }
}
export { activatePartitionServiceRows, PARTITION_SERVICE_ACTIVATION_ERROR };
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
import { MessageGroupServiceRowOwner } from '../../message-group/message-group-service-row-owner.js';
import { isRetryableControlPlaneError } from '../../control-plane/control-plane-error-classification.js';
import { ENTITY_TYPE, TYPEOF } from '../../constants/index.js';
const MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR = Object.freeze(stryMutAct_9fa48("29350") ? {} : (stryCov_9fa48("29350"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("29351") ? "" : (stryCov_9fa48("29351"), 'Message-group service activation requires nodeId'),
  WRITER_REQUIRED: stryMutAct_9fa48("29352") ? "" : (stryCov_9fa48("29352"), 'Message-group service activation requires system table writer'),
  ACTIVATOR_REQUIRED: stryMutAct_9fa48("29353") ? "" : (stryCov_9fa48("29353"), 'Message-group service activation requires a replica activator'),
  ROUTER_REQUIRED: stryMutAct_9fa48("29354") ? "" : (stryCov_9fa48("29354"), 'Message-group service activation requires router registration lookup'),
  HANDLER_REQUIRED: stryMutAct_9fa48("29355") ? "" : (stryCov_9fa48("29355"), 'Message-group service activation requires handler registration'),
  ENDPOINTS_REQUIRED: stryMutAct_9fa48("29356") ? "" : (stryCov_9fa48("29356"), 'Message-group service activation requires endpoint publication'),
  replicaHandlerRequired: stryMutAct_9fa48("29357") ? () => undefined : (stryCov_9fa48("29357"), replicaId => (stryMutAct_9fa48("29358") ? `` : (stryCov_9fa48("29358"), `Message-group service activation requires replica handler `)) + (stryMutAct_9fa48("29359") ? `` : (stryCov_9fa48("29359"), `registration for ${replicaId}`)))
}));
function resolveReplicaUnifiedAddress(nodeId, replicaId, service) {
  if (stryMutAct_9fa48("29360")) {
    {}
  } else {
    stryCov_9fa48("29360");
    if (stryMutAct_9fa48("29363") ? service || typeof service.getUnifiedAddress === TYPEOF.FUNCTION : stryMutAct_9fa48("29362") ? false : stryMutAct_9fa48("29361") ? true : (stryCov_9fa48("29361", "29362", "29363"), service && (stryMutAct_9fa48("29365") ? typeof service.getUnifiedAddress !== TYPEOF.FUNCTION : stryMutAct_9fa48("29364") ? true : (stryCov_9fa48("29364", "29365"), typeof service.getUnifiedAddress === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("29366")) {
        {}
      } else {
        stryCov_9fa48("29366");
        return service.getUnifiedAddress();
      }
    }
    if (stryMutAct_9fa48("29369") ? typeof service?.unifiedAddress === TYPEOF.STRING || service.unifiedAddress.length > 0 : stryMutAct_9fa48("29368") ? false : stryMutAct_9fa48("29367") ? true : (stryCov_9fa48("29367", "29368", "29369"), (stryMutAct_9fa48("29371") ? typeof service?.unifiedAddress !== TYPEOF.STRING : stryMutAct_9fa48("29370") ? true : (stryCov_9fa48("29370", "29371"), typeof (stryMutAct_9fa48("29372") ? service.unifiedAddress : (stryCov_9fa48("29372"), service?.unifiedAddress)) === TYPEOF.STRING)) && (stryMutAct_9fa48("29375") ? service.unifiedAddress.length <= 0 : stryMutAct_9fa48("29374") ? service.unifiedAddress.length >= 0 : stryMutAct_9fa48("29373") ? true : (stryCov_9fa48("29373", "29374", "29375"), service.unifiedAddress.length > 0)))) {
      if (stryMutAct_9fa48("29376")) {
        {}
      } else {
        stryCov_9fa48("29376");
        return service.unifiedAddress;
      }
    }
    return AddressManager.getInstance().format(nodeId, ENTITY_TYPE.MESSAGE_GROUP, replicaId);
  }
}
function isTransientActivationError(error) {
  if (stryMutAct_9fa48("29377")) {
    {}
  } else {
    stryCov_9fa48("29377");
    return isRetryableControlPlaneError(error);
  }
}
async function activateMessageGroupServiceRows(options = {}) {
  if (stryMutAct_9fa48("29378")) {
    {}
  } else {
    stryCov_9fa48("29378");
    if (stryMutAct_9fa48("29381") ? typeof options.nodeId !== TYPEOF.STRING && options.nodeId.length === 0 : stryMutAct_9fa48("29380") ? false : stryMutAct_9fa48("29379") ? true : (stryCov_9fa48("29379", "29380", "29381"), (stryMutAct_9fa48("29383") ? typeof options.nodeId === TYPEOF.STRING : stryMutAct_9fa48("29382") ? false : (stryCov_9fa48("29382", "29383"), typeof options.nodeId !== TYPEOF.STRING)) || (stryMutAct_9fa48("29385") ? options.nodeId.length !== 0 : stryMutAct_9fa48("29384") ? false : (stryCov_9fa48("29384", "29385"), options.nodeId.length === 0)))) {
      if (stryMutAct_9fa48("29386")) {
        {}
      } else {
        stryCov_9fa48("29386");
        throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.NODE_ID_REQUIRED);
      }
    }
    const activateReplica = (stryMutAct_9fa48("29389") ? typeof options.activateReplica !== TYPEOF.FUNCTION : stryMutAct_9fa48("29388") ? false : stryMutAct_9fa48("29387") ? true : (stryCov_9fa48("29387", "29388", "29389"), typeof options.activateReplica === TYPEOF.FUNCTION)) ? options.activateReplica : null;
    const systemTableWriter = stryMutAct_9fa48("29392") ? options.systemTableWriter && null : stryMutAct_9fa48("29391") ? false : stryMutAct_9fa48("29390") ? true : (stryCov_9fa48("29390", "29391", "29392"), options.systemTableWriter || null);
    if (stryMutAct_9fa48("29395") ? !activateReplica || !systemTableWriter : stryMutAct_9fa48("29394") ? false : stryMutAct_9fa48("29393") ? true : (stryCov_9fa48("29393", "29394", "29395"), (stryMutAct_9fa48("29396") ? activateReplica : (stryCov_9fa48("29396"), !activateReplica)) && (stryMutAct_9fa48("29397") ? systemTableWriter : (stryCov_9fa48("29397"), !systemTableWriter)))) {
      if (stryMutAct_9fa48("29398")) {
        {}
      } else {
        stryCov_9fa48("29398");
        throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.ACTIVATOR_REQUIRED);
      }
    }
    const handlerReady = stryMutAct_9fa48("29401") ? options.messageGroupServiceHandler != null && options.handlerRegistered === true : stryMutAct_9fa48("29400") ? false : stryMutAct_9fa48("29399") ? true : (stryCov_9fa48("29399", "29400", "29401"), (stryMutAct_9fa48("29403") ? options.messageGroupServiceHandler == null : stryMutAct_9fa48("29402") ? false : (stryCov_9fa48("29402", "29403"), options.messageGroupServiceHandler != null)) || (stryMutAct_9fa48("29405") ? options.handlerRegistered !== true : stryMutAct_9fa48("29404") ? false : (stryCov_9fa48("29404", "29405"), options.handlerRegistered === (stryMutAct_9fa48("29406") ? false : (stryCov_9fa48("29406"), true)))));
    if (stryMutAct_9fa48("29409") ? handlerReady === true : stryMutAct_9fa48("29408") ? false : stryMutAct_9fa48("29407") ? true : (stryCov_9fa48("29407", "29408", "29409"), handlerReady !== (stryMutAct_9fa48("29410") ? false : (stryCov_9fa48("29410"), true)))) {
      if (stryMutAct_9fa48("29411")) {
        {}
      } else {
        stryCov_9fa48("29411");
        throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.HANDLER_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("29414") ? options.endpointsPublished === true : stryMutAct_9fa48("29413") ? false : stryMutAct_9fa48("29412") ? true : (stryCov_9fa48("29412", "29413", "29414"), options.endpointsPublished !== (stryMutAct_9fa48("29415") ? false : (stryCov_9fa48("29415"), true)))) {
      if (stryMutAct_9fa48("29416")) {
        {}
      } else {
        stryCov_9fa48("29416");
        throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.ENDPOINTS_REQUIRED);
      }
    }
    const isReplicaHandlerRegistered = (stryMutAct_9fa48("29419") ? typeof options.isReplicaHandlerRegistered !== TYPEOF.FUNCTION : stryMutAct_9fa48("29418") ? false : stryMutAct_9fa48("29417") ? true : (stryCov_9fa48("29417", "29418", "29419"), typeof options.isReplicaHandlerRegistered === TYPEOF.FUNCTION)) ? options.isReplicaHandlerRegistered : (stryMutAct_9fa48("29422") ? options.messageRouter || typeof options.messageRouter.isRegistered === TYPEOF.FUNCTION : stryMutAct_9fa48("29421") ? false : stryMutAct_9fa48("29420") ? true : (stryCov_9fa48("29420", "29421", "29422"), options.messageRouter && (stryMutAct_9fa48("29424") ? typeof options.messageRouter.isRegistered !== TYPEOF.FUNCTION : stryMutAct_9fa48("29423") ? true : (stryCov_9fa48("29423", "29424"), typeof options.messageRouter.isRegistered === TYPEOF.FUNCTION)))) ? (replicaId, service) => {
      if (stryMutAct_9fa48("29425")) {
        {}
      } else {
        stryCov_9fa48("29425");
        return options.messageRouter.isRegistered(resolveReplicaUnifiedAddress(options.nodeId, replicaId, service));
      }
    } : null;
    if (stryMutAct_9fa48("29428") ? false : stryMutAct_9fa48("29427") ? true : stryMutAct_9fa48("29426") ? isReplicaHandlerRegistered : (stryCov_9fa48("29426", "29427", "29428"), !isReplicaHandlerRegistered)) {
      if (stryMutAct_9fa48("29429")) {
        {}
      } else {
        stryCov_9fa48("29429");
        throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.ROUTER_REQUIRED);
      }
    }
    const messageGroupServices = options.messageGroupServices instanceof Map ? options.messageGroupServices : new Map();
    const owner = activateReplica ? null : new MessageGroupServiceRowOwner(stryMutAct_9fa48("29430") ? {} : (stryCov_9fa48("29430"), {
      systemTableWriter,
      now: (stryMutAct_9fa48("29433") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("29432") ? false : stryMutAct_9fa48("29431") ? true : (stryCov_9fa48("29431", "29432", "29433"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("29434") ? () => undefined : (stryCov_9fa48("29434"), () => Date.now())
    }));
    const resolveExtraFields = (stryMutAct_9fa48("29437") ? typeof options.resolveExtraFields !== TYPEOF.FUNCTION : stryMutAct_9fa48("29436") ? false : stryMutAct_9fa48("29435") ? true : (stryCov_9fa48("29435", "29436", "29437"), typeof options.resolveExtraFields === TYPEOF.FUNCTION)) ? options.resolveExtraFields : stryMutAct_9fa48("29438") ? () => undefined : (stryCov_9fa48("29438"), () => null);
    let activatedCount = 0;
    for (const [replicaId, service] of messageGroupServices.entries()) {
      if (stryMutAct_9fa48("29439")) {
        {}
      } else {
        stryCov_9fa48("29439");
        const groupId = stryMutAct_9fa48("29442") ? service?.groupId && null : stryMutAct_9fa48("29441") ? false : stryMutAct_9fa48("29440") ? true : (stryCov_9fa48("29440", "29441", "29442"), (stryMutAct_9fa48("29443") ? service.groupId : (stryCov_9fa48("29443"), service?.groupId)) || null);
        if (stryMutAct_9fa48("29446") ? typeof groupId !== TYPEOF.STRING && groupId.length === 0 : stryMutAct_9fa48("29445") ? false : stryMutAct_9fa48("29444") ? true : (stryCov_9fa48("29444", "29445", "29446"), (stryMutAct_9fa48("29448") ? typeof groupId === TYPEOF.STRING : stryMutAct_9fa48("29447") ? false : (stryCov_9fa48("29447", "29448"), typeof groupId !== TYPEOF.STRING)) || (stryMutAct_9fa48("29450") ? groupId.length !== 0 : stryMutAct_9fa48("29449") ? false : (stryCov_9fa48("29449", "29450"), groupId.length === 0)))) {
          if (stryMutAct_9fa48("29451")) {
            {}
          } else {
            stryCov_9fa48("29451");
            continue;
          }
        }
        const handlerRegistered = await Promise.resolve(isReplicaHandlerRegistered(replicaId, service));
        if (stryMutAct_9fa48("29454") ? handlerRegistered === true : stryMutAct_9fa48("29453") ? false : stryMutAct_9fa48("29452") ? true : (stryCov_9fa48("29452", "29453", "29454"), handlerRegistered !== (stryMutAct_9fa48("29455") ? false : (stryCov_9fa48("29455"), true)))) {
          if (stryMutAct_9fa48("29456")) {
            {}
          } else {
            stryCov_9fa48("29456");
            throw new Error(MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR.replicaHandlerRequired(replicaId));
          }
        }
        try {
          if (stryMutAct_9fa48("29457")) {
            {}
          } else {
            stryCov_9fa48("29457");
            const activationContext = stryMutAct_9fa48("29458") ? {} : (stryCov_9fa48("29458"), {
              groupId,
              replicaId,
              nodeId: options.nodeId,
              service,
              extraFields: resolveExtraFields(replicaId, service)
            });
            if (stryMutAct_9fa48("29460") ? false : stryMutAct_9fa48("29459") ? true : (stryCov_9fa48("29459", "29460"), activateReplica)) {
              if (stryMutAct_9fa48("29461")) {
                {}
              } else {
                stryCov_9fa48("29461");
                await activateReplica(activationContext);
              }
            } else {
              if (stryMutAct_9fa48("29462")) {
                {}
              } else {
                stryCov_9fa48("29462");
                await owner.activateReplica(activationContext);
              }
            }
            stryMutAct_9fa48("29463") ? activatedCount -= 1 : (stryCov_9fa48("29463"), activatedCount += 1);
          }
        } catch (error) {
          if (stryMutAct_9fa48("29464")) {
            {}
          } else {
            stryCov_9fa48("29464");
            if (stryMutAct_9fa48("29467") ? options.deferTransientFailures === true || isTransientActivationError(error) : stryMutAct_9fa48("29466") ? false : stryMutAct_9fa48("29465") ? true : (stryCov_9fa48("29465", "29466", "29467"), (stryMutAct_9fa48("29469") ? options.deferTransientFailures !== true : stryMutAct_9fa48("29468") ? true : (stryCov_9fa48("29468", "29469"), options.deferTransientFailures === (stryMutAct_9fa48("29470") ? false : (stryCov_9fa48("29470"), true)))) && isTransientActivationError(error))) {
              if (stryMutAct_9fa48("29471")) {
                {}
              } else {
                stryCov_9fa48("29471");
                if (stryMutAct_9fa48("29474") ? typeof options.onDeferredActivation !== TYPEOF.FUNCTION : stryMutAct_9fa48("29473") ? false : stryMutAct_9fa48("29472") ? true : (stryCov_9fa48("29472", "29473", "29474"), typeof options.onDeferredActivation === TYPEOF.FUNCTION)) {
                  if (stryMutAct_9fa48("29475")) {
                    {}
                  } else {
                    stryCov_9fa48("29475");
                    await Promise.resolve(options.onDeferredActivation(stryMutAct_9fa48("29476") ? {} : (stryCov_9fa48("29476"), {
                      groupId,
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
export { activateMessageGroupServiceRows, MESSAGE_GROUP_SERVICE_ACTIVATION_ERROR };
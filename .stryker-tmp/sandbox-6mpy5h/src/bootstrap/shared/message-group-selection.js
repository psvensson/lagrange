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
import { NUM, TYPEOF } from '../../constants/index.js';
const MESSAGE_GROUP_SELECTION_REASON = Object.freeze(stryMutAct_9fa48("28998") ? {} : (stryCov_9fa48("28998"), {
  OWNER_NOT_READY: stryMutAct_9fa48("28999") ? "" : (stryCov_9fa48("28999"), 'operational message-group ingress not ready')
}));
const MESSAGE_GROUP_SELECTION_ROUTE = Object.freeze(stryMutAct_9fa48("29000") ? {} : (stryCov_9fa48("29000"), {
  LEADER: stryMutAct_9fa48("29001") ? "" : (stryCov_9fa48("29001"), 'leader'),
  PREFERRED: stryMutAct_9fa48("29002") ? "" : (stryCov_9fa48("29002"), 'preferred'),
  RELAY: stryMutAct_9fa48("29003") ? "" : (stryCov_9fa48("29003"), 'relay')
}));
function normalizeRequiredTables(requiredTables) {
  if (stryMutAct_9fa48("29004")) {
    {}
  } else {
    stryCov_9fa48("29004");
    return stryMutAct_9fa48("29005") ? [] : (stryCov_9fa48("29005"), [...new Set(stryMutAct_9fa48("29006") ? Array.isArray(requiredTables) ? requiredTables : [] : (stryCov_9fa48("29006"), (Array.isArray(requiredTables) ? requiredTables : stryMutAct_9fa48("29007") ? ["Stryker was here"] : (stryCov_9fa48("29007"), [])).filter(stryMutAct_9fa48("29008") ? () => undefined : (stryCov_9fa48("29008"), tableName => stryMutAct_9fa48("29011") ? typeof tableName === TYPEOF.STRING || tableName.length > NUM.ZERO : stryMutAct_9fa48("29010") ? false : stryMutAct_9fa48("29009") ? true : (stryCov_9fa48("29009", "29010", "29011"), (stryMutAct_9fa48("29013") ? typeof tableName !== TYPEOF.STRING : stryMutAct_9fa48("29012") ? true : (stryCov_9fa48("29012", "29013"), typeof tableName === TYPEOF.STRING)) && (stryMutAct_9fa48("29016") ? tableName.length <= NUM.ZERO : stryMutAct_9fa48("29015") ? tableName.length >= NUM.ZERO : stryMutAct_9fa48("29014") ? true : (stryCov_9fa48("29014", "29015", "29016"), tableName.length > NUM.ZERO)))))))]);
  }
}
function listMessageGroupServices(messageGroupServices) {
  if (stryMutAct_9fa48("29017")) {
    {}
  } else {
    stryCov_9fa48("29017");
    if (stryMutAct_9fa48("29019") ? false : stryMutAct_9fa48("29018") ? true : (stryCov_9fa48("29018", "29019"), messageGroupServices instanceof Map)) {
      if (stryMutAct_9fa48("29020")) {
        {}
      } else {
        stryCov_9fa48("29020");
        return stryMutAct_9fa48("29021") ? [] : (stryCov_9fa48("29021"), [...messageGroupServices.values()]);
      }
    }
    if (stryMutAct_9fa48("29023") ? false : stryMutAct_9fa48("29022") ? true : (stryCov_9fa48("29022", "29023"), Array.isArray(messageGroupServices))) {
      if (stryMutAct_9fa48("29024")) {
        {}
      } else {
        stryCov_9fa48("29024");
        return stryMutAct_9fa48("29025") ? messageGroupServices : (stryCov_9fa48("29025"), messageGroupServices.filter(Boolean));
      }
    }
    if (stryMutAct_9fa48("29028") ? messageGroupServices || typeof messageGroupServices[Symbol.iterator] === TYPEOF.FUNCTION : stryMutAct_9fa48("29027") ? false : stryMutAct_9fa48("29026") ? true : (stryCov_9fa48("29026", "29027", "29028"), messageGroupServices && (stryMutAct_9fa48("29030") ? typeof messageGroupServices[Symbol.iterator] !== TYPEOF.FUNCTION : stryMutAct_9fa48("29029") ? true : (stryCov_9fa48("29029", "29030"), typeof messageGroupServices[Symbol.iterator] === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("29031")) {
        {}
      } else {
        stryCov_9fa48("29031");
        return stryMutAct_9fa48("29032") ? [...messageGroupServices] : (stryCov_9fa48("29032"), (stryMutAct_9fa48("29033") ? [] : (stryCov_9fa48("29033"), [...messageGroupServices])).filter(Boolean));
      }
    }
    return stryMutAct_9fa48("29034") ? ["Stryker was here"] : (stryCov_9fa48("29034"), []);
  }
}
function normalizeSelectionReadiness(readiness, fallbackReason) {
  if (stryMutAct_9fa48("29035")) {
    {}
  } else {
    stryCov_9fa48("29035");
    if (stryMutAct_9fa48("29038") ? readiness !== true : stryMutAct_9fa48("29037") ? false : stryMutAct_9fa48("29036") ? true : (stryCov_9fa48("29036", "29037", "29038"), readiness === (stryMutAct_9fa48("29039") ? false : (stryCov_9fa48("29039"), true)))) {
      if (stryMutAct_9fa48("29040")) {
        {}
      } else {
        stryCov_9fa48("29040");
        return buildSelectionReadiness(stryMutAct_9fa48("29041") ? false : (stryCov_9fa48("29041"), true), NUM.ZERO, null);
      }
    } else if (stryMutAct_9fa48("29044") ? !readiness && typeof readiness !== TYPEOF.OBJECT : stryMutAct_9fa48("29043") ? false : stryMutAct_9fa48("29042") ? true : (stryCov_9fa48("29042", "29043", "29044"), (stryMutAct_9fa48("29045") ? readiness : (stryCov_9fa48("29045"), !readiness)) || (stryMutAct_9fa48("29047") ? typeof readiness === TYPEOF.OBJECT : stryMutAct_9fa48("29046") ? false : (stryCov_9fa48("29046", "29047"), typeof readiness !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("29048")) {
        {}
      } else {
        stryCov_9fa48("29048");
        return buildSelectionReadiness(stryMutAct_9fa48("29049") ? true : (stryCov_9fa48("29049"), false), NUM.ZERO, fallbackReason);
      }
    }
    return buildSelectionReadiness(stryMutAct_9fa48("29052") ? readiness.ready !== true : stryMutAct_9fa48("29051") ? false : stryMutAct_9fa48("29050") ? true : (stryCov_9fa48("29050", "29051", "29052"), readiness.ready === (stryMutAct_9fa48("29053") ? false : (stryCov_9fa48("29053"), true))), (stryMutAct_9fa48("29056") ? Number.isFinite(readiness.retryAfterMs) || readiness.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("29055") ? false : stryMutAct_9fa48("29054") ? true : (stryCov_9fa48("29054", "29055", "29056"), Number.isFinite(readiness.retryAfterMs) && (stryMutAct_9fa48("29059") ? readiness.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("29058") ? readiness.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("29057") ? true : (stryCov_9fa48("29057", "29058", "29059"), readiness.retryAfterMs > NUM.ZERO)))) ? Math.floor(readiness.retryAfterMs) : NUM.ZERO, (stryMutAct_9fa48("29062") ? typeof readiness.reason === TYPEOF.STRING || readiness.reason.length > NUM.ZERO : stryMutAct_9fa48("29061") ? false : stryMutAct_9fa48("29060") ? true : (stryCov_9fa48("29060", "29061", "29062"), (stryMutAct_9fa48("29064") ? typeof readiness.reason !== TYPEOF.STRING : stryMutAct_9fa48("29063") ? true : (stryCov_9fa48("29063", "29064"), typeof readiness.reason === TYPEOF.STRING)) && (stryMutAct_9fa48("29067") ? readiness.reason.length <= NUM.ZERO : stryMutAct_9fa48("29066") ? readiness.reason.length >= NUM.ZERO : stryMutAct_9fa48("29065") ? true : (stryCov_9fa48("29065", "29066", "29067"), readiness.reason.length > NUM.ZERO)))) ? readiness.reason : fallbackReason);
  }
}
function isMessageGroupInitialized(service) {
  if (stryMutAct_9fa48("29068")) {
    {}
  } else {
    stryCov_9fa48("29068");
    return stryMutAct_9fa48("29071") ? service?.initialized === false : stryMutAct_9fa48("29070") ? false : stryMutAct_9fa48("29069") ? true : (stryCov_9fa48("29069", "29070", "29071"), (stryMutAct_9fa48("29072") ? service.initialized : (stryCov_9fa48("29072"), service?.initialized)) !== (stryMutAct_9fa48("29073") ? true : (stryCov_9fa48("29073"), false)));
  }
}
function resolveLeaderReadiness(service, requiredTables) {
  if (stryMutAct_9fa48("29074")) {
    {}
  } else {
    stryCov_9fa48("29074");
    if (stryMutAct_9fa48("29077") ? false : stryMutAct_9fa48("29076") ? true : stryMutAct_9fa48("29075") ? service : (stryCov_9fa48("29075", "29076", "29077"), !service)) {
      if (stryMutAct_9fa48("29078")) {
        {}
      } else {
        stryCov_9fa48("29078");
        return buildSelectionReadiness(stryMutAct_9fa48("29079") ? true : (stryCov_9fa48("29079"), false), NUM.ZERO, MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY);
      }
    }
    if (stryMutAct_9fa48("29082") ? requiredTables.length > NUM.ZERO || typeof service.getMetadataIngressReadiness === TYPEOF.FUNCTION : stryMutAct_9fa48("29081") ? false : stryMutAct_9fa48("29080") ? true : (stryCov_9fa48("29080", "29081", "29082"), (stryMutAct_9fa48("29085") ? requiredTables.length <= NUM.ZERO : stryMutAct_9fa48("29084") ? requiredTables.length >= NUM.ZERO : stryMutAct_9fa48("29083") ? true : (stryCov_9fa48("29083", "29084", "29085"), requiredTables.length > NUM.ZERO)) && (stryMutAct_9fa48("29087") ? typeof service.getMetadataIngressReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("29086") ? true : (stryCov_9fa48("29086", "29087"), typeof service.getMetadataIngressReadiness === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("29088")) {
        {}
      } else {
        stryCov_9fa48("29088");
        return normalizeSelectionReadiness(service.getMetadataIngressReadiness(stryMutAct_9fa48("29089") ? {} : (stryCov_9fa48("29089"), {
          requiredTables
        })), MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY);
      }
    }
    return isMessageGroupInitialized(service) ? buildSelectionReadiness(stryMutAct_9fa48("29090") ? false : (stryCov_9fa48("29090"), true), NUM.ZERO, null) : buildSelectionReadiness(stryMutAct_9fa48("29091") ? true : (stryCov_9fa48("29091"), false), NUM.ZERO, MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY);
  }
}
function resolveRelayReadiness(service, requiredTables) {
  if (stryMutAct_9fa48("29092")) {
    {}
  } else {
    stryCov_9fa48("29092");
    if (stryMutAct_9fa48("29095") ? (!service || requiredTables.length === NUM.ZERO) && typeof service.getMetadataIngressReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("29094") ? false : stryMutAct_9fa48("29093") ? true : (stryCov_9fa48("29093", "29094", "29095"), (stryMutAct_9fa48("29097") ? !service && requiredTables.length === NUM.ZERO : stryMutAct_9fa48("29096") ? false : (stryCov_9fa48("29096", "29097"), (stryMutAct_9fa48("29098") ? service : (stryCov_9fa48("29098"), !service)) || (stryMutAct_9fa48("29100") ? requiredTables.length !== NUM.ZERO : stryMutAct_9fa48("29099") ? false : (stryCov_9fa48("29099", "29100"), requiredTables.length === NUM.ZERO)))) || (stryMutAct_9fa48("29102") ? typeof service.getMetadataIngressReadiness === TYPEOF.FUNCTION : stryMutAct_9fa48("29101") ? false : (stryCov_9fa48("29101", "29102"), typeof service.getMetadataIngressReadiness !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("29103")) {
        {}
      } else {
        stryCov_9fa48("29103");
        return buildSelectionReadiness(stryMutAct_9fa48("29104") ? true : (stryCov_9fa48("29104"), false), NUM.ZERO, MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY);
      }
    }
    return normalizeSelectionReadiness(service.getMetadataIngressReadiness(stryMutAct_9fa48("29105") ? {} : (stryCov_9fa48("29105"), {
      requiredTables
    })), MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY);
  }
}
function buildSelectionReadiness(ready, retryAfterMs, reason) {
  if (stryMutAct_9fa48("29106")) {
    {}
  } else {
    stryCov_9fa48("29106");
    return stryMutAct_9fa48("29107") ? {} : (stryCov_9fa48("29107"), {
      ready,
      retryAfterMs,
      reason
    });
  }
}
function buildOperationalMessageGroupSelection(service, ready, retryAfterMs, reason, route) {
  if (stryMutAct_9fa48("29108")) {
    {}
  } else {
    stryCov_9fa48("29108");
    return stryMutAct_9fa48("29109") ? {} : (stryCov_9fa48("29109"), {
      service,
      ready,
      retryAfterMs,
      reason,
      route
    });
  }
}
function resolveQueryTransportMessageGroupSelection(messageGroupServices) {
  if (stryMutAct_9fa48("29110")) {
    {}
  } else {
    stryCov_9fa48("29110");
    const services = listMessageGroupServices(messageGroupServices);
    for (const service of services) {
      if (stryMutAct_9fa48("29111")) {
        {}
      } else {
        stryCov_9fa48("29111");
        if (stryMutAct_9fa48("29114") ? (service?.isLeaderReplica?.() !== true || isMessageGroupInitialized(service) !== true) && typeof service?.sendMessage !== TYPEOF.FUNCTION : stryMutAct_9fa48("29113") ? false : stryMutAct_9fa48("29112") ? true : (stryCov_9fa48("29112", "29113", "29114"), (stryMutAct_9fa48("29116") ? service?.isLeaderReplica?.() !== true && isMessageGroupInitialized(service) !== true : stryMutAct_9fa48("29115") ? false : (stryCov_9fa48("29115", "29116"), (stryMutAct_9fa48("29118") ? service?.isLeaderReplica?.() === true : stryMutAct_9fa48("29117") ? false : (stryCov_9fa48("29117", "29118"), (stryMutAct_9fa48("29120") ? service.isLeaderReplica?.() : stryMutAct_9fa48("29119") ? service?.isLeaderReplica() : (stryCov_9fa48("29119", "29120"), service?.isLeaderReplica?.())) !== (stryMutAct_9fa48("29121") ? false : (stryCov_9fa48("29121"), true)))) || (stryMutAct_9fa48("29123") ? isMessageGroupInitialized(service) === true : stryMutAct_9fa48("29122") ? false : (stryCov_9fa48("29122", "29123"), isMessageGroupInitialized(service) !== (stryMutAct_9fa48("29124") ? false : (stryCov_9fa48("29124"), true)))))) || (stryMutAct_9fa48("29126") ? typeof service?.sendMessage === TYPEOF.FUNCTION : stryMutAct_9fa48("29125") ? false : (stryCov_9fa48("29125", "29126"), typeof (stryMutAct_9fa48("29127") ? service.sendMessage : (stryCov_9fa48("29127"), service?.sendMessage)) !== TYPEOF.FUNCTION)))) {
          if (stryMutAct_9fa48("29128")) {
            {}
          } else {
            stryCov_9fa48("29128");
            continue;
          }
        }
        return stryMutAct_9fa48("29129") ? {} : (stryCov_9fa48("29129"), {
          service,
          ready: stryMutAct_9fa48("29130") ? false : (stryCov_9fa48("29130"), true),
          retryAfterMs: NUM.ZERO,
          reason: null,
          route: MESSAGE_GROUP_SELECTION_ROUTE.LEADER
        });
      }
    }
    for (const service of services) {
      if (stryMutAct_9fa48("29131")) {
        {}
      } else {
        stryCov_9fa48("29131");
        if (stryMutAct_9fa48("29134") ? isMessageGroupInitialized(service) !== true && typeof service?.sendMessage !== TYPEOF.FUNCTION : stryMutAct_9fa48("29133") ? false : stryMutAct_9fa48("29132") ? true : (stryCov_9fa48("29132", "29133", "29134"), (stryMutAct_9fa48("29136") ? isMessageGroupInitialized(service) === true : stryMutAct_9fa48("29135") ? false : (stryCov_9fa48("29135", "29136"), isMessageGroupInitialized(service) !== (stryMutAct_9fa48("29137") ? false : (stryCov_9fa48("29137"), true)))) || (stryMutAct_9fa48("29139") ? typeof service?.sendMessage === TYPEOF.FUNCTION : stryMutAct_9fa48("29138") ? false : (stryCov_9fa48("29138", "29139"), typeof (stryMutAct_9fa48("29140") ? service.sendMessage : (stryCov_9fa48("29140"), service?.sendMessage)) !== TYPEOF.FUNCTION)))) {
          if (stryMutAct_9fa48("29141")) {
            {}
          } else {
            stryCov_9fa48("29141");
            continue;
          }
        }
        return stryMutAct_9fa48("29142") ? {} : (stryCov_9fa48("29142"), {
          service,
          ready: stryMutAct_9fa48("29143") ? false : (stryCov_9fa48("29143"), true),
          retryAfterMs: NUM.ZERO,
          reason: null,
          route: (stryMutAct_9fa48("29146") ? service?.isLeaderReplica?.() !== true : stryMutAct_9fa48("29145") ? false : stryMutAct_9fa48("29144") ? true : (stryCov_9fa48("29144", "29145", "29146"), (stryMutAct_9fa48("29148") ? service.isLeaderReplica?.() : stryMutAct_9fa48("29147") ? service?.isLeaderReplica() : (stryCov_9fa48("29147", "29148"), service?.isLeaderReplica?.())) === (stryMutAct_9fa48("29149") ? false : (stryCov_9fa48("29149"), true)))) ? MESSAGE_GROUP_SELECTION_ROUTE.LEADER : MESSAGE_GROUP_SELECTION_ROUTE.RELAY
        });
      }
    }
    return stryMutAct_9fa48("29150") ? {} : (stryCov_9fa48("29150"), {
      service: null,
      ready: stryMutAct_9fa48("29151") ? true : (stryCov_9fa48("29151"), false),
      retryAfterMs: NUM.ZERO,
      reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
      route: null
    });
  }
}
async function resolveMetadataIngressReadinessAsync(service, requiredTables, fallbackReason) {
  if (stryMutAct_9fa48("29152")) {
    {}
  } else {
    stryCov_9fa48("29152");
    const baseReadiness = (stryMutAct_9fa48("29153") ? service.getMetadataIngressReadiness : (stryCov_9fa48("29153"), service?.getMetadataIngressReadiness)) ? normalizeSelectionReadiness(service.getMetadataIngressReadiness(stryMutAct_9fa48("29154") ? {} : (stryCov_9fa48("29154"), {
      requiredTables
    })), fallbackReason) : stryMutAct_9fa48("29155") ? {} : (stryCov_9fa48("29155"), {
      ready: stryMutAct_9fa48("29156") ? true : (stryCov_9fa48("29156"), false),
      retryAfterMs: NUM.ZERO,
      reason: fallbackReason
    });
    if (stryMutAct_9fa48("29159") ? (baseReadiness.ready === true || requiredTables.length === NUM.ZERO) && typeof service?.resolveMetadataIngressForwardSelection !== TYPEOF.FUNCTION : stryMutAct_9fa48("29158") ? false : stryMutAct_9fa48("29157") ? true : (stryCov_9fa48("29157", "29158", "29159"), (stryMutAct_9fa48("29161") ? baseReadiness.ready === true && requiredTables.length === NUM.ZERO : stryMutAct_9fa48("29160") ? false : (stryCov_9fa48("29160", "29161"), (stryMutAct_9fa48("29163") ? baseReadiness.ready !== true : stryMutAct_9fa48("29162") ? false : (stryCov_9fa48("29162", "29163"), baseReadiness.ready === (stryMutAct_9fa48("29164") ? false : (stryCov_9fa48("29164"), true)))) || (stryMutAct_9fa48("29166") ? requiredTables.length !== NUM.ZERO : stryMutAct_9fa48("29165") ? false : (stryCov_9fa48("29165", "29166"), requiredTables.length === NUM.ZERO)))) || (stryMutAct_9fa48("29168") ? typeof service?.resolveMetadataIngressForwardSelection === TYPEOF.FUNCTION : stryMutAct_9fa48("29167") ? false : (stryCov_9fa48("29167", "29168"), typeof (stryMutAct_9fa48("29169") ? service.resolveMetadataIngressForwardSelection : (stryCov_9fa48("29169"), service?.resolveMetadataIngressForwardSelection)) !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("29170")) {
        {}
      } else {
        stryCov_9fa48("29170");
        return baseReadiness;
      }
    }
    try {
      if (stryMutAct_9fa48("29171")) {
        {}
      } else {
        stryCov_9fa48("29171");
        const selection = await service.resolveMetadataIngressForwardSelection(stryMutAct_9fa48("29172") ? {} : (stryCov_9fa48("29172"), {
          requiredTables
        }));
        if (stryMutAct_9fa48("29175") ? (service?.isCurrentRaftLeader?.() === true || selection?.localIngress === true) && Array.isArray(selection?.targets) && selection.targets.length > NUM.ZERO : stryMutAct_9fa48("29174") ? false : stryMutAct_9fa48("29173") ? true : (stryCov_9fa48("29173", "29174", "29175"), (stryMutAct_9fa48("29177") ? service?.isCurrentRaftLeader?.() === true && selection?.localIngress === true : stryMutAct_9fa48("29176") ? false : (stryCov_9fa48("29176", "29177"), (stryMutAct_9fa48("29179") ? service?.isCurrentRaftLeader?.() !== true : stryMutAct_9fa48("29178") ? false : (stryCov_9fa48("29178", "29179"), (stryMutAct_9fa48("29181") ? service.isCurrentRaftLeader?.() : stryMutAct_9fa48("29180") ? service?.isCurrentRaftLeader() : (stryCov_9fa48("29180", "29181"), service?.isCurrentRaftLeader?.())) === (stryMutAct_9fa48("29182") ? false : (stryCov_9fa48("29182"), true)))) || (stryMutAct_9fa48("29184") ? selection?.localIngress !== true : stryMutAct_9fa48("29183") ? false : (stryCov_9fa48("29183", "29184"), (stryMutAct_9fa48("29185") ? selection.localIngress : (stryCov_9fa48("29185"), selection?.localIngress)) === (stryMutAct_9fa48("29186") ? false : (stryCov_9fa48("29186"), true)))))) || (stryMutAct_9fa48("29188") ? Array.isArray(selection?.targets) || selection.targets.length > NUM.ZERO : stryMutAct_9fa48("29187") ? false : (stryCov_9fa48("29187", "29188"), Array.isArray(stryMutAct_9fa48("29189") ? selection.targets : (stryCov_9fa48("29189"), selection?.targets)) && (stryMutAct_9fa48("29192") ? selection.targets.length <= NUM.ZERO : stryMutAct_9fa48("29191") ? selection.targets.length >= NUM.ZERO : stryMutAct_9fa48("29190") ? true : (stryCov_9fa48("29190", "29191", "29192"), selection.targets.length > NUM.ZERO)))))) {
          if (stryMutAct_9fa48("29193")) {
            {}
          } else {
            stryCov_9fa48("29193");
            const retryAfterMs = Number.isFinite(stryMutAct_9fa48("29194") ? selection.strictForwardRetryAfterMs : (stryCov_9fa48("29194"), selection?.strictForwardRetryAfterMs)) ? selection.strictForwardRetryAfterMs : baseReadiness.retryAfterMs;
            return stryMutAct_9fa48("29195") ? {} : (stryCov_9fa48("29195"), {
              ready: stryMutAct_9fa48("29196") ? false : (stryCov_9fa48("29196"), true),
              retryAfterMs,
              reason: null
            });
          }
        }
        return stryMutAct_9fa48("29197") ? {} : (stryCov_9fa48("29197"), {
          ready: stryMutAct_9fa48("29198") ? true : (stryCov_9fa48("29198"), false),
          retryAfterMs: stryMutAct_9fa48("29199") ? Math.min(baseReadiness.retryAfterMs, Number.isFinite(selection?.strictForwardRetryAfterMs) ? selection.strictForwardRetryAfterMs : NUM.ZERO) : (stryCov_9fa48("29199"), Math.max(baseReadiness.retryAfterMs, Number.isFinite(stryMutAct_9fa48("29200") ? selection.strictForwardRetryAfterMs : (stryCov_9fa48("29200"), selection?.strictForwardRetryAfterMs)) ? selection.strictForwardRetryAfterMs : NUM.ZERO)),
          reason: baseReadiness.reason
        });
      }
    } catch (_error) {
      if (stryMutAct_9fa48("29201")) {
        {}
      } else {
        stryCov_9fa48("29201");
        return baseReadiness;
      }
    }
  }
}
function recordNotReadyCandidate(summary, readiness) {
  if (stryMutAct_9fa48("29202")) {
    {}
  } else {
    stryCov_9fa48("29202");
    if (stryMutAct_9fa48("29205") ? readiness.ready !== true : stryMutAct_9fa48("29204") ? false : stryMutAct_9fa48("29203") ? true : (stryCov_9fa48("29203", "29204", "29205"), readiness.ready === (stryMutAct_9fa48("29206") ? false : (stryCov_9fa48("29206"), true)))) {
      if (stryMutAct_9fa48("29207")) {
        {}
      } else {
        stryCov_9fa48("29207");
        return summary;
      }
    }
    return stryMutAct_9fa48("29208") ? {} : (stryCov_9fa48("29208"), {
      reason: stryMutAct_9fa48("29211") ? readiness.reason && summary.reason : stryMutAct_9fa48("29210") ? false : stryMutAct_9fa48("29209") ? true : (stryCov_9fa48("29209", "29210", "29211"), readiness.reason || summary.reason),
      retryAfterMs: stryMutAct_9fa48("29212") ? Math.min(summary.retryAfterMs, Number.isFinite(readiness.retryAfterMs) ? readiness.retryAfterMs : NUM.ZERO) : (stryCov_9fa48("29212"), Math.max(summary.retryAfterMs, Number.isFinite(readiness.retryAfterMs) ? readiness.retryAfterMs : NUM.ZERO))
    });
  }
}
function resolveOperationalMessageGroupSelection(messageGroupServices, options = {}) {
  if (stryMutAct_9fa48("29213")) {
    {}
  } else {
    stryCov_9fa48("29213");
    const services = listMessageGroupServices(messageGroupServices);
    const requiredTables = normalizeRequiredTables(options.requiredTables);
    let deferredSummary = stryMutAct_9fa48("29214") ? {} : (stryCov_9fa48("29214"), {
      reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
      retryAfterMs: NUM.ZERO
    });
    for (const service of services) {
      if (stryMutAct_9fa48("29215")) {
        {}
      } else {
        stryCov_9fa48("29215");
        if (stryMutAct_9fa48("29218") ? service?.isLeaderReplica?.() === true : stryMutAct_9fa48("29217") ? false : stryMutAct_9fa48("29216") ? true : (stryCov_9fa48("29216", "29217", "29218"), (stryMutAct_9fa48("29220") ? service.isLeaderReplica?.() : stryMutAct_9fa48("29219") ? service?.isLeaderReplica() : (stryCov_9fa48("29219", "29220"), service?.isLeaderReplica?.())) !== (stryMutAct_9fa48("29221") ? false : (stryCov_9fa48("29221"), true)))) {
          if (stryMutAct_9fa48("29222")) {
            {}
          } else {
            stryCov_9fa48("29222");
            continue;
          }
        }
        const readiness = resolveLeaderReadiness(service, requiredTables);
        if (stryMutAct_9fa48("29225") ? readiness.ready !== true : stryMutAct_9fa48("29224") ? false : stryMutAct_9fa48("29223") ? true : (stryCov_9fa48("29223", "29224", "29225"), readiness.ready === (stryMutAct_9fa48("29226") ? false : (stryCov_9fa48("29226"), true)))) {
          if (stryMutAct_9fa48("29227")) {
            {}
          } else {
            stryCov_9fa48("29227");
            return buildOperationalMessageGroupSelection(service, stryMutAct_9fa48("29228") ? false : (stryCov_9fa48("29228"), true), readiness.retryAfterMs, null, MESSAGE_GROUP_SELECTION_ROUTE.LEADER);
          }
        }
        deferredSummary = recordNotReadyCandidate(deferredSummary, readiness);
      }
    }
    for (const service of services) {
      if (stryMutAct_9fa48("29229")) {
        {}
      } else {
        stryCov_9fa48("29229");
        if (stryMutAct_9fa48("29232") ? service?.isLeaderReplica?.() !== true : stryMutAct_9fa48("29231") ? false : stryMutAct_9fa48("29230") ? true : (stryCov_9fa48("29230", "29231", "29232"), (stryMutAct_9fa48("29234") ? service.isLeaderReplica?.() : stryMutAct_9fa48("29233") ? service?.isLeaderReplica() : (stryCov_9fa48("29233", "29234"), service?.isLeaderReplica?.())) === (stryMutAct_9fa48("29235") ? false : (stryCov_9fa48("29235"), true)))) {
          if (stryMutAct_9fa48("29236")) {
            {}
          } else {
            stryCov_9fa48("29236");
            continue;
          }
        }
        const readiness = resolveRelayReadiness(service, requiredTables);
        if (stryMutAct_9fa48("29239") ? readiness.ready !== true : stryMutAct_9fa48("29238") ? false : stryMutAct_9fa48("29237") ? true : (stryCov_9fa48("29237", "29238", "29239"), readiness.ready === (stryMutAct_9fa48("29240") ? false : (stryCov_9fa48("29240"), true)))) {
          if (stryMutAct_9fa48("29241")) {
            {}
          } else {
            stryCov_9fa48("29241");
            return buildOperationalMessageGroupSelection(service, stryMutAct_9fa48("29242") ? false : (stryCov_9fa48("29242"), true), readiness.retryAfterMs, null, MESSAGE_GROUP_SELECTION_ROUTE.RELAY);
          }
        }
        deferredSummary = recordNotReadyCandidate(deferredSummary, readiness);
      }
    }
    return buildOperationalMessageGroupSelection(null, stryMutAct_9fa48("29243") ? true : (stryCov_9fa48("29243"), false), deferredSummary.retryAfterMs, deferredSummary.reason, null);
  }
}
async function resolveOperationalMessageGroupSelectionAsync(messageGroupServices, options = {}) {
  if (stryMutAct_9fa48("29244")) {
    {}
  } else {
    stryCov_9fa48("29244");
    const services = listMessageGroupServices(messageGroupServices);
    const requiredTables = normalizeRequiredTables(options.requiredTables);
    const preferredService = stryMutAct_9fa48("29247") ? options.preferredService && null : stryMutAct_9fa48("29246") ? false : stryMutAct_9fa48("29245") ? true : (stryCov_9fa48("29245", "29246", "29247"), options.preferredService || null);
    let deferredSummary = stryMutAct_9fa48("29248") ? {} : (stryCov_9fa48("29248"), {
      reason: MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY,
      retryAfterMs: NUM.ZERO
    });
    for (const service of services) {
      if (stryMutAct_9fa48("29249")) {
        {}
      } else {
        stryCov_9fa48("29249");
        if (stryMutAct_9fa48("29252") ? service?.isLeaderReplica?.() === true : stryMutAct_9fa48("29251") ? false : stryMutAct_9fa48("29250") ? true : (stryCov_9fa48("29250", "29251", "29252"), (stryMutAct_9fa48("29254") ? service.isLeaderReplica?.() : stryMutAct_9fa48("29253") ? service?.isLeaderReplica() : (stryCov_9fa48("29253", "29254"), service?.isLeaderReplica?.())) !== (stryMutAct_9fa48("29255") ? false : (stryCov_9fa48("29255"), true)))) {
          if (stryMutAct_9fa48("29256")) {
            {}
          } else {
            stryCov_9fa48("29256");
            continue;
          }
        }
        const readiness = (stryMutAct_9fa48("29260") ? requiredTables.length <= NUM.ZERO : stryMutAct_9fa48("29259") ? requiredTables.length >= NUM.ZERO : stryMutAct_9fa48("29258") ? false : stryMutAct_9fa48("29257") ? true : (stryCov_9fa48("29257", "29258", "29259", "29260"), requiredTables.length > NUM.ZERO)) ? await resolveMetadataIngressReadinessAsync(service, requiredTables, MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY) : resolveLeaderReadiness(service, requiredTables);
        if (stryMutAct_9fa48("29263") ? readiness.ready !== true : stryMutAct_9fa48("29262") ? false : stryMutAct_9fa48("29261") ? true : (stryCov_9fa48("29261", "29262", "29263"), readiness.ready === (stryMutAct_9fa48("29264") ? false : (stryCov_9fa48("29264"), true)))) {
          if (stryMutAct_9fa48("29265")) {
            {}
          } else {
            stryCov_9fa48("29265");
            return buildOperationalMessageGroupSelection(service, stryMutAct_9fa48("29266") ? false : (stryCov_9fa48("29266"), true), readiness.retryAfterMs, null, MESSAGE_GROUP_SELECTION_ROUTE.LEADER);
          }
        }
        deferredSummary = recordNotReadyCandidate(deferredSummary, readiness);
      }
    }
    if (stryMutAct_9fa48("29268") ? false : stryMutAct_9fa48("29267") ? true : (stryCov_9fa48("29267", "29268"), preferredService)) {
      if (stryMutAct_9fa48("29269")) {
        {}
      } else {
        stryCov_9fa48("29269");
        const readiness = (stryMutAct_9fa48("29273") ? requiredTables.length <= NUM.ZERO : stryMutAct_9fa48("29272") ? requiredTables.length >= NUM.ZERO : stryMutAct_9fa48("29271") ? false : stryMutAct_9fa48("29270") ? true : (stryCov_9fa48("29270", "29271", "29272", "29273"), requiredTables.length > NUM.ZERO)) ? await resolveMetadataIngressReadinessAsync(preferredService, requiredTables, MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY) : (stryMutAct_9fa48("29276") ? preferredService?.isLeaderReplica?.() !== true : stryMutAct_9fa48("29275") ? false : stryMutAct_9fa48("29274") ? true : (stryCov_9fa48("29274", "29275", "29276"), (stryMutAct_9fa48("29278") ? preferredService.isLeaderReplica?.() : stryMutAct_9fa48("29277") ? preferredService?.isLeaderReplica() : (stryCov_9fa48("29277", "29278"), preferredService?.isLeaderReplica?.())) === (stryMutAct_9fa48("29279") ? false : (stryCov_9fa48("29279"), true)))) ? resolveLeaderReadiness(preferredService, requiredTables) : resolveRelayReadiness(preferredService, requiredTables);
        if (stryMutAct_9fa48("29282") ? readiness.ready !== true : stryMutAct_9fa48("29281") ? false : stryMutAct_9fa48("29280") ? true : (stryCov_9fa48("29280", "29281", "29282"), readiness.ready === (stryMutAct_9fa48("29283") ? false : (stryCov_9fa48("29283"), true)))) {
          if (stryMutAct_9fa48("29284")) {
            {}
          } else {
            stryCov_9fa48("29284");
            return buildOperationalMessageGroupSelection(preferredService, stryMutAct_9fa48("29285") ? false : (stryCov_9fa48("29285"), true), readiness.retryAfterMs, null, MESSAGE_GROUP_SELECTION_ROUTE.PREFERRED);
          }
        }
        deferredSummary = recordNotReadyCandidate(deferredSummary, readiness);
      }
    }
    for (const service of services) {
      if (stryMutAct_9fa48("29286")) {
        {}
      } else {
        stryCov_9fa48("29286");
        if (stryMutAct_9fa48("29289") ? service?.isLeaderReplica?.() !== true : stryMutAct_9fa48("29288") ? false : stryMutAct_9fa48("29287") ? true : (stryCov_9fa48("29287", "29288", "29289"), (stryMutAct_9fa48("29291") ? service.isLeaderReplica?.() : stryMutAct_9fa48("29290") ? service?.isLeaderReplica() : (stryCov_9fa48("29290", "29291"), service?.isLeaderReplica?.())) === (stryMutAct_9fa48("29292") ? false : (stryCov_9fa48("29292"), true)))) {
          if (stryMutAct_9fa48("29293")) {
            {}
          } else {
            stryCov_9fa48("29293");
            continue;
          }
        }
        if (stryMutAct_9fa48("29296") ? preferredService || service === preferredService : stryMutAct_9fa48("29295") ? false : stryMutAct_9fa48("29294") ? true : (stryCov_9fa48("29294", "29295", "29296"), preferredService && (stryMutAct_9fa48("29298") ? service !== preferredService : stryMutAct_9fa48("29297") ? true : (stryCov_9fa48("29297", "29298"), service === preferredService)))) {
          if (stryMutAct_9fa48("29299")) {
            {}
          } else {
            stryCov_9fa48("29299");
            continue;
          }
        }
        const readiness = (stryMutAct_9fa48("29303") ? requiredTables.length <= NUM.ZERO : stryMutAct_9fa48("29302") ? requiredTables.length >= NUM.ZERO : stryMutAct_9fa48("29301") ? false : stryMutAct_9fa48("29300") ? true : (stryCov_9fa48("29300", "29301", "29302", "29303"), requiredTables.length > NUM.ZERO)) ? await resolveMetadataIngressReadinessAsync(service, requiredTables, MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY) : resolveRelayReadiness(service, requiredTables);
        if (stryMutAct_9fa48("29306") ? readiness.ready !== true : stryMutAct_9fa48("29305") ? false : stryMutAct_9fa48("29304") ? true : (stryCov_9fa48("29304", "29305", "29306"), readiness.ready === (stryMutAct_9fa48("29307") ? false : (stryCov_9fa48("29307"), true)))) {
          if (stryMutAct_9fa48("29308")) {
            {}
          } else {
            stryCov_9fa48("29308");
            return buildOperationalMessageGroupSelection(service, stryMutAct_9fa48("29309") ? false : (stryCov_9fa48("29309"), true), readiness.retryAfterMs, null, MESSAGE_GROUP_SELECTION_ROUTE.RELAY);
          }
        }
        deferredSummary = recordNotReadyCandidate(deferredSummary, readiness);
      }
    }
    return buildOperationalMessageGroupSelection(null, stryMutAct_9fa48("29310") ? true : (stryCov_9fa48("29310"), false), deferredSummary.retryAfterMs, deferredSummary.reason, null);
  }
}
function getBootstrapMessageGroupService(messageGroupServices) {
  if (stryMutAct_9fa48("29311")) {
    {}
  } else {
    stryCov_9fa48("29311");
    const services = listMessageGroupServices(messageGroupServices);
    for (const service of services) {
      if (stryMutAct_9fa48("29312")) {
        {}
      } else {
        stryCov_9fa48("29312");
        if (stryMutAct_9fa48("29315") ? service?.isLeaderReplica?.() !== true : stryMutAct_9fa48("29314") ? false : stryMutAct_9fa48("29313") ? true : (stryCov_9fa48("29313", "29314", "29315"), (stryMutAct_9fa48("29317") ? service.isLeaderReplica?.() : stryMutAct_9fa48("29316") ? service?.isLeaderReplica() : (stryCov_9fa48("29316", "29317"), service?.isLeaderReplica?.())) === (stryMutAct_9fa48("29318") ? false : (stryCov_9fa48("29318"), true)))) {
          if (stryMutAct_9fa48("29319")) {
            {}
          } else {
            stryCov_9fa48("29319");
            return service;
          }
        }
      }
    }
    return stryMutAct_9fa48("29322") ? services[NUM.ZERO] && null : stryMutAct_9fa48("29321") ? false : stryMutAct_9fa48("29320") ? true : (stryCov_9fa48("29320", "29321", "29322"), services[NUM.ZERO] || null);
  }
}
function buildMessageGroupOwnerNotReadyError(selection = {}, options = {}) {
  if (stryMutAct_9fa48("29323")) {
    {}
  } else {
    stryCov_9fa48("29323");
    const message = (stryMutAct_9fa48("29326") ? typeof options.message === TYPEOF.STRING || options.message.length > NUM.ZERO : stryMutAct_9fa48("29325") ? false : stryMutAct_9fa48("29324") ? true : (stryCov_9fa48("29324", "29325", "29326"), (stryMutAct_9fa48("29328") ? typeof options.message !== TYPEOF.STRING : stryMutAct_9fa48("29327") ? true : (stryCov_9fa48("29327", "29328"), typeof options.message === TYPEOF.STRING)) && (stryMutAct_9fa48("29331") ? options.message.length <= NUM.ZERO : stryMutAct_9fa48("29330") ? options.message.length >= NUM.ZERO : stryMutAct_9fa48("29329") ? true : (stryCov_9fa48("29329", "29330", "29331"), options.message.length > NUM.ZERO)))) ? options.message : stryMutAct_9fa48("29334") ? selection?.reason && MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY : stryMutAct_9fa48("29333") ? false : stryMutAct_9fa48("29332") ? true : (stryCov_9fa48("29332", "29333", "29334"), (stryMutAct_9fa48("29335") ? selection.reason : (stryCov_9fa48("29335"), selection?.reason)) || MESSAGE_GROUP_SELECTION_REASON.OWNER_NOT_READY);
    const error = new Error(message);
    error.ownerNotReady = stryMutAct_9fa48("29336") ? false : (stryCov_9fa48("29336"), true);
    error.deferRetry = stryMutAct_9fa48("29337") ? false : (stryCov_9fa48("29337"), true);
    const retryAfterMs = (stryMutAct_9fa48("29340") ? Number.isFinite(selection?.retryAfterMs) || selection.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("29339") ? false : stryMutAct_9fa48("29338") ? true : (stryCov_9fa48("29338", "29339", "29340"), Number.isFinite(stryMutAct_9fa48("29341") ? selection.retryAfterMs : (stryCov_9fa48("29341"), selection?.retryAfterMs)) && (stryMutAct_9fa48("29344") ? selection.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("29343") ? selection.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("29342") ? true : (stryCov_9fa48("29342", "29343", "29344"), selection.retryAfterMs > NUM.ZERO)))) ? Math.floor(selection.retryAfterMs) : NUM.ZERO;
    if (stryMutAct_9fa48("29348") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("29347") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("29346") ? false : stryMutAct_9fa48("29345") ? true : (stryCov_9fa48("29345", "29346", "29347", "29348"), retryAfterMs > NUM.ZERO)) {
      if (stryMutAct_9fa48("29349")) {
        {}
      } else {
        stryCov_9fa48("29349");
        error.retryAfterMs = retryAfterMs;
      }
    }
    return error;
  }
}
export { buildMessageGroupOwnerNotReadyError, getBootstrapMessageGroupService, resolveOperationalMessageGroupSelection, resolveOperationalMessageGroupSelectionAsync, resolveQueryTransportMessageGroupSelection };
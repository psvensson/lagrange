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
import { TYPEOF } from '../constants/index.js';
function normalizeReplicaLeaderId(nextLeaderId, options = {}) {
  if (stryMutAct_9fa48("128594")) {
    {}
  } else {
    stryCov_9fa48("128594");
    if (stryMutAct_9fa48("128597") ? typeof nextLeaderId !== TYPEOF.STRING && nextLeaderId.length === 0 : stryMutAct_9fa48("128596") ? false : stryMutAct_9fa48("128595") ? true : (stryCov_9fa48("128595", "128596", "128597"), (stryMutAct_9fa48("128599") ? typeof nextLeaderId === TYPEOF.STRING : stryMutAct_9fa48("128598") ? false : (stryCov_9fa48("128598", "128599"), typeof nextLeaderId !== TYPEOF.STRING)) || (stryMutAct_9fa48("128601") ? nextLeaderId.length !== 0 : stryMutAct_9fa48("128600") ? false : (stryCov_9fa48("128600", "128601"), nextLeaderId.length === 0)))) {
      if (stryMutAct_9fa48("128602")) {
        {}
      } else {
        stryCov_9fa48("128602");
        return null;
      }
    }
    const normalizeLeaderId = (stryMutAct_9fa48("128605") ? typeof options.normalizeLeaderId !== TYPEOF.FUNCTION : stryMutAct_9fa48("128604") ? false : stryMutAct_9fa48("128603") ? true : (stryCov_9fa48("128603", "128604", "128605"), typeof options.normalizeLeaderId === TYPEOF.FUNCTION)) ? options.normalizeLeaderId : null;
    if (stryMutAct_9fa48("128608") ? false : stryMutAct_9fa48("128607") ? true : stryMutAct_9fa48("128606") ? normalizeLeaderId : (stryCov_9fa48("128606", "128607", "128608"), !normalizeLeaderId)) {
      if (stryMutAct_9fa48("128609")) {
        {}
      } else {
        stryCov_9fa48("128609");
        return nextLeaderId;
      }
    }
    const normalizedLeaderId = normalizeLeaderId(nextLeaderId);
    return (stryMutAct_9fa48("128612") ? typeof normalizedLeaderId === TYPEOF.STRING || normalizedLeaderId.length > 0 : stryMutAct_9fa48("128611") ? false : stryMutAct_9fa48("128610") ? true : (stryCov_9fa48("128610", "128611", "128612"), (stryMutAct_9fa48("128614") ? typeof normalizedLeaderId !== TYPEOF.STRING : stryMutAct_9fa48("128613") ? true : (stryCov_9fa48("128613", "128614"), typeof normalizedLeaderId === TYPEOF.STRING)) && (stryMutAct_9fa48("128617") ? normalizedLeaderId.length <= 0 : stryMutAct_9fa48("128616") ? normalizedLeaderId.length >= 0 : stryMutAct_9fa48("128615") ? true : (stryCov_9fa48("128615", "128616", "128617"), normalizedLeaderId.length > 0)))) ? normalizedLeaderId : nextLeaderId;
  }
}
function applyReplicaLeadership(replica, role) {
  if (stryMutAct_9fa48("128618")) {
    {}
  } else {
    stryCov_9fa48("128618");
    replica.role = role;
    replica.isLeader = stryMutAct_9fa48("128619") ? false : (stryCov_9fa48("128619"), true);
    replica.leaderId = replica.replicaId;
    if (stryMutAct_9fa48("128622") ? typeof replica.queueRoleUpdate !== TYPEOF.FUNCTION : stryMutAct_9fa48("128621") ? false : stryMutAct_9fa48("128620") ? true : (stryCov_9fa48("128620", "128621", "128622"), typeof replica.queueRoleUpdate === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("128623")) {
        {}
      } else {
        stryCov_9fa48("128623");
        replica.queueRoleUpdate(role);
      }
    }
    if (stryMutAct_9fa48("128626") ? typeof replica.queueLeaderNodeUpdate !== TYPEOF.FUNCTION : stryMutAct_9fa48("128625") ? false : stryMutAct_9fa48("128624") ? true : (stryCov_9fa48("128624", "128625", "128626"), typeof replica.queueLeaderNodeUpdate === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("128627")) {
        {}
      } else {
        stryCov_9fa48("128627");
        replica.queueLeaderNodeUpdate(replica.nodeId);
      }
    }
  }
}
function clearReplicaLeaderUpdateState(replica) {
  if (stryMutAct_9fa48("128628")) {
    {}
  } else {
    stryCov_9fa48("128628");
    replica.pendingLeaderNodeUpdate = null;
    replica.persistedLeaderNodeId = null;
    if (stryMutAct_9fa48("128630") ? false : stryMutAct_9fa48("128629") ? true : (stryCov_9fa48("128629", "128630"), replica.leaderNodeUpdateRetryTimer)) {
      if (stryMutAct_9fa48("128631")) {
        {}
      } else {
        stryCov_9fa48("128631");
        clearTimeout(replica.leaderNodeUpdateRetryTimer);
        replica.leaderNodeUpdateRetryTimer = null;
      }
    }
  }
}
function applyReplicaDemotion(replica, role) {
  if (stryMutAct_9fa48("128632")) {
    {}
  } else {
    stryCov_9fa48("128632");
    replica.role = role;
    replica.isLeader = stryMutAct_9fa48("128633") ? true : (stryCov_9fa48("128633"), false);
    replica.leaderId = null;
    if (stryMutAct_9fa48("128636") ? typeof replica.queueRoleUpdate !== TYPEOF.FUNCTION : stryMutAct_9fa48("128635") ? false : stryMutAct_9fa48("128634") ? true : (stryCov_9fa48("128634", "128635", "128636"), typeof replica.queueRoleUpdate === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("128637")) {
        {}
      } else {
        stryCov_9fa48("128637");
        replica.queueRoleUpdate(role);
      }
    }
    clearReplicaLeaderUpdateState(replica);
  }
}
function reconcileReplicaLeaderChange(replica, nextLeaderId, followerRole, options = {}) {
  if (stryMutAct_9fa48("128638")) {
    {}
  } else {
    stryCov_9fa48("128638");
    const normalizedLeaderId = normalizeReplicaLeaderId(nextLeaderId, options);
    const shouldDemote = stryMutAct_9fa48("128641") ? normalizedLeaderId !== null && normalizedLeaderId !== replica.replicaId || replica.isLeader === true || replica.role === TYPEOF.STRING && replica.role.toLowerCase() === 'leader' : stryMutAct_9fa48("128640") ? false : stryMutAct_9fa48("128639") ? true : (stryCov_9fa48("128639", "128640", "128641"), (stryMutAct_9fa48("128643") ? normalizedLeaderId !== null || normalizedLeaderId !== replica.replicaId : stryMutAct_9fa48("128642") ? true : (stryCov_9fa48("128642", "128643"), (stryMutAct_9fa48("128645") ? normalizedLeaderId === null : stryMutAct_9fa48("128644") ? true : (stryCov_9fa48("128644", "128645"), normalizedLeaderId !== null)) && (stryMutAct_9fa48("128647") ? normalizedLeaderId === replica.replicaId : stryMutAct_9fa48("128646") ? true : (stryCov_9fa48("128646", "128647"), normalizedLeaderId !== replica.replicaId)))) && (stryMutAct_9fa48("128649") ? replica.isLeader === true && replica.role === TYPEOF.STRING && replica.role.toLowerCase() === 'leader' : stryMutAct_9fa48("128648") ? true : (stryCov_9fa48("128648", "128649"), (stryMutAct_9fa48("128651") ? replica.isLeader !== true : stryMutAct_9fa48("128650") ? false : (stryCov_9fa48("128650", "128651"), replica.isLeader === (stryMutAct_9fa48("128652") ? false : (stryCov_9fa48("128652"), true)))) || (stryMutAct_9fa48("128654") ? replica.role === TYPEOF.STRING || replica.role.toLowerCase() === 'leader' : stryMutAct_9fa48("128653") ? false : (stryCov_9fa48("128653", "128654"), (stryMutAct_9fa48("128656") ? replica.role !== TYPEOF.STRING : stryMutAct_9fa48("128655") ? true : (stryCov_9fa48("128655", "128656"), replica.role === TYPEOF.STRING)) && (stryMutAct_9fa48("128658") ? replica.role.toLowerCase() !== 'leader' : stryMutAct_9fa48("128657") ? true : (stryCov_9fa48("128657", "128658"), (stryMutAct_9fa48("128659") ? replica.role.toUpperCase() : (stryCov_9fa48("128659"), replica.role.toLowerCase())) === (stryMutAct_9fa48("128660") ? "" : (stryCov_9fa48("128660"), 'leader')))))))));
    if (stryMutAct_9fa48("128662") ? false : stryMutAct_9fa48("128661") ? true : (stryCov_9fa48("128661", "128662"), shouldDemote)) {
      if (stryMutAct_9fa48("128663")) {
        {}
      } else {
        stryCov_9fa48("128663");
        applyReplicaDemotion(replica, followerRole);
      }
    }
    replica.leaderId = normalizedLeaderId;
    return shouldDemote;
  }
}
function wireReplicaLifecycleEvents(replica, options = {}) {
  if (stryMutAct_9fa48("128664")) {
    {}
  } else {
    stryCov_9fa48("128664");
    const raft = stryMutAct_9fa48("128667") ? options.raft && replica.raft : stryMutAct_9fa48("128666") ? false : stryMutAct_9fa48("128665") ? true : (stryCov_9fa48("128665", "128666", "128667"), options.raft || replica.raft);
    const events = stryMutAct_9fa48("128670") ? options.events && {} : stryMutAct_9fa48("128669") ? false : stryMutAct_9fa48("128668") ? true : (stryCov_9fa48("128668", "128669", "128670"), options.events || {});
    const roles = stryMutAct_9fa48("128673") ? options.roles && {} : stryMutAct_9fa48("128672") ? false : stryMutAct_9fa48("128671") ? true : (stryCov_9fa48("128671", "128672", "128673"), options.roles || {});
    const shouldIgnoreLeaderEvent = (stryMutAct_9fa48("128676") ? typeof options.shouldIgnoreLeaderEvent !== TYPEOF.FUNCTION : stryMutAct_9fa48("128675") ? false : stryMutAct_9fa48("128674") ? true : (stryCov_9fa48("128674", "128675", "128676"), typeof options.shouldIgnoreLeaderEvent === TYPEOF.FUNCTION)) ? options.shouldIgnoreLeaderEvent : stryMutAct_9fa48("128677") ? () => undefined : (stryCov_9fa48("128677"), () => stryMutAct_9fa48("128678") ? true : (stryCov_9fa48("128678"), false));
    const shouldIgnoreDemotionEvent = (stryMutAct_9fa48("128681") ? typeof options.shouldIgnoreDemotionEvent !== TYPEOF.FUNCTION : stryMutAct_9fa48("128680") ? false : stryMutAct_9fa48("128679") ? true : (stryCov_9fa48("128679", "128680", "128681"), typeof options.shouldIgnoreDemotionEvent === TYPEOF.FUNCTION)) ? options.shouldIgnoreDemotionEvent : stryMutAct_9fa48("128682") ? () => undefined : (stryCov_9fa48("128682"), () => stryMutAct_9fa48("128683") ? true : (stryCov_9fa48("128683"), false));
    const getCurrentTerm = (stryMutAct_9fa48("128686") ? typeof options.getCurrentTerm !== TYPEOF.FUNCTION : stryMutAct_9fa48("128685") ? false : stryMutAct_9fa48("128684") ? true : (stryCov_9fa48("128684", "128685", "128686"), typeof options.getCurrentTerm === TYPEOF.FUNCTION)) ? options.getCurrentTerm : stryMutAct_9fa48("128687") ? () => undefined : (stryCov_9fa48("128687"), () => null);
    const onLeader = (stryMutAct_9fa48("128690") ? typeof options.onLeader !== TYPEOF.FUNCTION : stryMutAct_9fa48("128689") ? false : stryMutAct_9fa48("128688") ? true : (stryCov_9fa48("128688", "128689", "128690"), typeof options.onLeader === TYPEOF.FUNCTION)) ? options.onLeader : () => {};
    const onFollower = (stryMutAct_9fa48("128693") ? typeof options.onFollower !== TYPEOF.FUNCTION : stryMutAct_9fa48("128692") ? false : stryMutAct_9fa48("128691") ? true : (stryCov_9fa48("128691", "128692", "128693"), typeof options.onFollower === TYPEOF.FUNCTION)) ? options.onFollower : () => {};
    const onCandidate = (stryMutAct_9fa48("128696") ? typeof options.onCandidate !== TYPEOF.FUNCTION : stryMutAct_9fa48("128695") ? false : stryMutAct_9fa48("128694") ? true : (stryCov_9fa48("128694", "128695", "128696"), typeof options.onCandidate === TYPEOF.FUNCTION)) ? options.onCandidate : () => {};
    const onCommit = (stryMutAct_9fa48("128699") ? typeof options.onCommit !== TYPEOF.FUNCTION : stryMutAct_9fa48("128698") ? false : stryMutAct_9fa48("128697") ? true : (stryCov_9fa48("128697", "128698", "128699"), typeof options.onCommit === TYPEOF.FUNCTION)) ? options.onCommit : () => {};
    const onLeaderChange = (stryMutAct_9fa48("128702") ? typeof options.onLeaderChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("128701") ? false : stryMutAct_9fa48("128700") ? true : (stryCov_9fa48("128700", "128701", "128702"), typeof options.onLeaderChange === TYPEOF.FUNCTION)) ? options.onLeaderChange : () => {};
    const onTermChange = (stryMutAct_9fa48("128705") ? typeof options.onTermChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("128704") ? false : stryMutAct_9fa48("128703") ? true : (stryCov_9fa48("128703", "128704", "128705"), typeof options.onTermChange === TYPEOF.FUNCTION)) ? options.onTermChange : () => {};
    const normalizeLeaderId = (stryMutAct_9fa48("128708") ? typeof options.normalizeLeaderId !== TYPEOF.FUNCTION : stryMutAct_9fa48("128707") ? false : stryMutAct_9fa48("128706") ? true : (stryCov_9fa48("128706", "128707", "128708"), typeof options.normalizeLeaderId === TYPEOF.FUNCTION)) ? options.normalizeLeaderId : null;
    raft.on(events.LEADER, () => {
      if (stryMutAct_9fa48("128709")) {
        {}
      } else {
        stryCov_9fa48("128709");
        if (stryMutAct_9fa48("128711") ? false : stryMutAct_9fa48("128710") ? true : (stryCov_9fa48("128710", "128711"), shouldIgnoreLeaderEvent(events.LEADER))) {
          if (stryMutAct_9fa48("128712")) {
            {}
          } else {
            stryCov_9fa48("128712");
            return;
          }
        }
        applyReplicaLeadership(replica, roles.LEADER);
        onLeader(stryMutAct_9fa48("128713") ? {} : (stryCov_9fa48("128713"), {
          term: getCurrentTerm()
        }));
      }
    });
    raft.on(events.FOLLOWER, () => {
      if (stryMutAct_9fa48("128714")) {
        {}
      } else {
        stryCov_9fa48("128714");
        if (stryMutAct_9fa48("128716") ? false : stryMutAct_9fa48("128715") ? true : (stryCov_9fa48("128715", "128716"), shouldIgnoreDemotionEvent(events.FOLLOWER))) {
          if (stryMutAct_9fa48("128717")) {
            {}
          } else {
            stryCov_9fa48("128717");
            return;
          }
        }
        applyReplicaDemotion(replica, roles.FOLLOWER);
        onFollower(stryMutAct_9fa48("128718") ? {} : (stryCov_9fa48("128718"), {
          term: getCurrentTerm(),
          demotedByLeaderChange: stryMutAct_9fa48("128719") ? true : (stryCov_9fa48("128719"), false)
        }));
      }
    });
    raft.on(events.CANDIDATE, () => {
      if (stryMutAct_9fa48("128720")) {
        {}
      } else {
        stryCov_9fa48("128720");
        if (stryMutAct_9fa48("128722") ? false : stryMutAct_9fa48("128721") ? true : (stryCov_9fa48("128721", "128722"), shouldIgnoreDemotionEvent(events.CANDIDATE))) {
          if (stryMutAct_9fa48("128723")) {
            {}
          } else {
            stryCov_9fa48("128723");
            return;
          }
        }
        applyReplicaDemotion(replica, roles.CANDIDATE);
        onCandidate(stryMutAct_9fa48("128724") ? {} : (stryCov_9fa48("128724"), {
          term: getCurrentTerm()
        }));
      }
    });
    raft.on(events.COMMIT, command => {
      if (stryMutAct_9fa48("128725")) {
        {}
      } else {
        stryCov_9fa48("128725");
        onCommit(command);
      }
    });
    raft.on(events.LEADER_CHANGE, nextLeaderId => {
      if (stryMutAct_9fa48("128726")) {
        {}
      } else {
        stryCov_9fa48("128726");
        const previousLeaderId = replica.leaderId;
        const demoted = reconcileReplicaLeaderChange(replica, nextLeaderId, roles.FOLLOWER, stryMutAct_9fa48("128727") ? {} : (stryCov_9fa48("128727"), {
          normalizeLeaderId
        }));
        if (stryMutAct_9fa48("128729") ? false : stryMutAct_9fa48("128728") ? true : (stryCov_9fa48("128728", "128729"), demoted)) {
          if (stryMutAct_9fa48("128730")) {
            {}
          } else {
            stryCov_9fa48("128730");
            onFollower(stryMutAct_9fa48("128731") ? {} : (stryCov_9fa48("128731"), {
              term: getCurrentTerm(),
              demotedByLeaderChange: stryMutAct_9fa48("128732") ? false : (stryCov_9fa48("128732"), true)
            }));
          }
        }
        onLeaderChange(stryMutAct_9fa48("128733") ? {} : (stryCov_9fa48("128733"), {
          demoted,
          leaderId: replica.leaderId,
          previousLeaderId,
          rawLeaderId: nextLeaderId,
          term: getCurrentTerm()
        }));
      }
    });
    raft.on(events.TERM_CHANGE, term => {
      if (stryMutAct_9fa48("128734")) {
        {}
      } else {
        stryCov_9fa48("128734");
        onTermChange(stryMutAct_9fa48("128735") ? {} : (stryCov_9fa48("128735"), {
          term
        }));
      }
    });
  }
}
export { applyReplicaLeadership, applyReplicaDemotion, clearReplicaLeaderUpdateState, normalizeReplicaLeaderId, reconcileReplicaLeaderChange, wireReplicaLifecycleEvents };
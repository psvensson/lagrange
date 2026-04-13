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
import { NUM, STATE, TYPEOF } from '../constants/index.js';
const CONTROL_PLANE_KERNEL_INGRESS_DEFAULT = Object.freeze(stryMutAct_9fa48("57567") ? {} : (stryCov_9fa48("57567"), {
  LEASE_MS: 30000,
  SUPPRESSION_MS: 5000
}));
function pushUniqueAddress(targets, address) {
  if (stryMutAct_9fa48("57568")) {
    {}
  } else {
    stryCov_9fa48("57568");
    if (stryMutAct_9fa48("57571") ? typeof address !== TYPEOF.STRING && address.length === NUM.ZERO : stryMutAct_9fa48("57570") ? false : stryMutAct_9fa48("57569") ? true : (stryCov_9fa48("57569", "57570", "57571"), (stryMutAct_9fa48("57573") ? typeof address === TYPEOF.STRING : stryMutAct_9fa48("57572") ? false : (stryCov_9fa48("57572", "57573"), typeof address !== TYPEOF.STRING)) || (stryMutAct_9fa48("57575") ? address.length !== NUM.ZERO : stryMutAct_9fa48("57574") ? false : (stryCov_9fa48("57574", "57575"), address.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("57576")) {
        {}
      } else {
        stryCov_9fa48("57576");
        return;
      }
    }
    if (stryMutAct_9fa48("57578") ? false : stryMutAct_9fa48("57577") ? true : (stryCov_9fa48("57577", "57578"), targets.includes(address))) {
      if (stryMutAct_9fa48("57579")) {
        {}
      } else {
        stryCov_9fa48("57579");
        return;
      }
    }
    targets.push(address);
  }
}
function parseMessageGroupAddress(address) {
  if (stryMutAct_9fa48("57580")) {
    {}
  } else {
    stryCov_9fa48("57580");
    if (stryMutAct_9fa48("57583") ? typeof address !== TYPEOF.STRING && address.length === NUM.ZERO : stryMutAct_9fa48("57582") ? false : stryMutAct_9fa48("57581") ? true : (stryCov_9fa48("57581", "57582", "57583"), (stryMutAct_9fa48("57585") ? typeof address === TYPEOF.STRING : stryMutAct_9fa48("57584") ? false : (stryCov_9fa48("57584", "57585"), typeof address !== TYPEOF.STRING)) || (stryMutAct_9fa48("57587") ? address.length !== NUM.ZERO : stryMutAct_9fa48("57586") ? false : (stryCov_9fa48("57586", "57587"), address.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("57588")) {
        {}
      } else {
        stryCov_9fa48("57588");
        return null;
      }
    }
    const match = address.match(stryMutAct_9fa48("57593") ? /^([^/]+)\/message-group\/(.)$/ : stryMutAct_9fa48("57592") ? /^([/]+)\/message-group\/(.+)$/ : stryMutAct_9fa48("57591") ? /^([^/])\/message-group\/(.+)$/ : stryMutAct_9fa48("57590") ? /^([^/]+)\/message-group\/(.+)/ : stryMutAct_9fa48("57589") ? /([^/]+)\/message-group\/(.+)$/ : (stryCov_9fa48("57589", "57590", "57591", "57592", "57593"), /^([^/]+)\/message-group\/(.+)$/));
    if (stryMutAct_9fa48("57596") ? false : stryMutAct_9fa48("57595") ? true : stryMutAct_9fa48("57594") ? match : (stryCov_9fa48("57594", "57595", "57596"), !match)) {
      if (stryMutAct_9fa48("57597")) {
        {}
      } else {
        stryCov_9fa48("57597");
        return null;
      }
    }
    return stryMutAct_9fa48("57598") ? {} : (stryCov_9fa48("57598"), {
      nodeId: match[NUM.ONE],
      replicaId: match[NUM.TWO]
    });
  }
}
class ControlPlaneKernelIngress {
  constructor(options = {}) {
    if (stryMutAct_9fa48("57599")) {
      {}
    } else {
      stryCov_9fa48("57599");
      this.nodeId = stryMutAct_9fa48("57602") ? options.nodeId && null : stryMutAct_9fa48("57601") ? false : stryMutAct_9fa48("57600") ? true : (stryCov_9fa48("57600", "57601", "57602"), options.nodeId || null);
      this.getBootstrapResponse = (stryMutAct_9fa48("57605") ? typeof options.getBootstrapResponse !== TYPEOF.FUNCTION : stryMutAct_9fa48("57604") ? false : stryMutAct_9fa48("57603") ? true : (stryCov_9fa48("57603", "57604", "57605"), typeof options.getBootstrapResponse === TYPEOF.FUNCTION)) ? options.getBootstrapResponse : stryMutAct_9fa48("57606") ? () => undefined : (stryCov_9fa48("57606"), () => null);
      this.getSeedNodeId = (stryMutAct_9fa48("57609") ? typeof options.getSeedNodeId !== TYPEOF.FUNCTION : stryMutAct_9fa48("57608") ? false : stryMutAct_9fa48("57607") ? true : (stryCov_9fa48("57607", "57608", "57609"), typeof options.getSeedNodeId === TYPEOF.FUNCTION)) ? options.getSeedNodeId : stryMutAct_9fa48("57610") ? () => undefined : (stryCov_9fa48("57610"), () => null);
      this.getMessageRouter = (stryMutAct_9fa48("57613") ? typeof options.getMessageRouter !== TYPEOF.FUNCTION : stryMutAct_9fa48("57612") ? false : stryMutAct_9fa48("57611") ? true : (stryCov_9fa48("57611", "57612", "57613"), typeof options.getMessageRouter === TYPEOF.FUNCTION)) ? options.getMessageRouter : stryMutAct_9fa48("57614") ? () => undefined : (stryCov_9fa48("57614"), () => null);
      this.getMessageGroupServices = (stryMutAct_9fa48("57617") ? typeof options.getMessageGroupServices !== TYPEOF.FUNCTION : stryMutAct_9fa48("57616") ? false : stryMutAct_9fa48("57615") ? true : (stryCov_9fa48("57615", "57616", "57617"), typeof options.getMessageGroupServices === TYPEOF.FUNCTION)) ? options.getMessageGroupServices : stryMutAct_9fa48("57618") ? () => undefined : (stryCov_9fa48("57618"), () => new Map());
      this.now = (stryMutAct_9fa48("57621") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("57620") ? false : stryMutAct_9fa48("57619") ? true : (stryCov_9fa48("57619", "57620", "57621"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("57622") ? () => undefined : (stryCov_9fa48("57622"), () => Date.now());
      this.ingressLeaseMs = (stryMutAct_9fa48("57625") ? Number.isFinite(options.ingressLeaseMs) || options.ingressLeaseMs > NUM.ZERO : stryMutAct_9fa48("57624") ? false : stryMutAct_9fa48("57623") ? true : (stryCov_9fa48("57623", "57624", "57625"), Number.isFinite(options.ingressLeaseMs) && (stryMutAct_9fa48("57628") ? options.ingressLeaseMs <= NUM.ZERO : stryMutAct_9fa48("57627") ? options.ingressLeaseMs >= NUM.ZERO : stryMutAct_9fa48("57626") ? true : (stryCov_9fa48("57626", "57627", "57628"), options.ingressLeaseMs > NUM.ZERO)))) ? Math.floor(options.ingressLeaseMs) : CONTROL_PLANE_KERNEL_INGRESS_DEFAULT.LEASE_MS;
      this.targetSuppressionMs = (stryMutAct_9fa48("57631") ? Number.isFinite(options.targetSuppressionMs) || options.targetSuppressionMs > NUM.ZERO : stryMutAct_9fa48("57630") ? false : stryMutAct_9fa48("57629") ? true : (stryCov_9fa48("57629", "57630", "57631"), Number.isFinite(options.targetSuppressionMs) && (stryMutAct_9fa48("57634") ? options.targetSuppressionMs <= NUM.ZERO : stryMutAct_9fa48("57633") ? options.targetSuppressionMs >= NUM.ZERO : stryMutAct_9fa48("57632") ? true : (stryCov_9fa48("57632", "57633", "57634"), options.targetSuppressionMs > NUM.ZERO)))) ? Math.floor(options.targetSuppressionMs) : CONTROL_PLANE_KERNEL_INGRESS_DEFAULT.SUPPRESSION_MS;
      this.confirmedIngressLease = null;
      this.ingressEpoch = NUM.ZERO;
      this.suppressedTargetAddresses = new Map();
    }
  }
  resolveTargetAddress(options = {}) {
    if (stryMutAct_9fa48("57635")) {
      {}
    } else {
      stryCov_9fa48("57635");
      return stryMutAct_9fa48("57638") ? this.resolveTargetCandidates(options)[NUM.ZERO] && null : stryMutAct_9fa48("57637") ? false : stryMutAct_9fa48("57636") ? true : (stryCov_9fa48("57636", "57637", "57638"), this.resolveTargetCandidates(options)[NUM.ZERO] || null);
    }
  }
  resolveNodeStateUpdateTargetCandidates(options = {}) {
    if (stryMutAct_9fa48("57639")) {
      {}
    } else {
      stryCov_9fa48("57639");
      const sharedOptions = stryMutAct_9fa48("57640") ? {} : (stryCov_9fa48("57640"), {
        allowBootstrapHints: stryMutAct_9fa48("57643") ? options.allowBootstrapHints === false : stryMutAct_9fa48("57642") ? false : stryMutAct_9fa48("57641") ? true : (stryCov_9fa48("57641", "57642", "57643"), options.allowBootstrapHints !== (stryMutAct_9fa48("57644") ? true : (stryCov_9fa48("57644"), false))),
        localTargetMode: (stryMutAct_9fa48("57647") ? options.localTargetMode !== 'any_replica' : stryMutAct_9fa48("57646") ? false : stryMutAct_9fa48("57645") ? true : (stryCov_9fa48("57645", "57646", "57647"), options.localTargetMode === (stryMutAct_9fa48("57648") ? "" : (stryCov_9fa48("57648"), 'any_replica')))) ? stryMutAct_9fa48("57649") ? "" : (stryCov_9fa48("57649"), 'any_replica') : stryMutAct_9fa48("57650") ? "" : (stryCov_9fa48("57650"), 'leader_only'),
        requiredTables: Array.isArray(options.requiredTables) ? options.requiredTables : stryMutAct_9fa48("57651") ? ["Stryker was here"] : (stryCov_9fa48("57651"), [])
      });
      const isReadyHeartbeatPublication = stryMutAct_9fa48("57654") ? options.state === STATE.READY || Number.isFinite(options.heartbeatAt) : stryMutAct_9fa48("57653") ? false : stryMutAct_9fa48("57652") ? true : (stryCov_9fa48("57652", "57653", "57654"), (stryMutAct_9fa48("57656") ? options.state !== STATE.READY : stryMutAct_9fa48("57655") ? true : (stryCov_9fa48("57655", "57656"), options.state === STATE.READY)) && Number.isFinite(options.heartbeatAt));
      if (stryMutAct_9fa48("57659") ? false : stryMutAct_9fa48("57658") ? true : stryMutAct_9fa48("57657") ? isReadyHeartbeatPublication : (stryCov_9fa48("57657", "57658", "57659"), !isReadyHeartbeatPublication)) {
        if (stryMutAct_9fa48("57660")) {
          {}
        } else {
          stryCov_9fa48("57660");
          return this.resolveTargetCandidates(stryMutAct_9fa48("57661") ? {} : (stryCov_9fa48("57661"), {
            ...sharedOptions,
            allowSelfTarget: stryMutAct_9fa48("57662") ? false : (stryCov_9fa48("57662"), true)
          }));
        }
      }
      const remoteCandidates = this.resolveTargetCandidates(stryMutAct_9fa48("57663") ? {} : (stryCov_9fa48("57663"), {
        ...sharedOptions,
        allowSelfTarget: stryMutAct_9fa48("57664") ? true : (stryCov_9fa48("57664"), false)
      }));
      const optimisticRemoteCandidates = (stryMutAct_9fa48("57668") ? remoteCandidates.length <= NUM.ZERO : stryMutAct_9fa48("57667") ? remoteCandidates.length >= NUM.ZERO : stryMutAct_9fa48("57666") ? false : stryMutAct_9fa48("57665") ? true : (stryCov_9fa48("57665", "57666", "57667", "57668"), remoteCandidates.length > NUM.ZERO)) ? stryMutAct_9fa48("57669") ? ["Stryker was here"] : (stryCov_9fa48("57669"), []) : this.resolveTargetCandidates(stryMutAct_9fa48("57670") ? {} : (stryCov_9fa48("57670"), {
        ...sharedOptions,
        allowSelfTarget: stryMutAct_9fa48("57671") ? true : (stryCov_9fa48("57671"), false),
        allowDisconnectedTargets: stryMutAct_9fa48("57672") ? false : (stryCov_9fa48("57672"), true)
      }));
      const allCandidates = this.resolveTargetCandidates(stryMutAct_9fa48("57673") ? {} : (stryCov_9fa48("57673"), {
        ...sharedOptions,
        allowSelfTarget: stryMutAct_9fa48("57674") ? false : (stryCov_9fa48("57674"), true)
      }));
      const mergedCandidates = stryMutAct_9fa48("57675") ? [] : (stryCov_9fa48("57675"), [...remoteCandidates]);
      for (const address of optimisticRemoteCandidates) {
        if (stryMutAct_9fa48("57676")) {
          {}
        } else {
          stryCov_9fa48("57676");
          pushUniqueAddress(mergedCandidates, address);
        }
      }
      for (const address of allCandidates) {
        if (stryMutAct_9fa48("57677")) {
          {}
        } else {
          stryCov_9fa48("57677");
          pushUniqueAddress(mergedCandidates, address);
        }
      }
      return mergedCandidates;
    }
  }
  resolveTargetCandidates(options = {}) {
    if (stryMutAct_9fa48("57678")) {
      {}
    } else {
      stryCov_9fa48("57678");
      this.pruneExpiredState();
      const targets = stryMutAct_9fa48("57679") ? ["Stryker was here"] : (stryCov_9fa48("57679"), []);
      const allowBootstrapHints = stryMutAct_9fa48("57682") ? options.allowBootstrapHints === false : stryMutAct_9fa48("57681") ? false : stryMutAct_9fa48("57680") ? true : (stryCov_9fa48("57680", "57681", "57682"), options.allowBootstrapHints !== (stryMutAct_9fa48("57683") ? true : (stryCov_9fa48("57683"), false)));
      const allowSelfTarget = stryMutAct_9fa48("57686") ? options.allowSelfTarget !== true : stryMutAct_9fa48("57685") ? false : stryMutAct_9fa48("57684") ? true : (stryCov_9fa48("57684", "57685", "57686"), options.allowSelfTarget === (stryMutAct_9fa48("57687") ? false : (stryCov_9fa48("57687"), true)));
      const allowDisconnectedTargets = stryMutAct_9fa48("57690") ? options.allowDisconnectedTargets !== true : stryMutAct_9fa48("57689") ? false : stryMutAct_9fa48("57688") ? true : (stryCov_9fa48("57688", "57689", "57690"), options.allowDisconnectedTargets === (stryMutAct_9fa48("57691") ? false : (stryCov_9fa48("57691"), true)));
      const requiredTables = Array.isArray(options.requiredTables) ? options.requiredTables : stryMutAct_9fa48("57692") ? ["Stryker was here"] : (stryCov_9fa48("57692"), []);
      const localTargetMode = (stryMutAct_9fa48("57695") ? options.localTargetMode !== 'any_replica' : stryMutAct_9fa48("57694") ? false : stryMutAct_9fa48("57693") ? true : (stryCov_9fa48("57693", "57694", "57695"), options.localTargetMode === (stryMutAct_9fa48("57696") ? "" : (stryCov_9fa48("57696"), 'any_replica')))) ? stryMutAct_9fa48("57697") ? "" : (stryCov_9fa48("57697"), 'any_replica') : stryMutAct_9fa48("57698") ? "" : (stryCov_9fa48("57698"), 'leader_only');
      const assignment = stryMutAct_9fa48("57701") ? this.getBootstrapResponse()?.messageGroupAssignment && null : stryMutAct_9fa48("57700") ? false : stryMutAct_9fa48("57699") ? true : (stryCov_9fa48("57699", "57700", "57701"), (stryMutAct_9fa48("57702") ? this.getBootstrapResponse().messageGroupAssignment : (stryCov_9fa48("57702"), this.getBootstrapResponse()?.messageGroupAssignment)) || null);
      const localTargetAddress = allowSelfTarget ? this.resolveLocalTargetAddress(assignment, stryMutAct_9fa48("57703") ? {} : (stryCov_9fa48("57703"), {
        localTargetMode,
        requiredTables
      })) : null;
      const pushOrderedTarget = address => {
        if (stryMutAct_9fa48("57704")) {
          {}
        } else {
          stryCov_9fa48("57704");
          if (stryMutAct_9fa48("57707") ? typeof address !== TYPEOF.STRING && address.length === NUM.ZERO : stryMutAct_9fa48("57706") ? false : stryMutAct_9fa48("57705") ? true : (stryCov_9fa48("57705", "57706", "57707"), (stryMutAct_9fa48("57709") ? typeof address === TYPEOF.STRING : stryMutAct_9fa48("57708") ? false : (stryCov_9fa48("57708", "57709"), typeof address !== TYPEOF.STRING)) || (stryMutAct_9fa48("57711") ? address.length !== NUM.ZERO : stryMutAct_9fa48("57710") ? false : (stryCov_9fa48("57710", "57711"), address.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("57712")) {
              {}
            } else {
              stryCov_9fa48("57712");
              return;
            }
          }
          if (stryMutAct_9fa48("57715") ? false : stryMutAct_9fa48("57714") ? true : stryMutAct_9fa48("57713") ? this.isTargetReachable(address, {
            allowDisconnectedTargets
          }) : (stryCov_9fa48("57713", "57714", "57715"), !this.isTargetReachable(address, stryMutAct_9fa48("57716") ? {} : (stryCov_9fa48("57716"), {
            allowDisconnectedTargets
          })))) {
            if (stryMutAct_9fa48("57717")) {
              {}
            } else {
              stryCov_9fa48("57717");
              return;
            }
          }
          pushUniqueAddress(targets, address);
        }
      };
      if (stryMutAct_9fa48("57719") ? false : stryMutAct_9fa48("57718") ? true : (stryCov_9fa48("57718", "57719"), localTargetAddress)) {
        if (stryMutAct_9fa48("57720")) {
          {}
        } else {
          stryCov_9fa48("57720");
          pushOrderedTarget(localTargetAddress);
        }
      }
      const confirmedIngressLease = this.getConfirmedIngressLease();
      if (stryMutAct_9fa48("57722") ? false : stryMutAct_9fa48("57721") ? true : (stryCov_9fa48("57721", "57722"), confirmedIngressLease)) {
        if (stryMutAct_9fa48("57723")) {
          {}
        } else {
          stryCov_9fa48("57723");
          const confirmedTargetParts = parseMessageGroupAddress(confirmedIngressLease.targetAddress);
          const confirmedLocalTarget = stryMutAct_9fa48("57726") ? confirmedTargetParts?.nodeId !== this.nodeId : stryMutAct_9fa48("57725") ? false : stryMutAct_9fa48("57724") ? true : (stryCov_9fa48("57724", "57725", "57726"), (stryMutAct_9fa48("57727") ? confirmedTargetParts.nodeId : (stryCov_9fa48("57727"), confirmedTargetParts?.nodeId)) === this.nodeId);
          if (stryMutAct_9fa48("57730") ? !confirmedLocalTarget && confirmedIngressLease.targetAddress === localTargetAddress : stryMutAct_9fa48("57729") ? false : stryMutAct_9fa48("57728") ? true : (stryCov_9fa48("57728", "57729", "57730"), (stryMutAct_9fa48("57731") ? confirmedLocalTarget : (stryCov_9fa48("57731"), !confirmedLocalTarget)) || (stryMutAct_9fa48("57733") ? confirmedIngressLease.targetAddress !== localTargetAddress : stryMutAct_9fa48("57732") ? false : (stryCov_9fa48("57732", "57733"), confirmedIngressLease.targetAddress === localTargetAddress)))) {
            if (stryMutAct_9fa48("57734")) {
              {}
            } else {
              stryCov_9fa48("57734");
              pushOrderedTarget(confirmedIngressLease.targetAddress);
            }
          }
        }
      }
      if (stryMutAct_9fa48("57736") ? false : stryMutAct_9fa48("57735") ? true : (stryCov_9fa48("57735", "57736"), allowBootstrapHints)) {
        if (stryMutAct_9fa48("57737")) {
          {}
        } else {
          stryCov_9fa48("57737");
          for (const address of this.resolveBootstrapTargetAddresses(assignment, stryMutAct_9fa48("57738") ? {} : (stryCov_9fa48("57738"), {
            allowDisconnectedTargets
          }))) {
            if (stryMutAct_9fa48("57739")) {
              {}
            } else {
              stryCov_9fa48("57739");
              pushOrderedTarget(address);
            }
          }
        }
      }
      return targets;
    }
  }
  getConfirmedIngressLease() {
    if (stryMutAct_9fa48("57740")) {
      {}
    } else {
      stryCov_9fa48("57740");
      this.pruneExpiredState();
      return this.confirmedIngressLease;
    }
  }
  noteSuccessfulTarget(targetAddress) {
    if (stryMutAct_9fa48("57741")) {
      {}
    } else {
      stryCov_9fa48("57741");
      if (stryMutAct_9fa48("57744") ? typeof targetAddress !== TYPEOF.STRING && targetAddress.length === NUM.ZERO : stryMutAct_9fa48("57743") ? false : stryMutAct_9fa48("57742") ? true : (stryCov_9fa48("57742", "57743", "57744"), (stryMutAct_9fa48("57746") ? typeof targetAddress === TYPEOF.STRING : stryMutAct_9fa48("57745") ? false : (stryCov_9fa48("57745", "57746"), typeof targetAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("57748") ? targetAddress.length !== NUM.ZERO : stryMutAct_9fa48("57747") ? false : (stryCov_9fa48("57747", "57748"), targetAddress.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("57749")) {
          {}
        } else {
          stryCov_9fa48("57749");
          return null;
        }
      }
      const existingLease = this.getConfirmedIngressLease();
      const epoch = (stryMutAct_9fa48("57752") ? existingLease?.targetAddress !== targetAddress : stryMutAct_9fa48("57751") ? false : stryMutAct_9fa48("57750") ? true : (stryCov_9fa48("57750", "57751", "57752"), (stryMutAct_9fa48("57753") ? existingLease.targetAddress : (stryCov_9fa48("57753"), existingLease?.targetAddress)) === targetAddress)) ? existingLease.epoch : stryMutAct_9fa48("57754") ? this.ingressEpoch - NUM.ONE : (stryCov_9fa48("57754"), this.ingressEpoch + NUM.ONE);
      this.ingressEpoch = epoch;
      this.confirmedIngressLease = Object.freeze(stryMutAct_9fa48("57755") ? {} : (stryCov_9fa48("57755"), {
        targetAddress,
        epoch,
        expiresAt: stryMutAct_9fa48("57756") ? this.now() - this.ingressLeaseMs : (stryCov_9fa48("57756"), this.now() + this.ingressLeaseMs)
      }));
      this.suppressedTargetAddresses.delete(targetAddress);
      return this.confirmedIngressLease;
    }
  }
  invalidateTarget(targetAddress) {
    if (stryMutAct_9fa48("57757")) {
      {}
    } else {
      stryCov_9fa48("57757");
      if (stryMutAct_9fa48("57760") ? typeof targetAddress !== TYPEOF.STRING && targetAddress.length === NUM.ZERO : stryMutAct_9fa48("57759") ? false : stryMutAct_9fa48("57758") ? true : (stryCov_9fa48("57758", "57759", "57760"), (stryMutAct_9fa48("57762") ? typeof targetAddress === TYPEOF.STRING : stryMutAct_9fa48("57761") ? false : (stryCov_9fa48("57761", "57762"), typeof targetAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("57764") ? targetAddress.length !== NUM.ZERO : stryMutAct_9fa48("57763") ? false : (stryCov_9fa48("57763", "57764"), targetAddress.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("57765")) {
          {}
        } else {
          stryCov_9fa48("57765");
          return;
        }
      }
      if (stryMutAct_9fa48("57768") ? this.confirmedIngressLease?.targetAddress !== targetAddress : stryMutAct_9fa48("57767") ? false : stryMutAct_9fa48("57766") ? true : (stryCov_9fa48("57766", "57767", "57768"), (stryMutAct_9fa48("57769") ? this.confirmedIngressLease.targetAddress : (stryCov_9fa48("57769"), this.confirmedIngressLease?.targetAddress)) === targetAddress)) {
        if (stryMutAct_9fa48("57770")) {
          {}
        } else {
          stryCov_9fa48("57770");
          this.confirmedIngressLease = null;
        }
      }
      if (stryMutAct_9fa48("57774") ? this.targetSuppressionMs <= NUM.ZERO : stryMutAct_9fa48("57773") ? this.targetSuppressionMs >= NUM.ZERO : stryMutAct_9fa48("57772") ? false : stryMutAct_9fa48("57771") ? true : (stryCov_9fa48("57771", "57772", "57773", "57774"), this.targetSuppressionMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("57775")) {
          {}
        } else {
          stryCov_9fa48("57775");
          this.suppressedTargetAddresses.set(targetAddress, stryMutAct_9fa48("57776") ? this.now() - this.targetSuppressionMs : (stryCov_9fa48("57776"), this.now() + this.targetSuppressionMs));
        }
      }
    }
  }
  resolveLocalTargetAddress(assignment = null, options = {}) {
    if (stryMutAct_9fa48("57777")) {
      {}
    } else {
      stryCov_9fa48("57777");
      const services = this.getMessageGroupServices();
      if (stryMutAct_9fa48("57780") ? !(services instanceof Map) && services.size === NUM.ZERO : stryMutAct_9fa48("57779") ? false : stryMutAct_9fa48("57778") ? true : (stryCov_9fa48("57778", "57779", "57780"), (stryMutAct_9fa48("57781") ? services instanceof Map : (stryCov_9fa48("57781"), !(services instanceof Map))) || (stryMutAct_9fa48("57783") ? services.size !== NUM.ZERO : stryMutAct_9fa48("57782") ? false : (stryCov_9fa48("57782", "57783"), services.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("57784")) {
          {}
        } else {
          stryCov_9fa48("57784");
          return null;
        }
      }
      const requiredTables = Array.isArray(options.requiredTables) ? options.requiredTables : stryMutAct_9fa48("57785") ? ["Stryker was here"] : (stryCov_9fa48("57785"), []);
      const localTargetMode = (stryMutAct_9fa48("57788") ? options.localTargetMode !== 'any_replica' : stryMutAct_9fa48("57787") ? false : stryMutAct_9fa48("57786") ? true : (stryCov_9fa48("57786", "57787", "57788"), options.localTargetMode === (stryMutAct_9fa48("57789") ? "" : (stryCov_9fa48("57789"), 'any_replica')))) ? stryMutAct_9fa48("57790") ? "" : (stryCov_9fa48("57790"), 'any_replica') : stryMutAct_9fa48("57791") ? "" : (stryCov_9fa48("57791"), 'leader_only');
      const groupId = stryMutAct_9fa48("57794") ? assignment?.groupId && null : stryMutAct_9fa48("57793") ? false : stryMutAct_9fa48("57792") ? true : (stryCov_9fa48("57792", "57793", "57794"), (stryMutAct_9fa48("57795") ? assignment.groupId : (stryCov_9fa48("57795"), assignment?.groupId)) || null);
      let replicaFallback = null;
      for (const service of services.values()) {
        if (stryMutAct_9fa48("57796")) {
          {}
        } else {
          stryCov_9fa48("57796");
          if (stryMutAct_9fa48("57799") ? false : stryMutAct_9fa48("57798") ? true : stryMutAct_9fa48("57797") ? service?.unifiedAddress : (stryCov_9fa48("57797", "57798", "57799"), !(stryMutAct_9fa48("57800") ? service.unifiedAddress : (stryCov_9fa48("57800"), service?.unifiedAddress)))) {
            if (stryMutAct_9fa48("57801")) {
              {}
            } else {
              stryCov_9fa48("57801");
              continue;
            }
          }
          if (stryMutAct_9fa48("57804") ? groupId && service.groupId || service.groupId !== groupId : stryMutAct_9fa48("57803") ? false : stryMutAct_9fa48("57802") ? true : (stryCov_9fa48("57802", "57803", "57804"), (stryMutAct_9fa48("57806") ? groupId || service.groupId : stryMutAct_9fa48("57805") ? true : (stryCov_9fa48("57805", "57806"), groupId && service.groupId)) && (stryMutAct_9fa48("57808") ? service.groupId === groupId : stryMutAct_9fa48("57807") ? true : (stryCov_9fa48("57807", "57808"), service.groupId !== groupId)))) {
            if (stryMutAct_9fa48("57809")) {
              {}
            } else {
              stryCov_9fa48("57809");
              continue;
            }
          }
          const isLeader = stryMutAct_9fa48("57812") ? typeof service.isLeaderReplica === TYPEOF.FUNCTION || service.isLeaderReplica() === true : stryMutAct_9fa48("57811") ? false : stryMutAct_9fa48("57810") ? true : (stryCov_9fa48("57810", "57811", "57812"), (stryMutAct_9fa48("57814") ? typeof service.isLeaderReplica !== TYPEOF.FUNCTION : stryMutAct_9fa48("57813") ? true : (stryCov_9fa48("57813", "57814"), typeof service.isLeaderReplica === TYPEOF.FUNCTION)) && (stryMutAct_9fa48("57816") ? service.isLeaderReplica() !== true : stryMutAct_9fa48("57815") ? true : (stryCov_9fa48("57815", "57816"), service.isLeaderReplica() === (stryMutAct_9fa48("57817") ? false : (stryCov_9fa48("57817"), true)))));
          const ingressReady = stryMutAct_9fa48("57820") ? typeof service.isMetadataIngressReady === TYPEOF.FUNCTION || service.isMetadataIngressReady({
            requiredTables
          }) : stryMutAct_9fa48("57819") ? false : stryMutAct_9fa48("57818") ? true : (stryCov_9fa48("57818", "57819", "57820"), (stryMutAct_9fa48("57822") ? typeof service.isMetadataIngressReady !== TYPEOF.FUNCTION : stryMutAct_9fa48("57821") ? true : (stryCov_9fa48("57821", "57822"), typeof service.isMetadataIngressReady === TYPEOF.FUNCTION)) && service.isMetadataIngressReady(stryMutAct_9fa48("57823") ? {} : (stryCov_9fa48("57823"), {
            requiredTables
          })));
          if (stryMutAct_9fa48("57825") ? false : stryMutAct_9fa48("57824") ? true : (stryCov_9fa48("57824", "57825"), isLeader)) {
            if (stryMutAct_9fa48("57826")) {
              {}
            } else {
              stryCov_9fa48("57826");
              if (stryMutAct_9fa48("57829") ? false : stryMutAct_9fa48("57828") ? true : stryMutAct_9fa48("57827") ? ingressReady : (stryCov_9fa48("57827", "57828", "57829"), !ingressReady)) {
                if (stryMutAct_9fa48("57830")) {
                  {}
                } else {
                  stryCov_9fa48("57830");
                  continue;
                }
              }
              return this.isTargetSuppressed(service.unifiedAddress) ? null : service.unifiedAddress;
            }
          }
          if (stryMutAct_9fa48("57833") ? localTargetMode === 'any_replica' && ingressReady && replicaFallback === null || !this.isTargetSuppressed(service.unifiedAddress) : stryMutAct_9fa48("57832") ? false : stryMutAct_9fa48("57831") ? true : (stryCov_9fa48("57831", "57832", "57833"), (stryMutAct_9fa48("57835") ? localTargetMode === 'any_replica' && ingressReady || replicaFallback === null : stryMutAct_9fa48("57834") ? true : (stryCov_9fa48("57834", "57835"), (stryMutAct_9fa48("57837") ? localTargetMode === 'any_replica' || ingressReady : stryMutAct_9fa48("57836") ? true : (stryCov_9fa48("57836", "57837"), (stryMutAct_9fa48("57839") ? localTargetMode !== 'any_replica' : stryMutAct_9fa48("57838") ? true : (stryCov_9fa48("57838", "57839"), localTargetMode === (stryMutAct_9fa48("57840") ? "" : (stryCov_9fa48("57840"), 'any_replica')))) && ingressReady)) && (stryMutAct_9fa48("57842") ? replicaFallback !== null : stryMutAct_9fa48("57841") ? true : (stryCov_9fa48("57841", "57842"), replicaFallback === null)))) && (stryMutAct_9fa48("57843") ? this.isTargetSuppressed(service.unifiedAddress) : (stryCov_9fa48("57843"), !this.isTargetSuppressed(service.unifiedAddress))))) {
            if (stryMutAct_9fa48("57844")) {
              {}
            } else {
              stryCov_9fa48("57844");
              replicaFallback = service.unifiedAddress;
            }
          }
        }
      }
      return replicaFallback;
    }
  }
  resolveBootstrapTargetAddresses(assignment = null, options = {}) {
    if (stryMutAct_9fa48("57845")) {
      {}
    } else {
      stryCov_9fa48("57845");
      if (stryMutAct_9fa48("57848") ? !assignment && typeof assignment !== TYPEOF.OBJECT : stryMutAct_9fa48("57847") ? false : stryMutAct_9fa48("57846") ? true : (stryCov_9fa48("57846", "57847", "57848"), (stryMutAct_9fa48("57849") ? assignment : (stryCov_9fa48("57849"), !assignment)) || (stryMutAct_9fa48("57851") ? typeof assignment === TYPEOF.OBJECT : stryMutAct_9fa48("57850") ? false : (stryCov_9fa48("57850", "57851"), typeof assignment !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("57852")) {
          {}
        } else {
          stryCov_9fa48("57852");
          return stryMutAct_9fa48("57853") ? ["Stryker was here"] : (stryCov_9fa48("57853"), []);
        }
      }
      const seedNodeId = stryMutAct_9fa48("57856") ? this.getBootstrapResponse()?.seedNodeId && this.getSeedNodeId() : stryMutAct_9fa48("57855") ? false : stryMutAct_9fa48("57854") ? true : (stryCov_9fa48("57854", "57855", "57856"), (stryMutAct_9fa48("57857") ? this.getBootstrapResponse().seedNodeId : (stryCov_9fa48("57857"), this.getBootstrapResponse()?.seedNodeId)) || this.getSeedNodeId());
      const replicaToMove = stryMutAct_9fa48("57860") ? assignment.replicaToMove && null : stryMutAct_9fa48("57859") ? false : stryMutAct_9fa48("57858") ? true : (stryCov_9fa48("57858", "57859", "57860"), assignment.replicaToMove || null);
      const hintCandidates = stryMutAct_9fa48("57861") ? [] : (stryCov_9fa48("57861"), [...(Array.isArray(assignment.peerAddresses) ? assignment.peerAddresses : stryMutAct_9fa48("57862") ? ["Stryker was here"] : (stryCov_9fa48("57862"), [])), ...(Array.isArray(assignment.replicaAddresses) ? assignment.replicaAddresses : stryMutAct_9fa48("57863") ? ["Stryker was here"] : (stryCov_9fa48("57863"), []))]);
      const seedTargets = stryMutAct_9fa48("57864") ? ["Stryker was here"] : (stryCov_9fa48("57864"), []);
      const remoteTargets = stryMutAct_9fa48("57865") ? ["Stryker was here"] : (stryCov_9fa48("57865"), []);
      const allowDisconnectedTargets = stryMutAct_9fa48("57868") ? options.allowDisconnectedTargets !== true : stryMutAct_9fa48("57867") ? false : stryMutAct_9fa48("57866") ? true : (stryCov_9fa48("57866", "57867", "57868"), options.allowDisconnectedTargets === (stryMutAct_9fa48("57869") ? false : (stryCov_9fa48("57869"), true)));
      for (const address of hintCandidates) {
        if (stryMutAct_9fa48("57870")) {
          {}
        } else {
          stryCov_9fa48("57870");
          const parsed = parseMessageGroupAddress(address);
          if (stryMutAct_9fa48("57873") ? false : stryMutAct_9fa48("57872") ? true : stryMutAct_9fa48("57871") ? parsed : (stryCov_9fa48("57871", "57872", "57873"), !parsed)) {
            if (stryMutAct_9fa48("57874")) {
              {}
            } else {
              stryCov_9fa48("57874");
              continue;
            }
          }
          if (stryMutAct_9fa48("57877") ? parsed.nodeId !== this.nodeId : stryMutAct_9fa48("57876") ? false : stryMutAct_9fa48("57875") ? true : (stryCov_9fa48("57875", "57876", "57877"), parsed.nodeId === this.nodeId)) {
            if (stryMutAct_9fa48("57878")) {
              {}
            } else {
              stryCov_9fa48("57878");
              continue;
            }
          }
          if (stryMutAct_9fa48("57880") ? false : stryMutAct_9fa48("57879") ? true : (stryCov_9fa48("57879", "57880"), this.isTargetSuppressed(address))) {
            if (stryMutAct_9fa48("57881")) {
              {}
            } else {
              stryCov_9fa48("57881");
              continue;
            }
          }
          if (stryMutAct_9fa48("57884") ? replicaToMove || parsed.replicaId === replicaToMove : stryMutAct_9fa48("57883") ? false : stryMutAct_9fa48("57882") ? true : (stryCov_9fa48("57882", "57883", "57884"), replicaToMove && (stryMutAct_9fa48("57886") ? parsed.replicaId !== replicaToMove : stryMutAct_9fa48("57885") ? true : (stryCov_9fa48("57885", "57886"), parsed.replicaId === replicaToMove)))) {
            if (stryMutAct_9fa48("57887")) {
              {}
            } else {
              stryCov_9fa48("57887");
              continue;
            }
          }
          const reachable = stryMutAct_9fa48("57890") ? allowDisconnectedTargets === true && this.isConnectedNode(parsed.nodeId) : stryMutAct_9fa48("57889") ? false : stryMutAct_9fa48("57888") ? true : (stryCov_9fa48("57888", "57889", "57890"), (stryMutAct_9fa48("57892") ? allowDisconnectedTargets !== true : stryMutAct_9fa48("57891") ? false : (stryCov_9fa48("57891", "57892"), allowDisconnectedTargets === (stryMutAct_9fa48("57893") ? false : (stryCov_9fa48("57893"), true)))) || this.isConnectedNode(parsed.nodeId));
          if (stryMutAct_9fa48("57896") ? seedNodeId || parsed.nodeId === seedNodeId : stryMutAct_9fa48("57895") ? false : stryMutAct_9fa48("57894") ? true : (stryCov_9fa48("57894", "57895", "57896"), seedNodeId && (stryMutAct_9fa48("57898") ? parsed.nodeId !== seedNodeId : stryMutAct_9fa48("57897") ? true : (stryCov_9fa48("57897", "57898"), parsed.nodeId === seedNodeId)))) {
            if (stryMutAct_9fa48("57899")) {
              {}
            } else {
              stryCov_9fa48("57899");
              if (stryMutAct_9fa48("57901") ? false : stryMutAct_9fa48("57900") ? true : (stryCov_9fa48("57900", "57901"), reachable)) {
                if (stryMutAct_9fa48("57902")) {
                  {}
                } else {
                  stryCov_9fa48("57902");
                  pushUniqueAddress(seedTargets, address);
                }
              }
              continue;
            }
          }
          if (stryMutAct_9fa48("57904") ? false : stryMutAct_9fa48("57903") ? true : (stryCov_9fa48("57903", "57904"), reachable)) {
            if (stryMutAct_9fa48("57905")) {
              {}
            } else {
              stryCov_9fa48("57905");
              pushUniqueAddress(remoteTargets, address);
            }
          }
        }
      }
      return stryMutAct_9fa48("57906") ? [] : (stryCov_9fa48("57906"), [...seedTargets, ...remoteTargets]);
    }
  }
  isConnectedNode(nodeId) {
    if (stryMutAct_9fa48("57907")) {
      {}
    } else {
      stryCov_9fa48("57907");
      if (stryMutAct_9fa48("57910") ? !nodeId && nodeId === this.nodeId : stryMutAct_9fa48("57909") ? false : stryMutAct_9fa48("57908") ? true : (stryCov_9fa48("57908", "57909", "57910"), (stryMutAct_9fa48("57911") ? nodeId : (stryCov_9fa48("57911"), !nodeId)) || (stryMutAct_9fa48("57913") ? nodeId !== this.nodeId : stryMutAct_9fa48("57912") ? false : (stryCov_9fa48("57912", "57913"), nodeId === this.nodeId)))) {
        if (stryMutAct_9fa48("57914")) {
          {}
        } else {
          stryCov_9fa48("57914");
          return stryMutAct_9fa48("57915") ? false : (stryCov_9fa48("57915"), true);
        }
      }
      const messageRouter = this.getMessageRouter();
      if (stryMutAct_9fa48("57918") ? !messageRouter && typeof messageRouter.getConnectionState !== TYPEOF.FUNCTION : stryMutAct_9fa48("57917") ? false : stryMutAct_9fa48("57916") ? true : (stryCov_9fa48("57916", "57917", "57918"), (stryMutAct_9fa48("57919") ? messageRouter : (stryCov_9fa48("57919"), !messageRouter)) || (stryMutAct_9fa48("57921") ? typeof messageRouter.getConnectionState === TYPEOF.FUNCTION : stryMutAct_9fa48("57920") ? false : (stryCov_9fa48("57920", "57921"), typeof messageRouter.getConnectionState !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("57922")) {
          {}
        } else {
          stryCov_9fa48("57922");
          return stryMutAct_9fa48("57923") ? false : (stryCov_9fa48("57923"), true);
        }
      }
      return stryMutAct_9fa48("57926") ? messageRouter.getConnectionState(nodeId) !== STATE.CONNECTED : stryMutAct_9fa48("57925") ? false : stryMutAct_9fa48("57924") ? true : (stryCov_9fa48("57924", "57925", "57926"), messageRouter.getConnectionState(nodeId) === STATE.CONNECTED);
    }
  }
  pruneExpiredState(nowMs = this.now()) {
    if (stryMutAct_9fa48("57927")) {
      {}
    } else {
      stryCov_9fa48("57927");
      for (const [targetAddress, expiresAt] of this.suppressedTargetAddresses) {
        if (stryMutAct_9fa48("57928")) {
          {}
        } else {
          stryCov_9fa48("57928");
          if (stryMutAct_9fa48("57931") ? !Number.isFinite(expiresAt) && expiresAt <= nowMs : stryMutAct_9fa48("57930") ? false : stryMutAct_9fa48("57929") ? true : (stryCov_9fa48("57929", "57930", "57931"), (stryMutAct_9fa48("57932") ? Number.isFinite(expiresAt) : (stryCov_9fa48("57932"), !Number.isFinite(expiresAt))) || (stryMutAct_9fa48("57935") ? expiresAt > nowMs : stryMutAct_9fa48("57934") ? expiresAt < nowMs : stryMutAct_9fa48("57933") ? false : (stryCov_9fa48("57933", "57934", "57935"), expiresAt <= nowMs)))) {
            if (stryMutAct_9fa48("57936")) {
              {}
            } else {
              stryCov_9fa48("57936");
              this.suppressedTargetAddresses.delete(targetAddress);
            }
          }
        }
      }
      if (stryMutAct_9fa48("57939") ? this.confirmedIngressLease || !Number.isFinite(this.confirmedIngressLease.expiresAt) || this.confirmedIngressLease.expiresAt <= nowMs : stryMutAct_9fa48("57938") ? false : stryMutAct_9fa48("57937") ? true : (stryCov_9fa48("57937", "57938", "57939"), this.confirmedIngressLease && (stryMutAct_9fa48("57941") ? !Number.isFinite(this.confirmedIngressLease.expiresAt) && this.confirmedIngressLease.expiresAt <= nowMs : stryMutAct_9fa48("57940") ? true : (stryCov_9fa48("57940", "57941"), (stryMutAct_9fa48("57942") ? Number.isFinite(this.confirmedIngressLease.expiresAt) : (stryCov_9fa48("57942"), !Number.isFinite(this.confirmedIngressLease.expiresAt))) || (stryMutAct_9fa48("57945") ? this.confirmedIngressLease.expiresAt > nowMs : stryMutAct_9fa48("57944") ? this.confirmedIngressLease.expiresAt < nowMs : stryMutAct_9fa48("57943") ? false : (stryCov_9fa48("57943", "57944", "57945"), this.confirmedIngressLease.expiresAt <= nowMs)))))) {
        if (stryMutAct_9fa48("57946")) {
          {}
        } else {
          stryCov_9fa48("57946");
          this.confirmedIngressLease = null;
        }
      }
    }
  }
  isTargetSuppressed(targetAddress) {
    if (stryMutAct_9fa48("57947")) {
      {}
    } else {
      stryCov_9fa48("57947");
      if (stryMutAct_9fa48("57950") ? typeof targetAddress !== TYPEOF.STRING && targetAddress.length === NUM.ZERO : stryMutAct_9fa48("57949") ? false : stryMutAct_9fa48("57948") ? true : (stryCov_9fa48("57948", "57949", "57950"), (stryMutAct_9fa48("57952") ? typeof targetAddress === TYPEOF.STRING : stryMutAct_9fa48("57951") ? false : (stryCov_9fa48("57951", "57952"), typeof targetAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("57954") ? targetAddress.length !== NUM.ZERO : stryMutAct_9fa48("57953") ? false : (stryCov_9fa48("57953", "57954"), targetAddress.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("57955")) {
          {}
        } else {
          stryCov_9fa48("57955");
          return stryMutAct_9fa48("57956") ? true : (stryCov_9fa48("57956"), false);
        }
      }
      this.pruneExpiredState();
      const suppressedUntil = this.suppressedTargetAddresses.get(targetAddress);
      return stryMutAct_9fa48("57959") ? Number.isFinite(suppressedUntil) || suppressedUntil > this.now() : stryMutAct_9fa48("57958") ? false : stryMutAct_9fa48("57957") ? true : (stryCov_9fa48("57957", "57958", "57959"), Number.isFinite(suppressedUntil) && (stryMutAct_9fa48("57962") ? suppressedUntil <= this.now() : stryMutAct_9fa48("57961") ? suppressedUntil >= this.now() : stryMutAct_9fa48("57960") ? true : (stryCov_9fa48("57960", "57961", "57962"), suppressedUntil > this.now())));
    }
  }
  isTargetReachable(targetAddress, options = {}) {
    if (stryMutAct_9fa48("57963")) {
      {}
    } else {
      stryCov_9fa48("57963");
      const parsed = parseMessageGroupAddress(targetAddress);
      if (stryMutAct_9fa48("57966") ? false : stryMutAct_9fa48("57965") ? true : stryMutAct_9fa48("57964") ? parsed : (stryCov_9fa48("57964", "57965", "57966"), !parsed)) {
        if (stryMutAct_9fa48("57967")) {
          {}
        } else {
          stryCov_9fa48("57967");
          return stryMutAct_9fa48("57968") ? true : (stryCov_9fa48("57968"), false);
        }
      }
      if (stryMutAct_9fa48("57970") ? false : stryMutAct_9fa48("57969") ? true : (stryCov_9fa48("57969", "57970"), this.isTargetSuppressed(targetAddress))) {
        if (stryMutAct_9fa48("57971")) {
          {}
        } else {
          stryCov_9fa48("57971");
          return stryMutAct_9fa48("57972") ? true : (stryCov_9fa48("57972"), false);
        }
      }
      if (stryMutAct_9fa48("57975") ? options.allowDisconnectedTargets !== true : stryMutAct_9fa48("57974") ? false : stryMutAct_9fa48("57973") ? true : (stryCov_9fa48("57973", "57974", "57975"), options.allowDisconnectedTargets === (stryMutAct_9fa48("57976") ? false : (stryCov_9fa48("57976"), true)))) {
        if (stryMutAct_9fa48("57977")) {
          {}
        } else {
          stryCov_9fa48("57977");
          return stryMutAct_9fa48("57978") ? false : (stryCov_9fa48("57978"), true);
        }
      }
      return this.isConnectedNode(parsed.nodeId);
    }
  }
}
export { ControlPlaneKernelIngress, parseMessageGroupAddress };
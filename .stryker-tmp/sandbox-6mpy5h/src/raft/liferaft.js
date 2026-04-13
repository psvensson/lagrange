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
import BaseLifeRaft from '@markwylde/liferaft';
const RAFT_EVENT = Object.freeze(stryMutAct_9fa48("127452") ? {} : (stryCov_9fa48("127452"), {
  DATA: stryMutAct_9fa48("127453") ? "" : (stryCov_9fa48("127453"), 'data')
}));
const RAFT_PACKET_TYPE = Object.freeze(stryMutAct_9fa48("127454") ? {} : (stryCov_9fa48("127454"), {
  APPEND: stryMutAct_9fa48("127455") ? "" : (stryCov_9fa48("127455"), 'append'),
  APPEND_ACK: stryMutAct_9fa48("127456") ? "" : (stryCov_9fa48("127456"), 'append ack'),
  APPEND_FAIL: stryMutAct_9fa48("127457") ? "" : (stryCov_9fa48("127457"), 'append fail')
}));
function hasFiniteNumber(value) {
  if (stryMutAct_9fa48("127458")) {
    {}
  } else {
    stryCov_9fa48("127458");
    return stryMutAct_9fa48("127461") ? typeof value === 'number' || Number.isFinite(value) : stryMutAct_9fa48("127460") ? false : stryMutAct_9fa48("127459") ? true : (stryCov_9fa48("127459", "127460", "127461"), (stryMutAct_9fa48("127463") ? typeof value !== 'number' : stryMutAct_9fa48("127462") ? true : (stryCov_9fa48("127462", "127463"), typeof value === (stryMutAct_9fa48("127464") ? "" : (stryCov_9fa48("127464"), 'number')))) && Number.isFinite(value));
  }
}
function isRecoverableAppendEntry(entry) {
  if (stryMutAct_9fa48("127465")) {
    {}
  } else {
    stryCov_9fa48("127465");
    return stryMutAct_9fa48("127468") ? !!entry && typeof entry === 'object' && hasFiniteNumber(entry.index) && hasFiniteNumber(entry.term) || Object.prototype.hasOwnProperty.call(entry, 'command') : stryMutAct_9fa48("127467") ? false : stryMutAct_9fa48("127466") ? true : (stryCov_9fa48("127466", "127467", "127468"), (stryMutAct_9fa48("127470") ? !!entry && typeof entry === 'object' && hasFiniteNumber(entry.index) || hasFiniteNumber(entry.term) : stryMutAct_9fa48("127469") ? true : (stryCov_9fa48("127469", "127470"), (stryMutAct_9fa48("127472") ? !!entry && typeof entry === 'object' || hasFiniteNumber(entry.index) : stryMutAct_9fa48("127471") ? true : (stryCov_9fa48("127471", "127472"), (stryMutAct_9fa48("127474") ? !!entry || typeof entry === 'object' : stryMutAct_9fa48("127473") ? true : (stryCov_9fa48("127473", "127474"), (stryMutAct_9fa48("127475") ? !entry : (stryCov_9fa48("127475"), !(stryMutAct_9fa48("127476") ? entry : (stryCov_9fa48("127476"), !entry)))) && (stryMutAct_9fa48("127478") ? typeof entry !== 'object' : stryMutAct_9fa48("127477") ? true : (stryCov_9fa48("127477", "127478"), typeof entry === (stryMutAct_9fa48("127479") ? "" : (stryCov_9fa48("127479"), 'object')))))) && hasFiniteNumber(entry.index))) && hasFiniteNumber(entry.term))) && Object.prototype.hasOwnProperty.call(entry, stryMutAct_9fa48("127480") ? "" : (stryCov_9fa48("127480"), 'command')));
  }
}
function getCommittedIndex(raft) {
  if (stryMutAct_9fa48("127481")) {
    {}
  } else {
    stryCov_9fa48("127481");
    return hasFiniteNumber(stryMutAct_9fa48("127483") ? raft.log?.committedIndex : stryMutAct_9fa48("127482") ? raft?.log.committedIndex : (stryCov_9fa48("127482", "127483"), raft?.log?.committedIndex)) ? raft.log.committedIndex : NUMERIC_ZERO;
  }
}
const NUMERIC_ZERO = 0;
function patchIncomingDataListener(raft) {
  if (stryMutAct_9fa48("127484")) {
    {}
  } else {
    stryCov_9fa48("127484");
    const listeners = raft.listeners(RAFT_EVENT.DATA);
    const originalListener = Array.isArray(listeners) ? listeners[0] : null;
    if (stryMutAct_9fa48("127487") ? typeof originalListener !== 'function' && originalListener.__lagrangePatched === true : stryMutAct_9fa48("127486") ? false : stryMutAct_9fa48("127485") ? true : (stryCov_9fa48("127485", "127486", "127487"), (stryMutAct_9fa48("127489") ? typeof originalListener === 'function' : stryMutAct_9fa48("127488") ? false : (stryCov_9fa48("127488", "127489"), typeof originalListener !== (stryMutAct_9fa48("127490") ? "" : (stryCov_9fa48("127490"), 'function')))) || (stryMutAct_9fa48("127492") ? originalListener.__lagrangePatched !== true : stryMutAct_9fa48("127491") ? false : (stryCov_9fa48("127491", "127492"), originalListener.__lagrangePatched === (stryMutAct_9fa48("127493") ? false : (stryCov_9fa48("127493"), true)))))) {
      if (stryMutAct_9fa48("127494")) {
        {}
      } else {
        stryCov_9fa48("127494");
        return;
      }
    }
    raft.removeListener(RAFT_EVENT.DATA, originalListener);
    const patchedListener = async (packet, write = () => {}) => {
      if (stryMutAct_9fa48("127495")) {
        {}
      } else {
        stryCov_9fa48("127495");
        const committedIndexBefore = getCommittedIndex(raft);
        if (stryMutAct_9fa48("127498") ? packet?.type !== RAFT_PACKET_TYPE.APPEND_FAIL : stryMutAct_9fa48("127497") ? false : stryMutAct_9fa48("127496") ? true : (stryCov_9fa48("127496", "127497", "127498"), (stryMutAct_9fa48("127499") ? packet.type : (stryCov_9fa48("127499"), packet?.type)) === RAFT_PACKET_TYPE.APPEND_FAIL)) {
          if (stryMutAct_9fa48("127500")) {
            {}
          } else {
            stryCov_9fa48("127500");
            const recoveredEntry = await (stryMutAct_9fa48("127502") ? raft.log.get?.(packet?.data?.index) : stryMutAct_9fa48("127501") ? raft.log?.get(packet?.data?.index) : (stryCov_9fa48("127501", "127502"), raft.log?.get?.(stryMutAct_9fa48("127504") ? packet.data?.index : stryMutAct_9fa48("127503") ? packet?.data.index : (stryCov_9fa48("127503", "127504"), packet?.data?.index))));
            if (stryMutAct_9fa48("127507") ? false : stryMutAct_9fa48("127506") ? true : stryMutAct_9fa48("127505") ? isRecoverableAppendEntry(recoveredEntry) : (stryCov_9fa48("127505", "127506", "127507"), !isRecoverableAppendEntry(recoveredEntry))) {
              if (stryMutAct_9fa48("127508")) {
                {}
              } else {
                stryCov_9fa48("127508");
                return write();
              }
            }
          }
        }
        if (stryMutAct_9fa48("127511") ? packet?.type !== RAFT_PACKET_TYPE.APPEND : stryMutAct_9fa48("127510") ? false : stryMutAct_9fa48("127509") ? true : (stryCov_9fa48("127509", "127510", "127511"), (stryMutAct_9fa48("127512") ? packet.type : (stryCov_9fa48("127512"), packet?.type)) === RAFT_PACKET_TYPE.APPEND)) {
          if (stryMutAct_9fa48("127513")) {
            {}
          } else {
            stryCov_9fa48("127513");
            const hasEntries = stryMutAct_9fa48("127516") ? Array.isArray(packet?.data) || packet.data.length > 0 : stryMutAct_9fa48("127515") ? false : stryMutAct_9fa48("127514") ? true : (stryCov_9fa48("127514", "127515", "127516"), Array.isArray(stryMutAct_9fa48("127517") ? packet.data : (stryCov_9fa48("127517"), packet?.data)) && (stryMutAct_9fa48("127520") ? packet.data.length <= 0 : stryMutAct_9fa48("127519") ? packet.data.length >= 0 : stryMutAct_9fa48("127518") ? true : (stryCov_9fa48("127518", "127519", "127520"), packet.data.length > 0)));
            const entry = hasEntries ? packet.data[0] : null;
            if (stryMutAct_9fa48("127523") ? hasEntries || !isRecoverableAppendEntry(entry) : stryMutAct_9fa48("127522") ? false : stryMutAct_9fa48("127521") ? true : (stryCov_9fa48("127521", "127522", "127523"), hasEntries && (stryMutAct_9fa48("127524") ? isRecoverableAppendEntry(entry) : (stryCov_9fa48("127524"), !isRecoverableAppendEntry(entry))))) {
              if (stryMutAct_9fa48("127525")) {
                {}
              } else {
                stryCov_9fa48("127525");
                return write();
              }
            }
          }
        }
        const result = await originalListener(packet, write);
        const committedIndexAfter = getCommittedIndex(raft);
        if (stryMutAct_9fa48("127528") ? packet?.type === RAFT_PACKET_TYPE.APPEND_ACK && raft.state === BaseLifeRaft.LEADER || committedIndexAfter > committedIndexBefore : stryMutAct_9fa48("127527") ? false : stryMutAct_9fa48("127526") ? true : (stryCov_9fa48("127526", "127527", "127528"), (stryMutAct_9fa48("127530") ? packet?.type === RAFT_PACKET_TYPE.APPEND_ACK || raft.state === BaseLifeRaft.LEADER : stryMutAct_9fa48("127529") ? true : (stryCov_9fa48("127529", "127530"), (stryMutAct_9fa48("127532") ? packet?.type !== RAFT_PACKET_TYPE.APPEND_ACK : stryMutAct_9fa48("127531") ? true : (stryCov_9fa48("127531", "127532"), (stryMutAct_9fa48("127533") ? packet.type : (stryCov_9fa48("127533"), packet?.type)) === RAFT_PACKET_TYPE.APPEND_ACK)) && (stryMutAct_9fa48("127535") ? raft.state !== BaseLifeRaft.LEADER : stryMutAct_9fa48("127534") ? true : (stryCov_9fa48("127534", "127535"), raft.state === BaseLifeRaft.LEADER)))) && (stryMutAct_9fa48("127538") ? committedIndexAfter <= committedIndexBefore : stryMutAct_9fa48("127537") ? committedIndexAfter >= committedIndexBefore : stryMutAct_9fa48("127536") ? true : (stryCov_9fa48("127536", "127537", "127538"), committedIndexAfter > committedIndexBefore)))) {
          if (stryMutAct_9fa48("127539")) {
            {}
          } else {
            stryCov_9fa48("127539");
            const heartbeatPacket = await raft.packet(RAFT_PACKET_TYPE.APPEND);
            raft.message(BaseLifeRaft.FOLLOWER, heartbeatPacket);
          }
        }
        return result;
      }
    };
    patchedListener.__lagrangePatched = stryMutAct_9fa48("127540") ? false : (stryCov_9fa48("127540"), true);
    raft.on(RAFT_EVENT.DATA, patchedListener);
  }
}
class LifeRaft extends BaseLifeRaft {
  constructor(address, options = {}) {
    if (stryMutAct_9fa48("127541")) {
      {}
    } else {
      stryCov_9fa48("127541");
      super(address, options);
      patchIncomingDataListener(this);
    }
  }
}
export default LifeRaft;
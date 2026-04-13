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
import { COLUMN, NUM, SERVICE_STATUS, SERVICE_TYPE, STATE, TABLES, TYPEOF } from '../constants/index.js';
import { RAFT_ROLE } from '../raft/constants.js';
function filterRows(cache, tableName, predicate) {
  if (stryMutAct_9fa48("89252")) {
    {}
  } else {
    stryCov_9fa48("89252");
    if (stryMutAct_9fa48("89255") ? false : stryMutAct_9fa48("89254") ? true : stryMutAct_9fa48("89253") ? cache : (stryCov_9fa48("89253", "89254", "89255"), !cache)) {
      if (stryMutAct_9fa48("89256")) {
        {}
      } else {
        stryCov_9fa48("89256");
        return stryMutAct_9fa48("89257") ? ["Stryker was here"] : (stryCov_9fa48("89257"), []);
      }
    }
    if (stryMutAct_9fa48("89260") ? typeof cache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("89259") ? false : stryMutAct_9fa48("89258") ? true : (stryCov_9fa48("89258", "89259", "89260"), typeof cache.filter === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("89261")) {
        {}
      } else {
        stryCov_9fa48("89261");
        return stryMutAct_9fa48("89264") ? cache.filter(tableName, predicate) && [] : stryMutAct_9fa48("89263") ? false : stryMutAct_9fa48("89262") ? true : (stryCov_9fa48("89262", "89263", "89264"), (stryMutAct_9fa48("89265") ? cache : (stryCov_9fa48("89265"), cache.filter(tableName, predicate))) || (stryMutAct_9fa48("89266") ? ["Stryker was here"] : (stryCov_9fa48("89266"), [])));
      }
    }
    if (stryMutAct_9fa48("89269") ? typeof cache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("89268") ? false : stryMutAct_9fa48("89267") ? true : (stryCov_9fa48("89267", "89268", "89269"), typeof cache.getAll === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("89270")) {
        {}
      } else {
        stryCov_9fa48("89270");
        return stryMutAct_9fa48("89271") ? cache.getAll(tableName) || [] : (stryCov_9fa48("89271"), (stryMutAct_9fa48("89274") ? cache.getAll(tableName) && [] : stryMutAct_9fa48("89273") ? false : stryMutAct_9fa48("89272") ? true : (stryCov_9fa48("89272", "89273", "89274"), cache.getAll(tableName) || (stryMutAct_9fa48("89275") ? ["Stryker was here"] : (stryCov_9fa48("89275"), [])))).filter(predicate));
      }
    }
    return stryMutAct_9fa48("89276") ? ["Stryker was here"] : (stryCov_9fa48("89276"), []);
  }
}
function findRow(cache, tableName, predicate) {
  if (stryMutAct_9fa48("89277")) {
    {}
  } else {
    stryCov_9fa48("89277");
    return stryMutAct_9fa48("89280") ? filterRows(cache, tableName, predicate)[NUM.ZERO] && null : stryMutAct_9fa48("89279") ? false : stryMutAct_9fa48("89278") ? true : (stryCov_9fa48("89278", "89279", "89280"), filterRows(cache, tableName, predicate)[NUM.ZERO] || null);
  }
}
function hasNodeReadinessRows(cache) {
  if (stryMutAct_9fa48("89281")) {
    {}
  } else {
    stryCov_9fa48("89281");
    if (stryMutAct_9fa48("89284") ? false : stryMutAct_9fa48("89283") ? true : stryMutAct_9fa48("89282") ? cache : (stryCov_9fa48("89282", "89283", "89284"), !cache)) {
      if (stryMutAct_9fa48("89285")) {
        {}
      } else {
        stryCov_9fa48("89285");
        return stryMutAct_9fa48("89286") ? true : (stryCov_9fa48("89286"), false);
      }
    }
    if (stryMutAct_9fa48("89289") ? typeof cache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("89288") ? false : stryMutAct_9fa48("89287") ? true : (stryCov_9fa48("89287", "89288", "89289"), typeof cache.getAll === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("89290")) {
        {}
      } else {
        stryCov_9fa48("89290");
        return stryMutAct_9fa48("89294") ? (cache.getAll(TABLES.NODES) || []).length <= NUM.ZERO : stryMutAct_9fa48("89293") ? (cache.getAll(TABLES.NODES) || []).length >= NUM.ZERO : stryMutAct_9fa48("89292") ? false : stryMutAct_9fa48("89291") ? true : (stryCov_9fa48("89291", "89292", "89293", "89294"), (stryMutAct_9fa48("89297") ? cache.getAll(TABLES.NODES) && [] : stryMutAct_9fa48("89296") ? false : stryMutAct_9fa48("89295") ? true : (stryCov_9fa48("89295", "89296", "89297"), cache.getAll(TABLES.NODES) || (stryMutAct_9fa48("89298") ? ["Stryker was here"] : (stryCov_9fa48("89298"), [])))).length > NUM.ZERO);
      }
    }
    if (stryMutAct_9fa48("89301") ? typeof cache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("89300") ? false : stryMutAct_9fa48("89299") ? true : (stryCov_9fa48("89299", "89300", "89301"), typeof cache.filter === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("89302")) {
        {}
      } else {
        stryCov_9fa48("89302");
        return stryMutAct_9fa48("89306") ? (cache.filter(TABLES.NODES, () => true) || []).length <= NUM.ZERO : stryMutAct_9fa48("89305") ? (cache.filter(TABLES.NODES, () => true) || []).length >= NUM.ZERO : stryMutAct_9fa48("89304") ? false : stryMutAct_9fa48("89303") ? true : (stryCov_9fa48("89303", "89304", "89305", "89306"), (stryMutAct_9fa48("89309") ? cache.filter(TABLES.NODES, () => true) && [] : stryMutAct_9fa48("89308") ? false : stryMutAct_9fa48("89307") ? true : (stryCov_9fa48("89307", "89308", "89309"), (stryMutAct_9fa48("89310") ? cache : (stryCov_9fa48("89310"), cache.filter(TABLES.NODES, stryMutAct_9fa48("89311") ? () => undefined : (stryCov_9fa48("89311"), () => stryMutAct_9fa48("89312") ? false : (stryCov_9fa48("89312"), true))))) || (stryMutAct_9fa48("89313") ? ["Stryker was here"] : (stryCov_9fa48("89313"), [])))).length > NUM.ZERO);
      }
    }
    return stryMutAct_9fa48("89314") ? true : (stryCov_9fa48("89314"), false);
  }
}
function isReadyNode(cache, nodeId) {
  if (stryMutAct_9fa48("89315")) {
    {}
  } else {
    stryCov_9fa48("89315");
    if (stryMutAct_9fa48("89318") ? typeof nodeId !== TYPEOF.STRING && nodeId.length === NUM.ZERO : stryMutAct_9fa48("89317") ? false : stryMutAct_9fa48("89316") ? true : (stryCov_9fa48("89316", "89317", "89318"), (stryMutAct_9fa48("89320") ? typeof nodeId === TYPEOF.STRING : stryMutAct_9fa48("89319") ? false : (stryCov_9fa48("89319", "89320"), typeof nodeId !== TYPEOF.STRING)) || (stryMutAct_9fa48("89322") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("89321") ? false : (stryCov_9fa48("89321", "89322"), nodeId.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("89323")) {
        {}
      } else {
        stryCov_9fa48("89323");
        return stryMutAct_9fa48("89324") ? true : (stryCov_9fa48("89324"), false);
      }
    }
    if (stryMutAct_9fa48("89327") ? false : stryMutAct_9fa48("89326") ? true : stryMutAct_9fa48("89325") ? hasNodeReadinessRows(cache) : (stryCov_9fa48("89325", "89326", "89327"), !hasNodeReadinessRows(cache))) {
      if (stryMutAct_9fa48("89328")) {
        {}
      } else {
        stryCov_9fa48("89328");
        return stryMutAct_9fa48("89329") ? false : (stryCov_9fa48("89329"), true);
      }
    }
    if (stryMutAct_9fa48("89332") ? typeof cache?.getReadyNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("89331") ? false : stryMutAct_9fa48("89330") ? true : (stryCov_9fa48("89330", "89331", "89332"), typeof (stryMutAct_9fa48("89333") ? cache.getReadyNodes : (stryCov_9fa48("89333"), cache?.getReadyNodes)) === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("89334")) {
        {}
      } else {
        stryCov_9fa48("89334");
        const readyNodes = cache.getReadyNodes();
        if (stryMutAct_9fa48("89336") ? false : stryMutAct_9fa48("89335") ? true : (stryCov_9fa48("89335", "89336"), Array.isArray(readyNodes))) {
          if (stryMutAct_9fa48("89337")) {
            {}
          } else {
            stryCov_9fa48("89337");
            return readyNodes.includes(nodeId);
          }
        }
      }
    }
    const nodeRow = findRow(cache, TABLES.NODES, row => {
      if (stryMutAct_9fa48("89338")) {
        {}
      } else {
        stryCov_9fa48("89338");
        return stryMutAct_9fa48("89341") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("89340") ? false : stryMutAct_9fa48("89339") ? true : (stryCov_9fa48("89339", "89340", "89341"), (stryMutAct_9fa48("89342") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("89342"), row?.[COLUMN.NODE_ID])) === nodeId);
      }
    });
    if (stryMutAct_9fa48("89345") ? false : stryMutAct_9fa48("89344") ? true : stryMutAct_9fa48("89343") ? nodeRow : (stryCov_9fa48("89343", "89344", "89345"), !nodeRow)) {
      if (stryMutAct_9fa48("89346")) {
        {}
      } else {
        stryCov_9fa48("89346");
        return stryMutAct_9fa48("89347") ? true : (stryCov_9fa48("89347"), false);
      }
    }
    const readyLeaseExpiresAt = Number(stryMutAct_9fa48("89348") ? nodeRow[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("89348"), nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]));
    return stryMutAct_9fa48("89351") ? nodeRow?.[COLUMN.CONNECTION_STATE] === STATE.READY && Number.isFinite(readyLeaseExpiresAt) || readyLeaseExpiresAt > Date.now() : stryMutAct_9fa48("89350") ? false : stryMutAct_9fa48("89349") ? true : (stryCov_9fa48("89349", "89350", "89351"), (stryMutAct_9fa48("89353") ? nodeRow?.[COLUMN.CONNECTION_STATE] === STATE.READY || Number.isFinite(readyLeaseExpiresAt) : stryMutAct_9fa48("89352") ? true : (stryCov_9fa48("89352", "89353"), (stryMutAct_9fa48("89355") ? nodeRow?.[COLUMN.CONNECTION_STATE] !== STATE.READY : stryMutAct_9fa48("89354") ? true : (stryCov_9fa48("89354", "89355"), (stryMutAct_9fa48("89356") ? nodeRow[COLUMN.CONNECTION_STATE] : (stryCov_9fa48("89356"), nodeRow?.[COLUMN.CONNECTION_STATE])) === STATE.READY)) && Number.isFinite(readyLeaseExpiresAt))) && (stryMutAct_9fa48("89359") ? readyLeaseExpiresAt <= Date.now() : stryMutAct_9fa48("89358") ? readyLeaseExpiresAt >= Date.now() : stryMutAct_9fa48("89357") ? true : (stryCov_9fa48("89357", "89358", "89359"), readyLeaseExpiresAt > Date.now())));
  }
}
function getMessageGroupServiceCandidates(cache, groupId, options = {}) {
  if (stryMutAct_9fa48("89360")) {
    {}
  } else {
    stryCov_9fa48("89360");
    const requireReadyNode = stryMutAct_9fa48("89363") ? options.requireReadyNode === false : stryMutAct_9fa48("89362") ? false : stryMutAct_9fa48("89361") ? true : (stryCov_9fa48("89361", "89362", "89363"), options.requireReadyNode !== (stryMutAct_9fa48("89364") ? true : (stryCov_9fa48("89364"), false)));
    const allowStoppedService = stryMutAct_9fa48("89367") ? options.allowStoppedService !== true : stryMutAct_9fa48("89366") ? false : stryMutAct_9fa48("89365") ? true : (stryCov_9fa48("89365", "89366", "89367"), options.allowStoppedService === (stryMutAct_9fa48("89368") ? false : (stryCov_9fa48("89368"), true)));
    return filterRows(cache, TABLES.SERVICES, row => {
      if (stryMutAct_9fa48("89369")) {
        {}
      } else {
        stryCov_9fa48("89369");
        const status = stryMutAct_9fa48("89370") ? row[COLUMN.STATUS] : (stryCov_9fa48("89370"), row?.[COLUMN.STATUS]);
        const hasEligibleStatus = stryMutAct_9fa48("89373") ? status === SERVICE_STATUS.ACTIVE && allowStoppedService && status === SERVICE_STATUS.STOPPED : stryMutAct_9fa48("89372") ? false : stryMutAct_9fa48("89371") ? true : (stryCov_9fa48("89371", "89372", "89373"), (stryMutAct_9fa48("89375") ? status !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("89374") ? false : (stryCov_9fa48("89374", "89375"), status === SERVICE_STATUS.ACTIVE)) || (stryMutAct_9fa48("89377") ? allowStoppedService || status === SERVICE_STATUS.STOPPED : stryMutAct_9fa48("89376") ? false : (stryCov_9fa48("89376", "89377"), allowStoppedService && (stryMutAct_9fa48("89379") ? status !== SERVICE_STATUS.STOPPED : stryMutAct_9fa48("89378") ? true : (stryCov_9fa48("89378", "89379"), status === SERVICE_STATUS.STOPPED)))));
        return stryMutAct_9fa48("89382") ? row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP && row?.[COLUMN.GROUP_ID] === groupId && hasEligibleStatus && (!requireReadyNode || isReadyNode(cache, row?.[COLUMN.NODE_ID])) && typeof row?.[COLUMN.ADDRESS] === TYPEOF.STRING || row[COLUMN.ADDRESS].length > NUM.ZERO : stryMutAct_9fa48("89381") ? false : stryMutAct_9fa48("89380") ? true : (stryCov_9fa48("89380", "89381", "89382"), (stryMutAct_9fa48("89384") ? row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP && row?.[COLUMN.GROUP_ID] === groupId && hasEligibleStatus && (!requireReadyNode || isReadyNode(cache, row?.[COLUMN.NODE_ID])) || typeof row?.[COLUMN.ADDRESS] === TYPEOF.STRING : stryMutAct_9fa48("89383") ? true : (stryCov_9fa48("89383", "89384"), (stryMutAct_9fa48("89386") ? row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP && row?.[COLUMN.GROUP_ID] === groupId && hasEligibleStatus || !requireReadyNode || isReadyNode(cache, row?.[COLUMN.NODE_ID]) : stryMutAct_9fa48("89385") ? true : (stryCov_9fa48("89385", "89386"), (stryMutAct_9fa48("89388") ? row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP && row?.[COLUMN.GROUP_ID] === groupId || hasEligibleStatus : stryMutAct_9fa48("89387") ? true : (stryCov_9fa48("89387", "89388"), (stryMutAct_9fa48("89390") ? row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP || row?.[COLUMN.GROUP_ID] === groupId : stryMutAct_9fa48("89389") ? true : (stryCov_9fa48("89389", "89390"), (stryMutAct_9fa48("89392") ? row?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("89391") ? true : (stryCov_9fa48("89391", "89392"), (stryMutAct_9fa48("89393") ? row[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("89393"), row?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.MESSAGE_GROUP)) && (stryMutAct_9fa48("89395") ? row?.[COLUMN.GROUP_ID] !== groupId : stryMutAct_9fa48("89394") ? true : (stryCov_9fa48("89394", "89395"), (stryMutAct_9fa48("89396") ? row[COLUMN.GROUP_ID] : (stryCov_9fa48("89396"), row?.[COLUMN.GROUP_ID])) === groupId)))) && hasEligibleStatus)) && (stryMutAct_9fa48("89398") ? !requireReadyNode && isReadyNode(cache, row?.[COLUMN.NODE_ID]) : stryMutAct_9fa48("89397") ? true : (stryCov_9fa48("89397", "89398"), (stryMutAct_9fa48("89399") ? requireReadyNode : (stryCov_9fa48("89399"), !requireReadyNode)) || isReadyNode(cache, stryMutAct_9fa48("89400") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("89400"), row?.[COLUMN.NODE_ID])))))) && (stryMutAct_9fa48("89402") ? typeof row?.[COLUMN.ADDRESS] !== TYPEOF.STRING : stryMutAct_9fa48("89401") ? true : (stryCov_9fa48("89401", "89402"), typeof (stryMutAct_9fa48("89403") ? row[COLUMN.ADDRESS] : (stryCov_9fa48("89403"), row?.[COLUMN.ADDRESS])) === TYPEOF.STRING)))) && (stryMutAct_9fa48("89406") ? row[COLUMN.ADDRESS].length <= NUM.ZERO : stryMutAct_9fa48("89405") ? row[COLUMN.ADDRESS].length >= NUM.ZERO : stryMutAct_9fa48("89404") ? true : (stryCov_9fa48("89404", "89405", "89406"), row[COLUMN.ADDRESS].length > NUM.ZERO)));
      }
    });
  }
}
function preferConnectedCandidates(candidates, options = {}) {
  if (stryMutAct_9fa48("89407")) {
    {}
  } else {
    stryCov_9fa48("89407");
    if (stryMutAct_9fa48("89410") ? options.preferConnectedCandidates !== false : stryMutAct_9fa48("89409") ? false : stryMutAct_9fa48("89408") ? true : (stryCov_9fa48("89408", "89409", "89410"), options.preferConnectedCandidates === (stryMutAct_9fa48("89411") ? true : (stryCov_9fa48("89411"), false)))) {
      if (stryMutAct_9fa48("89412")) {
        {}
      } else {
        stryCov_9fa48("89412");
        return candidates;
      }
    }
    const isConnectedNode = (stryMutAct_9fa48("89415") ? typeof options.isConnectedNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("89414") ? false : stryMutAct_9fa48("89413") ? true : (stryCov_9fa48("89413", "89414", "89415"), typeof options.isConnectedNode === TYPEOF.FUNCTION)) ? options.isConnectedNode : null;
    if (stryMutAct_9fa48("89418") ? false : stryMutAct_9fa48("89417") ? true : stryMutAct_9fa48("89416") ? isConnectedNode : (stryCov_9fa48("89416", "89417", "89418"), !isConnectedNode)) {
      if (stryMutAct_9fa48("89419")) {
        {}
      } else {
        stryCov_9fa48("89419");
        return candidates;
      }
    }
    const connectedCandidates = stryMutAct_9fa48("89420") ? candidates : (stryCov_9fa48("89420"), candidates.filter(row => {
      if (stryMutAct_9fa48("89421")) {
        {}
      } else {
        stryCov_9fa48("89421");
        return stryMutAct_9fa48("89424") ? isConnectedNode(row?.[COLUMN.NODE_ID]) !== true : stryMutAct_9fa48("89423") ? false : stryMutAct_9fa48("89422") ? true : (stryCov_9fa48("89422", "89423", "89424"), isConnectedNode(stryMutAct_9fa48("89425") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("89425"), row?.[COLUMN.NODE_ID])) === (stryMutAct_9fa48("89426") ? false : (stryCov_9fa48("89426"), true)));
      }
    }));
    return (stryMutAct_9fa48("89430") ? connectedCandidates.length <= NUM.ZERO : stryMutAct_9fa48("89429") ? connectedCandidates.length >= NUM.ZERO : stryMutAct_9fa48("89428") ? false : stryMutAct_9fa48("89427") ? true : (stryCov_9fa48("89427", "89428", "89429", "89430"), connectedCandidates.length > NUM.ZERO)) ? connectedCandidates : candidates;
  }
}
function isExcludedCandidate(row, options = {}) {
  if (stryMutAct_9fa48("89431")) {
    {}
  } else {
    stryCov_9fa48("89431");
    const excludeServiceId = stryMutAct_9fa48("89434") ? options.excludeServiceId && null : stryMutAct_9fa48("89433") ? false : stryMutAct_9fa48("89432") ? true : (stryCov_9fa48("89432", "89433", "89434"), options.excludeServiceId || null);
    const excludeNodeId = stryMutAct_9fa48("89437") ? options.excludeNodeId && null : stryMutAct_9fa48("89436") ? false : stryMutAct_9fa48("89435") ? true : (stryCov_9fa48("89435", "89436", "89437"), options.excludeNodeId || null);
    return Boolean(stryMutAct_9fa48("89440") ? excludeServiceId && row?.[COLUMN.SERVICE_ID] === excludeServiceId && excludeNodeId && row?.[COLUMN.NODE_ID] === excludeNodeId : stryMutAct_9fa48("89439") ? false : stryMutAct_9fa48("89438") ? true : (stryCov_9fa48("89438", "89439", "89440"), (stryMutAct_9fa48("89442") ? excludeServiceId || row?.[COLUMN.SERVICE_ID] === excludeServiceId : stryMutAct_9fa48("89441") ? false : (stryCov_9fa48("89441", "89442"), excludeServiceId && (stryMutAct_9fa48("89444") ? row?.[COLUMN.SERVICE_ID] !== excludeServiceId : stryMutAct_9fa48("89443") ? true : (stryCov_9fa48("89443", "89444"), (stryMutAct_9fa48("89445") ? row[COLUMN.SERVICE_ID] : (stryCov_9fa48("89445"), row?.[COLUMN.SERVICE_ID])) === excludeServiceId)))) || (stryMutAct_9fa48("89447") ? excludeNodeId || row?.[COLUMN.NODE_ID] === excludeNodeId : stryMutAct_9fa48("89446") ? false : (stryCov_9fa48("89446", "89447"), excludeNodeId && (stryMutAct_9fa48("89449") ? row?.[COLUMN.NODE_ID] !== excludeNodeId : stryMutAct_9fa48("89448") ? true : (stryCov_9fa48("89448", "89449"), (stryMutAct_9fa48("89450") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("89450"), row?.[COLUMN.NODE_ID])) === excludeNodeId))))));
  }
}
function findExplicitLeaderCandidate(candidates, options = {}) {
  if (stryMutAct_9fa48("89451")) {
    {}
  } else {
    stryCov_9fa48("89451");
    return stryMutAct_9fa48("89454") ? candidates.find(row => {
      return row?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER && !isExcludedCandidate(row, options);
    }) && null : stryMutAct_9fa48("89453") ? false : stryMutAct_9fa48("89452") ? true : (stryCov_9fa48("89452", "89453", "89454"), candidates.find(row => {
      if (stryMutAct_9fa48("89455")) {
        {}
      } else {
        stryCov_9fa48("89455");
        return stryMutAct_9fa48("89458") ? row?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER || !isExcludedCandidate(row, options) : stryMutAct_9fa48("89457") ? false : stryMutAct_9fa48("89456") ? true : (stryCov_9fa48("89456", "89457", "89458"), (stryMutAct_9fa48("89460") ? row?.[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER : stryMutAct_9fa48("89459") ? true : (stryCov_9fa48("89459", "89460"), (stryMutAct_9fa48("89461") ? row[COLUMN.RAFT_ROLE] : (stryCov_9fa48("89461"), row?.[COLUMN.RAFT_ROLE])) === RAFT_ROLE.LEADER)) && (stryMutAct_9fa48("89462") ? isExcludedCandidate(row, options) : (stryCov_9fa48("89462"), !isExcludedCandidate(row, options))));
      }
    }) || null);
  }
}
function getCanonicalLeaderNodeId(cache, groupId) {
  if (stryMutAct_9fa48("89463")) {
    {}
  } else {
    stryCov_9fa48("89463");
    const groupRow = findRow(cache, TABLES.MESSAGE_GROUPS, row => {
      if (stryMutAct_9fa48("89464")) {
        {}
      } else {
        stryCov_9fa48("89464");
        return stryMutAct_9fa48("89467") ? row?.[COLUMN.GROUP_ID] !== groupId : stryMutAct_9fa48("89466") ? false : stryMutAct_9fa48("89465") ? true : (stryCov_9fa48("89465", "89466", "89467"), (stryMutAct_9fa48("89468") ? row[COLUMN.GROUP_ID] : (stryCov_9fa48("89468"), row?.[COLUMN.GROUP_ID])) === groupId);
      }
    });
    const leaderNodeId = stryMutAct_9fa48("89469") ? groupRow[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("89469"), groupRow?.[COLUMN.LEADER_NODE_ID]);
    return (stryMutAct_9fa48("89472") ? typeof leaderNodeId === TYPEOF.STRING || leaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("89471") ? false : stryMutAct_9fa48("89470") ? true : (stryCov_9fa48("89470", "89471", "89472"), (stryMutAct_9fa48("89474") ? typeof leaderNodeId !== TYPEOF.STRING : stryMutAct_9fa48("89473") ? true : (stryCov_9fa48("89473", "89474"), typeof leaderNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("89477") ? leaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("89476") ? leaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("89475") ? true : (stryCov_9fa48("89475", "89476", "89477"), leaderNodeId.length > NUM.ZERO)))) ? leaderNodeId : null;
  }
}
function resolveCanonicalLeaderServiceCandidate(cache, groupId, candidates, options = {}) {
  if (stryMutAct_9fa48("89478")) {
    {}
  } else {
    stryCov_9fa48("89478");
    const leaderNodeId = getCanonicalLeaderNodeId(cache, groupId);
    if (stryMutAct_9fa48("89481") ? false : stryMutAct_9fa48("89480") ? true : stryMutAct_9fa48("89479") ? leaderNodeId : (stryCov_9fa48("89479", "89480", "89481"), !leaderNodeId)) {
      if (stryMutAct_9fa48("89482")) {
        {}
      } else {
        stryCov_9fa48("89482");
        return null;
      }
    }
    const matchingCandidates = stryMutAct_9fa48("89483") ? candidates : (stryCov_9fa48("89483"), candidates.filter(row => {
      if (stryMutAct_9fa48("89484")) {
        {}
      } else {
        stryCov_9fa48("89484");
        return stryMutAct_9fa48("89487") ? row?.[COLUMN.NODE_ID] === leaderNodeId || !isExcludedCandidate(row, options) : stryMutAct_9fa48("89486") ? false : stryMutAct_9fa48("89485") ? true : (stryCov_9fa48("89485", "89486", "89487"), (stryMutAct_9fa48("89489") ? row?.[COLUMN.NODE_ID] !== leaderNodeId : stryMutAct_9fa48("89488") ? true : (stryCov_9fa48("89488", "89489"), (stryMutAct_9fa48("89490") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("89490"), row?.[COLUMN.NODE_ID])) === leaderNodeId)) && (stryMutAct_9fa48("89491") ? isExcludedCandidate(row, options) : (stryCov_9fa48("89491"), !isExcludedCandidate(row, options))));
      }
    }));
    if (stryMutAct_9fa48("89494") ? matchingCandidates.length !== NUM.ZERO : stryMutAct_9fa48("89493") ? false : stryMutAct_9fa48("89492") ? true : (stryCov_9fa48("89492", "89493", "89494"), matchingCandidates.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("89495")) {
        {}
      } else {
        stryCov_9fa48("89495");
        return null;
      }
    }
    const canonicalExplicitLeader = findExplicitLeaderCandidate(matchingCandidates, options);
    if (stryMutAct_9fa48("89497") ? false : stryMutAct_9fa48("89496") ? true : (stryCov_9fa48("89496", "89497"), canonicalExplicitLeader)) {
      if (stryMutAct_9fa48("89498")) {
        {}
      } else {
        stryCov_9fa48("89498");
        return canonicalExplicitLeader;
      }
    }
    const explicitLeader = findExplicitLeaderCandidate(candidates, options);
    if (stryMutAct_9fa48("89501") ? explicitLeader || explicitLeader?.[COLUMN.NODE_ID] !== leaderNodeId : stryMutAct_9fa48("89500") ? false : stryMutAct_9fa48("89499") ? true : (stryCov_9fa48("89499", "89500", "89501"), explicitLeader && (stryMutAct_9fa48("89503") ? explicitLeader?.[COLUMN.NODE_ID] === leaderNodeId : stryMutAct_9fa48("89502") ? true : (stryCov_9fa48("89502", "89503"), (stryMutAct_9fa48("89504") ? explicitLeader[COLUMN.NODE_ID] : (stryCov_9fa48("89504"), explicitLeader?.[COLUMN.NODE_ID])) !== leaderNodeId)))) {
      if (stryMutAct_9fa48("89505")) {
        {}
      } else {
        stryCov_9fa48("89505");
        return null;
      }
    }
    if (stryMutAct_9fa48("89508") ? matchingCandidates.length !== NUM.ONE : stryMutAct_9fa48("89507") ? false : stryMutAct_9fa48("89506") ? true : (stryCov_9fa48("89506", "89507", "89508"), matchingCandidates.length === NUM.ONE)) {
      if (stryMutAct_9fa48("89509")) {
        {}
      } else {
        stryCov_9fa48("89509");
        return matchingCandidates[NUM.ZERO];
      }
    }
    return null;
  }
}
function resolveMessageGroupLeaderServiceFromCache(cache, groupId, options = {}) {
  if (stryMutAct_9fa48("89510")) {
    {}
  } else {
    stryCov_9fa48("89510");
    const candidates = preferConnectedCandidates(getMessageGroupServiceCandidates(cache, groupId, options), options);
    const leaderNodeId = getCanonicalLeaderNodeId(cache, groupId);
    const canonicalLeader = resolveCanonicalLeaderServiceCandidate(cache, groupId, candidates, options);
    if (stryMutAct_9fa48("89512") ? false : stryMutAct_9fa48("89511") ? true : (stryCov_9fa48("89511", "89512"), canonicalLeader)) {
      if (stryMutAct_9fa48("89513")) {
        {}
      } else {
        stryCov_9fa48("89513");
        return canonicalLeader;
      }
    }
    const explicitLeader = findExplicitLeaderCandidate(candidates, options);
    if (stryMutAct_9fa48("89515") ? false : stryMutAct_9fa48("89514") ? true : (stryCov_9fa48("89514", "89515"), explicitLeader)) {
      if (stryMutAct_9fa48("89516")) {
        {}
      } else {
        stryCov_9fa48("89516");
        return explicitLeader;
      }
    }
    if (stryMutAct_9fa48("89518") ? false : stryMutAct_9fa48("89517") ? true : (stryCov_9fa48("89517", "89518"), leaderNodeId)) {
      if (stryMutAct_9fa48("89519")) {
        {}
      } else {
        stryCov_9fa48("89519");
        return null;
      }
    }
    return null;
  }
}
function resolveMessageGroupForwardServiceFromCache(cache, groupId, options = {}) {
  if (stryMutAct_9fa48("89520")) {
    {}
  } else {
    stryCov_9fa48("89520");
    const candidates = stryMutAct_9fa48("89521") ? preferConnectedCandidates(getMessageGroupServiceCandidates(cache, groupId, options), options) : (stryCov_9fa48("89521"), preferConnectedCandidates(getMessageGroupServiceCandidates(cache, groupId, options), options).filter(row => {
      if (stryMutAct_9fa48("89522")) {
        {}
      } else {
        stryCov_9fa48("89522");
        return stryMutAct_9fa48("89523") ? isExcludedCandidate(row, options) : (stryCov_9fa48("89523"), !isExcludedCandidate(row, options));
      }
    }));
    if (stryMutAct_9fa48("89526") ? candidates.length !== NUM.ZERO : stryMutAct_9fa48("89525") ? false : stryMutAct_9fa48("89524") ? true : (stryCov_9fa48("89524", "89525", "89526"), candidates.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("89527")) {
        {}
      } else {
        stryCov_9fa48("89527");
        return null;
      }
    }
    const canonicalLeader = resolveCanonicalLeaderServiceCandidate(cache, groupId, candidates, options);
    if (stryMutAct_9fa48("89529") ? false : stryMutAct_9fa48("89528") ? true : (stryCov_9fa48("89528", "89529"), canonicalLeader)) {
      if (stryMutAct_9fa48("89530")) {
        {}
      } else {
        stryCov_9fa48("89530");
        return canonicalLeader;
      }
    }
    const sorted = stryMutAct_9fa48("89531") ? [...candidates] : (stryCov_9fa48("89531"), (stryMutAct_9fa48("89532") ? [] : (stryCov_9fa48("89532"), [...candidates])).sort((left, right) => {
      if (stryMutAct_9fa48("89533")) {
        {}
      } else {
        stryCov_9fa48("89533");
        const leftLeader = stryMutAct_9fa48("89536") ? left?.[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER : stryMutAct_9fa48("89535") ? false : stryMutAct_9fa48("89534") ? true : (stryCov_9fa48("89534", "89535", "89536"), (stryMutAct_9fa48("89537") ? left[COLUMN.RAFT_ROLE] : (stryCov_9fa48("89537"), left?.[COLUMN.RAFT_ROLE])) === RAFT_ROLE.LEADER);
        const rightLeader = stryMutAct_9fa48("89540") ? right?.[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER : stryMutAct_9fa48("89539") ? false : stryMutAct_9fa48("89538") ? true : (stryCov_9fa48("89538", "89539", "89540"), (stryMutAct_9fa48("89541") ? right[COLUMN.RAFT_ROLE] : (stryCov_9fa48("89541"), right?.[COLUMN.RAFT_ROLE])) === RAFT_ROLE.LEADER);
        if (stryMutAct_9fa48("89544") ? leftLeader || !rightLeader : stryMutAct_9fa48("89543") ? false : stryMutAct_9fa48("89542") ? true : (stryCov_9fa48("89542", "89543", "89544"), leftLeader && (stryMutAct_9fa48("89545") ? rightLeader : (stryCov_9fa48("89545"), !rightLeader)))) {
          if (stryMutAct_9fa48("89546")) {
            {}
          } else {
            stryCov_9fa48("89546");
            return NUM.NEGATIVE_ONE;
          }
        }
        if (stryMutAct_9fa48("89549") ? !leftLeader || rightLeader : stryMutAct_9fa48("89548") ? false : stryMutAct_9fa48("89547") ? true : (stryCov_9fa48("89547", "89548", "89549"), (stryMutAct_9fa48("89550") ? leftLeader : (stryCov_9fa48("89550"), !leftLeader)) && rightLeader)) {
          if (stryMutAct_9fa48("89551")) {
            {}
          } else {
            stryCov_9fa48("89551");
            return NUM.ONE;
          }
        }
        const leftUpdatedAt = Number(stryMutAct_9fa48("89552") ? left[COLUMN.UPDATED_AT] : (stryCov_9fa48("89552"), left?.[COLUMN.UPDATED_AT]));
        const rightUpdatedAt = Number(stryMutAct_9fa48("89553") ? right[COLUMN.UPDATED_AT] : (stryCov_9fa48("89553"), right?.[COLUMN.UPDATED_AT]));
        const leftHasUpdatedAt = Number.isFinite(leftUpdatedAt);
        const rightHasUpdatedAt = Number.isFinite(rightUpdatedAt);
        if (stryMutAct_9fa48("89556") ? leftHasUpdatedAt && rightHasUpdatedAt || leftUpdatedAt !== rightUpdatedAt : stryMutAct_9fa48("89555") ? false : stryMutAct_9fa48("89554") ? true : (stryCov_9fa48("89554", "89555", "89556"), (stryMutAct_9fa48("89558") ? leftHasUpdatedAt || rightHasUpdatedAt : stryMutAct_9fa48("89557") ? true : (stryCov_9fa48("89557", "89558"), leftHasUpdatedAt && rightHasUpdatedAt)) && (stryMutAct_9fa48("89560") ? leftUpdatedAt === rightUpdatedAt : stryMutAct_9fa48("89559") ? true : (stryCov_9fa48("89559", "89560"), leftUpdatedAt !== rightUpdatedAt)))) {
          if (stryMutAct_9fa48("89561")) {
            {}
          } else {
            stryCov_9fa48("89561");
            return stryMutAct_9fa48("89562") ? rightUpdatedAt + leftUpdatedAt : (stryCov_9fa48("89562"), rightUpdatedAt - leftUpdatedAt);
          }
        }
        if (stryMutAct_9fa48("89565") ? leftHasUpdatedAt || !rightHasUpdatedAt : stryMutAct_9fa48("89564") ? false : stryMutAct_9fa48("89563") ? true : (stryCov_9fa48("89563", "89564", "89565"), leftHasUpdatedAt && (stryMutAct_9fa48("89566") ? rightHasUpdatedAt : (stryCov_9fa48("89566"), !rightHasUpdatedAt)))) {
          if (stryMutAct_9fa48("89567")) {
            {}
          } else {
            stryCov_9fa48("89567");
            return NUM.NEGATIVE_ONE;
          }
        }
        if (stryMutAct_9fa48("89570") ? !leftHasUpdatedAt || rightHasUpdatedAt : stryMutAct_9fa48("89569") ? false : stryMutAct_9fa48("89568") ? true : (stryCov_9fa48("89568", "89569", "89570"), (stryMutAct_9fa48("89571") ? leftHasUpdatedAt : (stryCov_9fa48("89571"), !leftHasUpdatedAt)) && rightHasUpdatedAt)) {
          if (stryMutAct_9fa48("89572")) {
            {}
          } else {
            stryCov_9fa48("89572");
            return NUM.ONE;
          }
        }
        const leftServiceId = stryMutAct_9fa48("89575") ? left?.[COLUMN.SERVICE_ID] && '' : stryMutAct_9fa48("89574") ? false : stryMutAct_9fa48("89573") ? true : (stryCov_9fa48("89573", "89574", "89575"), (stryMutAct_9fa48("89576") ? left[COLUMN.SERVICE_ID] : (stryCov_9fa48("89576"), left?.[COLUMN.SERVICE_ID])) || (stryMutAct_9fa48("89577") ? "Stryker was here!" : (stryCov_9fa48("89577"), '')));
        const rightServiceId = stryMutAct_9fa48("89580") ? right?.[COLUMN.SERVICE_ID] && '' : stryMutAct_9fa48("89579") ? false : stryMutAct_9fa48("89578") ? true : (stryCov_9fa48("89578", "89579", "89580"), (stryMutAct_9fa48("89581") ? right[COLUMN.SERVICE_ID] : (stryCov_9fa48("89581"), right?.[COLUMN.SERVICE_ID])) || (stryMutAct_9fa48("89582") ? "Stryker was here!" : (stryCov_9fa48("89582"), '')));
        return leftServiceId.localeCompare(rightServiceId);
      }
    }));
    return stryMutAct_9fa48("89585") ? sorted[NUM.ZERO] && null : stryMutAct_9fa48("89584") ? false : stryMutAct_9fa48("89583") ? true : (stryCov_9fa48("89583", "89584", "89585"), sorted[NUM.ZERO] || null);
  }
}
function resolveMessageGroupTargetAddressFromCache(cache, groupId, options = {}) {
  if (stryMutAct_9fa48("89586")) {
    {}
  } else {
    stryCov_9fa48("89586");
    const seedNodeId = stryMutAct_9fa48("89589") ? options.seedNodeId && null : stryMutAct_9fa48("89588") ? false : stryMutAct_9fa48("89587") ? true : (stryCov_9fa48("89587", "89588", "89589"), options.seedNodeId || null);
    const isConnectedNode = (stryMutAct_9fa48("89592") ? typeof options.isConnectedNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("89591") ? false : stryMutAct_9fa48("89590") ? true : (stryCov_9fa48("89590", "89591", "89592"), typeof options.isConnectedNode === TYPEOF.FUNCTION)) ? options.isConnectedNode : stryMutAct_9fa48("89593") ? () => undefined : (stryCov_9fa48("89593"), () => stryMutAct_9fa48("89594") ? false : (stryCov_9fa48("89594"), true));
    const candidates = getMessageGroupServiceCandidates(cache, groupId, options);
    if (stryMutAct_9fa48("89597") ? candidates.length !== NUM.ZERO : stryMutAct_9fa48("89596") ? false : stryMutAct_9fa48("89595") ? true : (stryCov_9fa48("89595", "89596", "89597"), candidates.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("89598")) {
        {}
      } else {
        stryCov_9fa48("89598");
        return null;
      }
    }
    const preferredLeader = resolveMessageGroupLeaderServiceFromCache(cache, groupId, options);
    if (stryMutAct_9fa48("89601") ? preferredLeader || isConnectedNode(preferredLeader[COLUMN.NODE_ID]) : stryMutAct_9fa48("89600") ? false : stryMutAct_9fa48("89599") ? true : (stryCov_9fa48("89599", "89600", "89601"), preferredLeader && isConnectedNode(preferredLeader[COLUMN.NODE_ID]))) {
      if (stryMutAct_9fa48("89602")) {
        {}
      } else {
        stryCov_9fa48("89602");
        return preferredLeader[COLUMN.ADDRESS];
      }
    }
    const preferredSeedConnected = candidates.find(row => {
      if (stryMutAct_9fa48("89603")) {
        {}
      } else {
        stryCov_9fa48("89603");
        return stryMutAct_9fa48("89606") ? !!seedNodeId && row[COLUMN.NODE_ID] === seedNodeId && !isExcludedCandidate(row, options) || isConnectedNode(row[COLUMN.NODE_ID]) : stryMutAct_9fa48("89605") ? false : stryMutAct_9fa48("89604") ? true : (stryCov_9fa48("89604", "89605", "89606"), (stryMutAct_9fa48("89608") ? !!seedNodeId && row[COLUMN.NODE_ID] === seedNodeId || !isExcludedCandidate(row, options) : stryMutAct_9fa48("89607") ? true : (stryCov_9fa48("89607", "89608"), (stryMutAct_9fa48("89610") ? !!seedNodeId || row[COLUMN.NODE_ID] === seedNodeId : stryMutAct_9fa48("89609") ? true : (stryCov_9fa48("89609", "89610"), (stryMutAct_9fa48("89611") ? !seedNodeId : (stryCov_9fa48("89611"), !(stryMutAct_9fa48("89612") ? seedNodeId : (stryCov_9fa48("89612"), !seedNodeId)))) && (stryMutAct_9fa48("89614") ? row[COLUMN.NODE_ID] !== seedNodeId : stryMutAct_9fa48("89613") ? true : (stryCov_9fa48("89613", "89614"), row[COLUMN.NODE_ID] === seedNodeId)))) && (stryMutAct_9fa48("89615") ? isExcludedCandidate(row, options) : (stryCov_9fa48("89615"), !isExcludedCandidate(row, options))))) && isConnectedNode(row[COLUMN.NODE_ID]));
      }
    });
    if (stryMutAct_9fa48("89617") ? false : stryMutAct_9fa48("89616") ? true : (stryCov_9fa48("89616", "89617"), preferredSeedConnected)) {
      if (stryMutAct_9fa48("89618")) {
        {}
      } else {
        stryCov_9fa48("89618");
        return preferredSeedConnected[COLUMN.ADDRESS];
      }
    }
    const anyConnected = candidates.find(row => {
      if (stryMutAct_9fa48("89619")) {
        {}
      } else {
        stryCov_9fa48("89619");
        return stryMutAct_9fa48("89622") ? !isExcludedCandidate(row, options) || isConnectedNode(row[COLUMN.NODE_ID]) : stryMutAct_9fa48("89621") ? false : stryMutAct_9fa48("89620") ? true : (stryCov_9fa48("89620", "89621", "89622"), (stryMutAct_9fa48("89623") ? isExcludedCandidate(row, options) : (stryCov_9fa48("89623"), !isExcludedCandidate(row, options))) && isConnectedNode(row[COLUMN.NODE_ID]));
      }
    });
    if (stryMutAct_9fa48("89625") ? false : stryMutAct_9fa48("89624") ? true : (stryCov_9fa48("89624", "89625"), anyConnected)) {
      if (stryMutAct_9fa48("89626")) {
        {}
      } else {
        stryCov_9fa48("89626");
        return anyConnected[COLUMN.ADDRESS];
      }
    }
    return null;
  }
}
export { resolveMessageGroupForwardServiceFromCache, resolveMessageGroupLeaderServiceFromCache, resolveMessageGroupTargetAddressFromCache };
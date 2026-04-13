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
import Database from 'better-sqlite3';
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COLUMN, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { REJOIN_HINTS_FILENAME, REJOIN_HINTS_TEMP_SUFFIX, REJOIN_HINTS_WRITE_INTERVAL_MS, STARTUP_JOIN_MODE } from './rejoin-hints-constants.js';
const PARTITIONS_DIRNAME = stryMutAct_9fa48("27683") ? "" : (stryCov_9fa48("27683"), 'partitions');
const SQLITE_DB_SUFFIX = stryMutAct_9fa48("27684") ? "" : (stryCov_9fa48("27684"), '.db');
const NODES_PARTITION_PREFIX = stryMutAct_9fa48("27685") ? `` : (stryCov_9fa48("27685"), `${TABLES.NODES}-p`);
const REJOIN_ROLE_SEED = stryMutAct_9fa48("27686") ? "" : (stryCov_9fa48("27686"), 'seed');
const REJOIN_ROLE_JOINER = stryMutAct_9fa48("27687") ? "" : (stryCov_9fa48("27687"), 'joiner');
const STARTUP_MODE_JOIN = stryMutAct_9fa48("27688") ? "" : (stryCov_9fa48("27688"), 'join');
const STARTUP_MODE_SEED = stryMutAct_9fa48("27689") ? "" : (stryCov_9fa48("27689"), 'seed');
const STARTUP_MODE_FAIL = stryMutAct_9fa48("27690") ? "" : (stryCov_9fa48("27690"), 'fail');
const SQLITE_TABLE_TYPE = stryMutAct_9fa48("27691") ? "" : (stryCov_9fa48("27691"), 'table');
const EMPTY_STRING = stryMutAct_9fa48("27692") ? "Stryker was here!" : (stryCov_9fa48("27692"), '');
const MULTI_NODE_CLUSTER_THRESHOLD = 1;
const RECOVERED_CLUSTER_NODE_COUNT_WITH_PEER = 2;
const UTF8_ENCODING = stryMutAct_9fa48("27693") ? "" : (stryCov_9fa48("27693"), 'utf8');
const JSON_INDENT_SPACES = 2;
const JSON_LINE_SUFFIX = stryMutAct_9fa48("27694") ? "" : (stryCov_9fa48("27694"), '\n');
const AUTO_REJOIN_REQUIRED_ERROR_CODE = stryMutAct_9fa48("27695") ? "" : (stryCov_9fa48("27695"), 'AUTO_REJOIN_REQUIRED');
const REJOIN_SOURCE = Object.freeze(stryMutAct_9fa48("27696") ? {} : (stryCov_9fa48("27696"), {
  NONE: stryMutAct_9fa48("27697") ? "" : (stryCov_9fa48("27697"), 'none'),
  REJOIN_HINTS: stryMutAct_9fa48("27698") ? "" : (stryCov_9fa48("27698"), 'rejoin_hints'),
  DURABLE_NODES_TABLE: stryMutAct_9fa48("27699") ? "" : (stryCov_9fa48("27699"), 'durable_nodes_table')
}));
const PEER_ADDRESS_STATE = Object.freeze(stryMutAct_9fa48("27700") ? {} : (stryCov_9fa48("27700"), {
  SELECTED: stryMutAct_9fa48("27701") ? "" : (stryCov_9fa48("27701"), 'selected'),
  UNAVAILABLE: stryMutAct_9fa48("27702") ? "" : (stryCov_9fa48("27702"), 'unavailable')
}));
const AUTO_REJOIN_DECISION_STATE = Object.freeze(stryMutAct_9fa48("27703") ? {} : (stryCov_9fa48("27703"), {
  IDENTITY_MISMATCH: stryMutAct_9fa48("27704") ? "" : (stryCov_9fa48("27704"), 'identity_mismatch'),
  DURABLE_SEED: stryMutAct_9fa48("27705") ? "" : (stryCov_9fa48("27705"), 'durable_seed'),
  JOIN_PROBED_PEER: stryMutAct_9fa48("27706") ? "" : (stryCov_9fa48("27706"), 'join_probed_peer'),
  JOIN_RECOVERED_PEER: stryMutAct_9fa48("27707") ? "" : (stryCov_9fa48("27707"), 'join_recovered_peer'),
  PEER_REQUIRED_BUT_MISSING: stryMutAct_9fa48("27708") ? "" : (stryCov_9fa48("27708"), 'peer_required_but_missing'),
  FRESH_SEED: stryMutAct_9fa48("27709") ? "" : (stryCov_9fa48("27709"), 'fresh_seed')
}));
const IDENTITY_MISMATCH_ERROR_MESSAGE = (stryMutAct_9fa48("27710") ? "" : (stryCov_9fa48("27710"), 'Persistent cluster state belongs to a different node identity; ')) + (stryMutAct_9fa48("27711") ? "" : (stryCov_9fa48("27711"), 'refusing to start with mismatched data directory'));
const DURABLE_STATE_REJOIN_REQUIRED_ERROR_MESSAGE = (stryMutAct_9fa48("27712") ? "" : (stryCov_9fa48("27712"), 'Persistent multi-node cluster state was detected but no rejoin peer ')) + (stryMutAct_9fa48("27713") ? "" : (stryCov_9fa48("27713"), 'address could be recovered; refusing to bootstrap a fresh seed over ')) + (stryMutAct_9fa48("27714") ? "" : (stryCov_9fa48("27714"), 'existing durable state'));
const REJOIN_HINTS_PERSIST_FAILED_LOG_MESSAGE = stryMutAct_9fa48("27715") ? "" : (stryCov_9fa48("27715"), 'Failed to persist cluster rejoin hints');
const UNKNOWN_AUTO_REJOIN_DECISION_STATE_ERROR_PREFIX = stryMutAct_9fa48("27716") ? "" : (stryCov_9fa48("27716"), 'Unknown auto-rejoin startup decision state: ');
const SQL_TABLE_EXISTS = stryMutAct_9fa48("27717") ? "" : (stryCov_9fa48("27717"), 'SELECT 1 AS present FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1');
const SQL_SELECT_NODES = (stryMutAct_9fa48("27718") ? `` : (stryCov_9fa48("27718"), `SELECT ${COLUMN.NODE_ID} AS node_id, `)) + (stryMutAct_9fa48("27719") ? `` : (stryCov_9fa48("27719"), `${COLUMN.NODE_ADDRESS} AS node_address FROM ${TABLES.NODES}`));
let rejoinHintsTempSequence = NUM.ZERO;
function normalizeAddress(value) {
  if (stryMutAct_9fa48("27720")) {
    {}
  } else {
    stryCov_9fa48("27720");
    if (stryMutAct_9fa48("27723") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("27722") ? false : stryMutAct_9fa48("27721") ? true : (stryCov_9fa48("27721", "27722", "27723"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("27724")) {
        {}
      } else {
        stryCov_9fa48("27724");
        return null;
      }
    }
    const trimmed = stryMutAct_9fa48("27725") ? value : (stryCov_9fa48("27725"), value.trim());
    return (stryMutAct_9fa48("27729") ? trimmed.length <= NUM.ZERO : stryMutAct_9fa48("27728") ? trimmed.length >= NUM.ZERO : stryMutAct_9fa48("27727") ? false : stryMutAct_9fa48("27726") ? true : (stryCov_9fa48("27726", "27727", "27728", "27729"), trimmed.length > NUM.ZERO)) ? trimmed : null;
  }
}
function normalizeNodeCount(nodeRows) {
  if (stryMutAct_9fa48("27730")) {
    {}
  } else {
    stryCov_9fa48("27730");
    return Array.isArray(nodeRows) ? nodeRows.length : NUM.ZERO;
  }
}
function normalizeNodeRole(value) {
  if (stryMutAct_9fa48("27731")) {
    {}
  } else {
    stryCov_9fa48("27731");
    const normalized = normalizeAddress(value);
    if (stryMutAct_9fa48("27734") ? false : stryMutAct_9fa48("27733") ? true : stryMutAct_9fa48("27732") ? normalized : (stryCov_9fa48("27732", "27733", "27734"), !normalized)) {
      if (stryMutAct_9fa48("27735")) {
        {}
      } else {
        stryCov_9fa48("27735");
        return null;
      }
    }
    const role = stryMutAct_9fa48("27736") ? normalized.toUpperCase() : (stryCov_9fa48("27736"), normalized.toLowerCase());
    if (stryMutAct_9fa48("27739") ? role === REJOIN_ROLE_SEED && role === REJOIN_ROLE_JOINER : stryMutAct_9fa48("27738") ? false : stryMutAct_9fa48("27737") ? true : (stryCov_9fa48("27737", "27738", "27739"), (stryMutAct_9fa48("27741") ? role !== REJOIN_ROLE_SEED : stryMutAct_9fa48("27740") ? false : (stryCov_9fa48("27740", "27741"), role === REJOIN_ROLE_SEED)) || (stryMutAct_9fa48("27743") ? role !== REJOIN_ROLE_JOINER : stryMutAct_9fa48("27742") ? false : (stryCov_9fa48("27742", "27743"), role === REJOIN_ROLE_JOINER)))) {
      if (stryMutAct_9fa48("27744")) {
        {}
      } else {
        stryCov_9fa48("27744");
        return role;
      }
    }
    return null;
  }
}
function parseClusterNodeCount(value) {
  if (stryMutAct_9fa48("27745")) {
    {}
  } else {
    stryCov_9fa48("27745");
    const parsed = Number(value);
    if (stryMutAct_9fa48("27748") ? !Number.isFinite(parsed) && parsed < NUM.ZERO : stryMutAct_9fa48("27747") ? false : stryMutAct_9fa48("27746") ? true : (stryCov_9fa48("27746", "27747", "27748"), (stryMutAct_9fa48("27749") ? Number.isFinite(parsed) : (stryCov_9fa48("27749"), !Number.isFinite(parsed))) || (stryMutAct_9fa48("27752") ? parsed >= NUM.ZERO : stryMutAct_9fa48("27751") ? parsed <= NUM.ZERO : stryMutAct_9fa48("27750") ? false : (stryCov_9fa48("27750", "27751", "27752"), parsed < NUM.ZERO)))) {
      if (stryMutAct_9fa48("27753")) {
        {}
      } else {
        stryCov_9fa48("27753");
        return NUM.ZERO;
      }
    }
    return Math.floor(parsed);
  }
}
function normalizePeerAddresses(peerAddresses, nodeId, nodeAddress) {
  if (stryMutAct_9fa48("27754")) {
    {}
  } else {
    stryCov_9fa48("27754");
    const normalizedNodeId = normalizeAddress(nodeId);
    const normalizedNodeAddress = normalizeAddress(nodeAddress);
    const uniquePeerAddresses = new Set();
    for (const value of Array.isArray(peerAddresses) ? peerAddresses : stryMutAct_9fa48("27755") ? ["Stryker was here"] : (stryCov_9fa48("27755"), [])) {
      if (stryMutAct_9fa48("27756")) {
        {}
      } else {
        stryCov_9fa48("27756");
        const rowNodeId = normalizeAddress(stryMutAct_9fa48("27757") ? (value?.[COLUMN.NODE_ID] ?? value?.node_id) && null : (stryCov_9fa48("27757"), (stryMutAct_9fa48("27758") ? value?.[COLUMN.NODE_ID] && value?.node_id : (stryCov_9fa48("27758"), (stryMutAct_9fa48("27759") ? value[COLUMN.NODE_ID] : (stryCov_9fa48("27759"), value?.[COLUMN.NODE_ID])) ?? (stryMutAct_9fa48("27760") ? value.node_id : (stryCov_9fa48("27760"), value?.node_id)))) ?? null));
        const peerAddress = normalizeAddress(stryMutAct_9fa48("27761") ? (value?.[COLUMN.NODE_ADDRESS] ?? value?.node_address) && value : (stryCov_9fa48("27761"), (stryMutAct_9fa48("27762") ? value?.[COLUMN.NODE_ADDRESS] && value?.node_address : (stryCov_9fa48("27762"), (stryMutAct_9fa48("27763") ? value[COLUMN.NODE_ADDRESS] : (stryCov_9fa48("27763"), value?.[COLUMN.NODE_ADDRESS])) ?? (stryMutAct_9fa48("27764") ? value.node_address : (stryCov_9fa48("27764"), value?.node_address)))) ?? value));
        if (stryMutAct_9fa48("27767") ? false : stryMutAct_9fa48("27766") ? true : stryMutAct_9fa48("27765") ? peerAddress : (stryCov_9fa48("27765", "27766", "27767"), !peerAddress)) {
          if (stryMutAct_9fa48("27768")) {
            {}
          } else {
            stryCov_9fa48("27768");
            continue;
          }
        }
        if (stryMutAct_9fa48("27771") ? normalizedNodeId || rowNodeId === normalizedNodeId : stryMutAct_9fa48("27770") ? false : stryMutAct_9fa48("27769") ? true : (stryCov_9fa48("27769", "27770", "27771"), normalizedNodeId && (stryMutAct_9fa48("27773") ? rowNodeId !== normalizedNodeId : stryMutAct_9fa48("27772") ? true : (stryCov_9fa48("27772", "27773"), rowNodeId === normalizedNodeId)))) {
          if (stryMutAct_9fa48("27774")) {
            {}
          } else {
            stryCov_9fa48("27774");
            continue;
          }
        }
        if (stryMutAct_9fa48("27777") ? normalizedNodeAddress || peerAddress === normalizedNodeAddress : stryMutAct_9fa48("27776") ? false : stryMutAct_9fa48("27775") ? true : (stryCov_9fa48("27775", "27776", "27777"), normalizedNodeAddress && (stryMutAct_9fa48("27779") ? peerAddress !== normalizedNodeAddress : stryMutAct_9fa48("27778") ? true : (stryCov_9fa48("27778", "27779"), peerAddress === normalizedNodeAddress)))) {
          if (stryMutAct_9fa48("27780")) {
            {}
          } else {
            stryCov_9fa48("27780");
            continue;
          }
        }
        uniquePeerAddresses.add(peerAddress);
      }
    }
    return Array.from(uniquePeerAddresses);
  }
}
function deriveRequiresPeerRejoin(options = {}) {
  if (stryMutAct_9fa48("27781")) {
    {}
  } else {
    stryCov_9fa48("27781");
    return stryMutAct_9fa48("27784") ? (normalizeNodeRole(options.nodeRole) === REJOIN_ROLE_JOINER || parseClusterNodeCount(options.clusterNodeCount) > MULTI_NODE_CLUSTER_THRESHOLD) && normalizePeerAddresses(options.peerAddresses).length > NUM.ZERO : stryMutAct_9fa48("27783") ? false : stryMutAct_9fa48("27782") ? true : (stryCov_9fa48("27782", "27783", "27784"), (stryMutAct_9fa48("27786") ? normalizeNodeRole(options.nodeRole) === REJOIN_ROLE_JOINER && parseClusterNodeCount(options.clusterNodeCount) > MULTI_NODE_CLUSTER_THRESHOLD : stryMutAct_9fa48("27785") ? false : (stryCov_9fa48("27785", "27786"), (stryMutAct_9fa48("27788") ? normalizeNodeRole(options.nodeRole) !== REJOIN_ROLE_JOINER : stryMutAct_9fa48("27787") ? false : (stryCov_9fa48("27787", "27788"), normalizeNodeRole(options.nodeRole) === REJOIN_ROLE_JOINER)) || (stryMutAct_9fa48("27791") ? parseClusterNodeCount(options.clusterNodeCount) <= MULTI_NODE_CLUSTER_THRESHOLD : stryMutAct_9fa48("27790") ? parseClusterNodeCount(options.clusterNodeCount) >= MULTI_NODE_CLUSTER_THRESHOLD : stryMutAct_9fa48("27789") ? false : (stryCov_9fa48("27789", "27790", "27791"), parseClusterNodeCount(options.clusterNodeCount) > MULTI_NODE_CLUSTER_THRESHOLD)))) || (stryMutAct_9fa48("27794") ? normalizePeerAddresses(options.peerAddresses).length <= NUM.ZERO : stryMutAct_9fa48("27793") ? normalizePeerAddresses(options.peerAddresses).length >= NUM.ZERO : stryMutAct_9fa48("27792") ? false : (stryCov_9fa48("27792", "27793", "27794"), normalizePeerAddresses(options.peerAddresses).length > NUM.ZERO)));
  }
}
function extractPeerAddresses(nodeRows, nodeId, nodeAddress) {
  if (stryMutAct_9fa48("27795")) {
    {}
  } else {
    stryCov_9fa48("27795");
    return normalizePeerAddresses(nodeRows, nodeId, nodeAddress);
  }
}
function buildRejoinHintsSnapshot(options = {}) {
  if (stryMutAct_9fa48("27796")) {
    {}
  } else {
    stryCov_9fa48("27796");
    const systemTableCache = stryMutAct_9fa48("27799") ? options.systemTableCache && null : stryMutAct_9fa48("27798") ? false : stryMutAct_9fa48("27797") ? true : (stryCov_9fa48("27797", "27798", "27799"), options.systemTableCache || null);
    const nodeRows = (stryMutAct_9fa48("27802") ? typeof systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("27801") ? false : stryMutAct_9fa48("27800") ? true : (stryCov_9fa48("27800", "27801", "27802"), typeof (stryMutAct_9fa48("27803") ? systemTableCache.getAll : (stryCov_9fa48("27803"), systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("27806") ? systemTableCache.getAll(TABLES.NODES) && [] : stryMutAct_9fa48("27805") ? false : stryMutAct_9fa48("27804") ? true : (stryCov_9fa48("27804", "27805", "27806"), systemTableCache.getAll(TABLES.NODES) || (stryMutAct_9fa48("27807") ? ["Stryker was here"] : (stryCov_9fa48("27807"), []))) : stryMutAct_9fa48("27808") ? ["Stryker was here"] : (stryCov_9fa48("27808"), []);
    const localNodeId = normalizeAddress(options.nodeId);
    const localNodeAddress = normalizeAddress(options.nodeAddress);
    const localNodeRole = normalizeNodeRole(options.nodeRole);
    const clusterNodeCount = normalizeNodeCount(nodeRows);
    const peerAddresses = extractPeerAddresses(nodeRows, localNodeId, localNodeAddress);
    return stryMutAct_9fa48("27809") ? {} : (stryCov_9fa48("27809"), {
      localNodeId,
      localNodeAddress,
      localNodeRole,
      clusterNodeCount,
      peerAddresses,
      requiresPeerRejoin: deriveRequiresPeerRejoin(stryMutAct_9fa48("27810") ? {} : (stryCov_9fa48("27810"), {
        nodeRole: localNodeRole,
        clusterNodeCount,
        peerAddresses
      })),
      updatedAt: (stryMutAct_9fa48("27813") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("27812") ? false : stryMutAct_9fa48("27811") ? true : (stryCov_9fa48("27811", "27812", "27813"), typeof options.now === TYPEOF.FUNCTION)) ? options.now() : Date.now()
    });
  }
}
function buildBootstrapRejoinHintsSnapshot(options = {}) {
  if (stryMutAct_9fa48("27814")) {
    {}
  } else {
    stryCov_9fa48("27814");
    const localNodeId = normalizeAddress(options.nodeId);
    const localNodeAddress = normalizeAddress(options.nodeAddress);
    const localNodeRole = normalizeNodeRole(options.nodeRole);
    const peerAddresses = normalizePeerAddresses(options.peerAddresses, localNodeId, localNodeAddress);
    const clusterNodeCount = stryMutAct_9fa48("27815") ? Math.min(parseClusterNodeCount(options.clusterNodeCount), peerAddresses.length > NUM.ZERO ? RECOVERED_CLUSTER_NODE_COUNT_WITH_PEER : NUM.ZERO) : (stryCov_9fa48("27815"), Math.max(parseClusterNodeCount(options.clusterNodeCount), (stryMutAct_9fa48("27819") ? peerAddresses.length <= NUM.ZERO : stryMutAct_9fa48("27818") ? peerAddresses.length >= NUM.ZERO : stryMutAct_9fa48("27817") ? false : stryMutAct_9fa48("27816") ? true : (stryCov_9fa48("27816", "27817", "27818", "27819"), peerAddresses.length > NUM.ZERO)) ? RECOVERED_CLUSTER_NODE_COUNT_WITH_PEER : NUM.ZERO));
    return stryMutAct_9fa48("27820") ? {} : (stryCov_9fa48("27820"), {
      localNodeId,
      localNodeAddress,
      localNodeRole,
      clusterNodeCount,
      peerAddresses,
      requiresPeerRejoin: deriveRequiresPeerRejoin(stryMutAct_9fa48("27821") ? {} : (stryCov_9fa48("27821"), {
        nodeRole: localNodeRole,
        clusterNodeCount,
        peerAddresses
      })),
      updatedAt: (stryMutAct_9fa48("27824") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("27823") ? false : stryMutAct_9fa48("27822") ? true : (stryCov_9fa48("27822", "27823", "27824"), typeof options.now === TYPEOF.FUNCTION)) ? options.now() : Date.now()
    });
  }
}
function resolveRejoinHintsPath(dataDir) {
  if (stryMutAct_9fa48("27825")) {
    {}
  } else {
    stryCov_9fa48("27825");
    const normalizedDataDir = normalizeAddress(dataDir);
    if (stryMutAct_9fa48("27828") ? false : stryMutAct_9fa48("27827") ? true : stryMutAct_9fa48("27826") ? normalizedDataDir : (stryCov_9fa48("27826", "27827", "27828"), !normalizedDataDir)) {
      if (stryMutAct_9fa48("27829")) {
        {}
      } else {
        stryCov_9fa48("27829");
        return null;
      }
    }
    return join(normalizedDataDir, REJOIN_HINTS_FILENAME);
  }
}
async function persistRejoinHintsSnapshot(dataDir, snapshot) {
  if (stryMutAct_9fa48("27830")) {
    {}
  } else {
    stryCov_9fa48("27830");
    const hintsPath = resolveRejoinHintsPath(dataDir);
    if (stryMutAct_9fa48("27833") ? false : stryMutAct_9fa48("27832") ? true : stryMutAct_9fa48("27831") ? hintsPath : (stryCov_9fa48("27831", "27832", "27833"), !hintsPath)) {
      if (stryMutAct_9fa48("27834")) {
        {}
      } else {
        stryCov_9fa48("27834");
        return null;
      }
    }
    const tempPath = (stryMutAct_9fa48("27835") ? `` : (stryCov_9fa48("27835"), `${hintsPath}${REJOIN_HINTS_TEMP_SUFFIX}.`)) + (stryMutAct_9fa48("27836") ? `` : (stryCov_9fa48("27836"), `${process.pid}.${stryMutAct_9fa48("27837") ? rejoinHintsTempSequence-- : (stryCov_9fa48("27837"), rejoinHintsTempSequence++)}`));
    await writeFile(tempPath, stryMutAct_9fa48("27838") ? JSON.stringify(snapshot, null, JSON_INDENT_SPACES) - JSON_LINE_SUFFIX : (stryCov_9fa48("27838"), JSON.stringify(snapshot, null, JSON_INDENT_SPACES) + JSON_LINE_SUFFIX), UTF8_ENCODING);
    await rename(tempPath, hintsPath);
    return snapshot;
  }
}
async function persistBootstrapRejoinHints(options = {}) {
  if (stryMutAct_9fa48("27839")) {
    {}
  } else {
    stryCov_9fa48("27839");
    const snapshot = buildBootstrapRejoinHintsSnapshot(options);
    return persistRejoinHintsSnapshot(options.dataDir, snapshot);
  }
}
async function readRejoinHints(dataDir) {
  if (stryMutAct_9fa48("27840")) {
    {}
  } else {
    stryCov_9fa48("27840");
    const hintsPath = resolveRejoinHintsPath(dataDir);
    if (stryMutAct_9fa48("27843") ? false : stryMutAct_9fa48("27842") ? true : stryMutAct_9fa48("27841") ? hintsPath : (stryCov_9fa48("27841", "27842", "27843"), !hintsPath)) {
      if (stryMutAct_9fa48("27844")) {
        {}
      } else {
        stryCov_9fa48("27844");
        return null;
      }
    }
    try {
      if (stryMutAct_9fa48("27845")) {
        {}
      } else {
        stryCov_9fa48("27845");
        const raw = await readFile(hintsPath, UTF8_ENCODING);
        const parsed = JSON.parse(raw);
        return (stryMutAct_9fa48("27848") ? parsed || typeof parsed === TYPEOF.OBJECT : stryMutAct_9fa48("27847") ? false : stryMutAct_9fa48("27846") ? true : (stryCov_9fa48("27846", "27847", "27848"), parsed && (stryMutAct_9fa48("27850") ? typeof parsed !== TYPEOF.OBJECT : stryMutAct_9fa48("27849") ? true : (stryCov_9fa48("27849", "27850"), typeof parsed === TYPEOF.OBJECT)))) ? parsed : null;
      }
    } catch (_error) {
      if (stryMutAct_9fa48("27851")) {
        {}
      } else {
        stryCov_9fa48("27851");
        return null;
      }
    }
  }
}
function hintsMatchLocalIdentity(hints, nodeId, nodeAddress) {
  if (stryMutAct_9fa48("27852")) {
    {}
  } else {
    stryCov_9fa48("27852");
    if (stryMutAct_9fa48("27855") ? !hints && typeof hints !== TYPEOF.OBJECT : stryMutAct_9fa48("27854") ? false : stryMutAct_9fa48("27853") ? true : (stryCov_9fa48("27853", "27854", "27855"), (stryMutAct_9fa48("27856") ? hints : (stryCov_9fa48("27856"), !hints)) || (stryMutAct_9fa48("27858") ? typeof hints === TYPEOF.OBJECT : stryMutAct_9fa48("27857") ? false : (stryCov_9fa48("27857", "27858"), typeof hints !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("27859")) {
        {}
      } else {
        stryCov_9fa48("27859");
        return stryMutAct_9fa48("27860") ? true : (stryCov_9fa48("27860"), false);
      }
    }
    const normalizedNodeId = normalizeAddress(nodeId);
    const normalizedNodeAddress = normalizeAddress(nodeAddress);
    const hintedNodeId = normalizeAddress(hints.localNodeId);
    const hintedNodeAddress = normalizeAddress(hints.localNodeAddress);
    if (stryMutAct_9fa48("27863") ? normalizedNodeId || hintedNodeId : stryMutAct_9fa48("27862") ? false : stryMutAct_9fa48("27861") ? true : (stryCov_9fa48("27861", "27862", "27863"), normalizedNodeId && hintedNodeId)) {
      if (stryMutAct_9fa48("27864")) {
        {}
      } else {
        stryCov_9fa48("27864");
        return stryMutAct_9fa48("27867") ? normalizedNodeId !== hintedNodeId : stryMutAct_9fa48("27866") ? false : stryMutAct_9fa48("27865") ? true : (stryCov_9fa48("27865", "27866", "27867"), normalizedNodeId === hintedNodeId);
      }
    }
    if (stryMutAct_9fa48("27870") ? normalizedNodeAddress || hintedNodeAddress : stryMutAct_9fa48("27869") ? false : stryMutAct_9fa48("27868") ? true : (stryCov_9fa48("27868", "27869", "27870"), normalizedNodeAddress && hintedNodeAddress)) {
      if (stryMutAct_9fa48("27871")) {
        {}
      } else {
        stryCov_9fa48("27871");
        return stryMutAct_9fa48("27874") ? normalizedNodeAddress !== hintedNodeAddress : stryMutAct_9fa48("27873") ? false : stryMutAct_9fa48("27872") ? true : (stryCov_9fa48("27872", "27873", "27874"), normalizedNodeAddress === hintedNodeAddress);
      }
    }
    return stryMutAct_9fa48("27877") ? !hintedNodeId || !hintedNodeAddress : stryMutAct_9fa48("27876") ? false : stryMutAct_9fa48("27875") ? true : (stryCov_9fa48("27875", "27876", "27877"), (stryMutAct_9fa48("27878") ? hintedNodeId : (stryCov_9fa48("27878"), !hintedNodeId)) && (stryMutAct_9fa48("27879") ? hintedNodeAddress : (stryCov_9fa48("27879"), !hintedNodeAddress)));
  }
}
async function listNodesReplicaDbPaths(dataDir) {
  if (stryMutAct_9fa48("27880")) {
    {}
  } else {
    stryCov_9fa48("27880");
    const hintsPath = resolveRejoinHintsPath(dataDir);
    if (stryMutAct_9fa48("27883") ? false : stryMutAct_9fa48("27882") ? true : stryMutAct_9fa48("27881") ? hintsPath : (stryCov_9fa48("27881", "27882", "27883"), !hintsPath)) {
      if (stryMutAct_9fa48("27884")) {
        {}
      } else {
        stryCov_9fa48("27884");
        return stryMutAct_9fa48("27885") ? ["Stryker was here"] : (stryCov_9fa48("27885"), []);
      }
    }
    const partitionsDir = join(dataDir, PARTITIONS_DIRNAME);
    let partitionEntries = stryMutAct_9fa48("27886") ? ["Stryker was here"] : (stryCov_9fa48("27886"), []);
    try {
      if (stryMutAct_9fa48("27887")) {
        {}
      } else {
        stryCov_9fa48("27887");
        partitionEntries = await readdir(partitionsDir, stryMutAct_9fa48("27888") ? {} : (stryCov_9fa48("27888"), {
          withFileTypes: stryMutAct_9fa48("27889") ? false : (stryCov_9fa48("27889"), true)
        }));
      }
    } catch (_error) {
      if (stryMutAct_9fa48("27890")) {
        {}
      } else {
        stryCov_9fa48("27890");
        return stryMutAct_9fa48("27891") ? ["Stryker was here"] : (stryCov_9fa48("27891"), []);
      }
    }
    const dbPaths = stryMutAct_9fa48("27892") ? ["Stryker was here"] : (stryCov_9fa48("27892"), []);
    for (const entry of partitionEntries) {
      if (stryMutAct_9fa48("27893")) {
        {}
      } else {
        stryCov_9fa48("27893");
        if (stryMutAct_9fa48("27896") ? !entry?.isDirectory?.() && !String(entry.name || EMPTY_STRING).startsWith(NODES_PARTITION_PREFIX) : stryMutAct_9fa48("27895") ? false : stryMutAct_9fa48("27894") ? true : (stryCov_9fa48("27894", "27895", "27896"), (stryMutAct_9fa48("27897") ? entry?.isDirectory?.() : (stryCov_9fa48("27897"), !(stryMutAct_9fa48("27899") ? entry.isDirectory?.() : stryMutAct_9fa48("27898") ? entry?.isDirectory() : (stryCov_9fa48("27898", "27899"), entry?.isDirectory?.())))) || (stryMutAct_9fa48("27900") ? String(entry.name || EMPTY_STRING).startsWith(NODES_PARTITION_PREFIX) : (stryCov_9fa48("27900"), !(stryMutAct_9fa48("27901") ? String(entry.name || EMPTY_STRING).endsWith(NODES_PARTITION_PREFIX) : (stryCov_9fa48("27901"), String(stryMutAct_9fa48("27904") ? entry.name && EMPTY_STRING : stryMutAct_9fa48("27903") ? false : stryMutAct_9fa48("27902") ? true : (stryCov_9fa48("27902", "27903", "27904"), entry.name || EMPTY_STRING)).startsWith(NODES_PARTITION_PREFIX))))))) {
          if (stryMutAct_9fa48("27905")) {
            {}
          } else {
            stryCov_9fa48("27905");
            continue;
          }
        }
        const partitionDir = join(partitionsDir, entry.name);
        let replicaEntries = stryMutAct_9fa48("27906") ? ["Stryker was here"] : (stryCov_9fa48("27906"), []);
        try {
          if (stryMutAct_9fa48("27907")) {
            {}
          } else {
            stryCov_9fa48("27907");
            replicaEntries = await readdir(partitionDir, stryMutAct_9fa48("27908") ? {} : (stryCov_9fa48("27908"), {
              withFileTypes: stryMutAct_9fa48("27909") ? false : (stryCov_9fa48("27909"), true)
            }));
          }
        } catch (_error) {
          if (stryMutAct_9fa48("27910")) {
            {}
          } else {
            stryCov_9fa48("27910");
            continue;
          }
        }
        for (const replicaEntry of replicaEntries) {
          if (stryMutAct_9fa48("27911")) {
            {}
          } else {
            stryCov_9fa48("27911");
            if (stryMutAct_9fa48("27914") ? !replicaEntry?.isFile?.() && !String(replicaEntry.name || EMPTY_STRING).endsWith(SQLITE_DB_SUFFIX) : stryMutAct_9fa48("27913") ? false : stryMutAct_9fa48("27912") ? true : (stryCov_9fa48("27912", "27913", "27914"), (stryMutAct_9fa48("27915") ? replicaEntry?.isFile?.() : (stryCov_9fa48("27915"), !(stryMutAct_9fa48("27917") ? replicaEntry.isFile?.() : stryMutAct_9fa48("27916") ? replicaEntry?.isFile() : (stryCov_9fa48("27916", "27917"), replicaEntry?.isFile?.())))) || (stryMutAct_9fa48("27918") ? String(replicaEntry.name || EMPTY_STRING).endsWith(SQLITE_DB_SUFFIX) : (stryCov_9fa48("27918"), !(stryMutAct_9fa48("27919") ? String(replicaEntry.name || EMPTY_STRING).startsWith(SQLITE_DB_SUFFIX) : (stryCov_9fa48("27919"), String(stryMutAct_9fa48("27922") ? replicaEntry.name && EMPTY_STRING : stryMutAct_9fa48("27921") ? false : stryMutAct_9fa48("27920") ? true : (stryCov_9fa48("27920", "27921", "27922"), replicaEntry.name || EMPTY_STRING)).endsWith(SQLITE_DB_SUFFIX))))))) {
              if (stryMutAct_9fa48("27923")) {
                {}
              } else {
                stryCov_9fa48("27923");
                continue;
              }
            }
            const dbPath = join(partitionDir, replicaEntry.name);
            try {
              if (stryMutAct_9fa48("27924")) {
                {}
              } else {
                stryCov_9fa48("27924");
                const metadata = await stat(dbPath);
                dbPaths.push(stryMutAct_9fa48("27925") ? {} : (stryCov_9fa48("27925"), {
                  dbPath,
                  modifiedAt: stryMutAct_9fa48("27928") ? Number(metadata?.mtimeMs) && NUM.ZERO : stryMutAct_9fa48("27927") ? false : stryMutAct_9fa48("27926") ? true : (stryCov_9fa48("27926", "27927", "27928"), Number(stryMutAct_9fa48("27929") ? metadata.mtimeMs : (stryCov_9fa48("27929"), metadata?.mtimeMs)) || NUM.ZERO)
                }));
              }
            } catch (_error) {
              if (stryMutAct_9fa48("27930")) {
                {}
              } else {
                stryCov_9fa48("27930");
                continue;
              }
            }
          }
        }
      }
    }
    stryMutAct_9fa48("27931") ? dbPaths : (stryCov_9fa48("27931"), dbPaths.sort(stryMutAct_9fa48("27932") ? () => undefined : (stryCov_9fa48("27932"), (left, right) => stryMutAct_9fa48("27933") ? right.modifiedAt + left.modifiedAt : (stryCov_9fa48("27933"), right.modifiedAt - left.modifiedAt))));
    return dbPaths.map(stryMutAct_9fa48("27934") ? () => undefined : (stryCov_9fa48("27934"), entry => entry.dbPath));
  }
}
function readNodesRowsFromReplicaDb(dbPath) {
  if (stryMutAct_9fa48("27935")) {
    {}
  } else {
    stryCov_9fa48("27935");
    let database = null;
    try {
      if (stryMutAct_9fa48("27936")) {
        {}
      } else {
        stryCov_9fa48("27936");
        database = new Database(dbPath, stryMutAct_9fa48("27937") ? {} : (stryCov_9fa48("27937"), {
          readonly: stryMutAct_9fa48("27938") ? false : (stryCov_9fa48("27938"), true),
          fileMustExist: stryMutAct_9fa48("27939") ? false : (stryCov_9fa48("27939"), true)
        }));
        const tableExists = database.prepare(SQL_TABLE_EXISTS).get(SQLITE_TABLE_TYPE, TABLES.NODES);
        if (stryMutAct_9fa48("27942") ? false : stryMutAct_9fa48("27941") ? true : stryMutAct_9fa48("27940") ? tableExists : (stryCov_9fa48("27940", "27941", "27942"), !tableExists)) {
          if (stryMutAct_9fa48("27943")) {
            {}
          } else {
            stryCov_9fa48("27943");
            return stryMutAct_9fa48("27944") ? ["Stryker was here"] : (stryCov_9fa48("27944"), []);
          }
        }
        return database.prepare(SQL_SELECT_NODES).all();
      }
    } catch (_error) {
      if (stryMutAct_9fa48("27945")) {
        {}
      } else {
        stryCov_9fa48("27945");
        return stryMutAct_9fa48("27946") ? ["Stryker was here"] : (stryCov_9fa48("27946"), []);
      }
    } finally {
      if (stryMutAct_9fa48("27947")) {
        {}
      } else {
        stryCov_9fa48("27947");
        stryMutAct_9fa48("27948") ? database.close() : (stryCov_9fa48("27948"), database?.close());
      }
    }
  }
}
async function readDurableNodesTableSnapshot(options = {}) {
  if (stryMutAct_9fa48("27949")) {
    {}
  } else {
    stryCov_9fa48("27949");
    const normalizedNodeId = normalizeAddress(options.nodeId);
    const normalizedNodeAddress = normalizeAddress(options.nodeAddress);
    const dbPaths = await listNodesReplicaDbPaths(options.dataDir);
    const peerAddresses = new Set();
    let clusterNodeCount = NUM.ZERO;
    let hasAnyDurableNodesTable = stryMutAct_9fa48("27950") ? true : (stryCov_9fa48("27950"), false);
    let matchedLocalIdentity = stryMutAct_9fa48("27951") ? true : (stryCov_9fa48("27951"), false);
    for (const dbPath of dbPaths) {
      if (stryMutAct_9fa48("27952")) {
        {}
      } else {
        stryCov_9fa48("27952");
        const rows = readNodesRowsFromReplicaDb(dbPath);
        if (stryMutAct_9fa48("27955") ? !Array.isArray(rows) && rows.length === NUM.ZERO : stryMutAct_9fa48("27954") ? false : stryMutAct_9fa48("27953") ? true : (stryCov_9fa48("27953", "27954", "27955"), (stryMutAct_9fa48("27956") ? Array.isArray(rows) : (stryCov_9fa48("27956"), !Array.isArray(rows))) || (stryMutAct_9fa48("27958") ? rows.length !== NUM.ZERO : stryMutAct_9fa48("27957") ? false : (stryCov_9fa48("27957", "27958"), rows.length === NUM.ZERO)))) {
          if (stryMutAct_9fa48("27959")) {
            {}
          } else {
            stryCov_9fa48("27959");
            continue;
          }
        }
        hasAnyDurableNodesTable = stryMutAct_9fa48("27960") ? false : (stryCov_9fa48("27960"), true);
        clusterNodeCount = stryMutAct_9fa48("27961") ? Math.min(clusterNodeCount, rows.length) : (stryCov_9fa48("27961"), Math.max(clusterNodeCount, rows.length));
        let sawMatchingNodeId = stryMutAct_9fa48("27962") ? true : (stryCov_9fa48("27962"), false);
        let sawMatchingNodeAddress = stryMutAct_9fa48("27963") ? true : (stryCov_9fa48("27963"), false);
        for (const row of rows) {
          if (stryMutAct_9fa48("27964")) {
            {}
          } else {
            stryCov_9fa48("27964");
            const rowNodeId = normalizeAddress(stryMutAct_9fa48("27965") ? (row?.[COLUMN.NODE_ID] ?? row?.node_id) && null : (stryCov_9fa48("27965"), (stryMutAct_9fa48("27966") ? row?.[COLUMN.NODE_ID] && row?.node_id : (stryCov_9fa48("27966"), (stryMutAct_9fa48("27967") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("27967"), row?.[COLUMN.NODE_ID])) ?? (stryMutAct_9fa48("27968") ? row.node_id : (stryCov_9fa48("27968"), row?.node_id)))) ?? null));
            const rowNodeAddress = normalizeAddress(stryMutAct_9fa48("27969") ? (row?.[COLUMN.NODE_ADDRESS] ?? row?.node_address) && null : (stryCov_9fa48("27969"), (stryMutAct_9fa48("27970") ? row?.[COLUMN.NODE_ADDRESS] && row?.node_address : (stryCov_9fa48("27970"), (stryMutAct_9fa48("27971") ? row[COLUMN.NODE_ADDRESS] : (stryCov_9fa48("27971"), row?.[COLUMN.NODE_ADDRESS])) ?? (stryMutAct_9fa48("27972") ? row.node_address : (stryCov_9fa48("27972"), row?.node_address)))) ?? null));
            if (stryMutAct_9fa48("27975") ? normalizedNodeId || rowNodeId === normalizedNodeId : stryMutAct_9fa48("27974") ? false : stryMutAct_9fa48("27973") ? true : (stryCov_9fa48("27973", "27974", "27975"), normalizedNodeId && (stryMutAct_9fa48("27977") ? rowNodeId !== normalizedNodeId : stryMutAct_9fa48("27976") ? true : (stryCov_9fa48("27976", "27977"), rowNodeId === normalizedNodeId)))) {
              if (stryMutAct_9fa48("27978")) {
                {}
              } else {
                stryCov_9fa48("27978");
                sawMatchingNodeId = stryMutAct_9fa48("27979") ? false : (stryCov_9fa48("27979"), true);
              }
            }
            if (stryMutAct_9fa48("27982") ? normalizedNodeAddress || rowNodeAddress === normalizedNodeAddress : stryMutAct_9fa48("27981") ? false : stryMutAct_9fa48("27980") ? true : (stryCov_9fa48("27980", "27981", "27982"), normalizedNodeAddress && (stryMutAct_9fa48("27984") ? rowNodeAddress !== normalizedNodeAddress : stryMutAct_9fa48("27983") ? true : (stryCov_9fa48("27983", "27984"), rowNodeAddress === normalizedNodeAddress)))) {
              if (stryMutAct_9fa48("27985")) {
                {}
              } else {
                stryCov_9fa48("27985");
                sawMatchingNodeAddress = stryMutAct_9fa48("27986") ? false : (stryCov_9fa48("27986"), true);
              }
            }
          }
        }
        const identityMatched = normalizedNodeId ? sawMatchingNodeId : sawMatchingNodeAddress;
        if (stryMutAct_9fa48("27989") ? false : stryMutAct_9fa48("27988") ? true : stryMutAct_9fa48("27987") ? identityMatched : (stryCov_9fa48("27987", "27988", "27989"), !identityMatched)) {
          if (stryMutAct_9fa48("27990")) {
            {}
          } else {
            stryCov_9fa48("27990");
            continue;
          }
        }
        matchedLocalIdentity = stryMutAct_9fa48("27991") ? false : (stryCov_9fa48("27991"), true);
        for (const peerAddress of extractPeerAddresses(rows, normalizedNodeId, normalizedNodeAddress)) {
          if (stryMutAct_9fa48("27992")) {
            {}
          } else {
            stryCov_9fa48("27992");
            peerAddresses.add(peerAddress);
          }
        }
      }
    }
    return stryMutAct_9fa48("27993") ? {} : (stryCov_9fa48("27993"), {
      clusterNodeCount,
      peerAddresses: Array.from(peerAddresses),
      hasDurableNodesTable: hasAnyDurableNodesTable,
      matchedLocalIdentity,
      identityMismatch: stryMutAct_9fa48("27996") ? hasAnyDurableNodesTable || !matchedLocalIdentity : stryMutAct_9fa48("27995") ? false : stryMutAct_9fa48("27994") ? true : (stryCov_9fa48("27994", "27995", "27996"), hasAnyDurableNodesTable && (stryMutAct_9fa48("27997") ? matchedLocalIdentity : (stryCov_9fa48("27997"), !matchedLocalIdentity)))
    });
  }
}
function choosePreferredPeerAddress(peerAddresses, preferredPeerAddresses) {
  if (stryMutAct_9fa48("27998")) {
    {}
  } else {
    stryCov_9fa48("27998");
    const preferredSet = new Set(normalizePeerAddresses(preferredPeerAddresses));
    for (const peerAddress of peerAddresses) {
      if (stryMutAct_9fa48("27999")) {
        {}
      } else {
        stryCov_9fa48("27999");
        if (stryMutAct_9fa48("28001") ? false : stryMutAct_9fa48("28000") ? true : (stryCov_9fa48("28000", "28001"), preferredSet.has(peerAddress))) {
          if (stryMutAct_9fa48("28002")) {
            {}
          } else {
            stryCov_9fa48("28002");
            return peerAddress;
          }
        }
      }
    }
    return stryMutAct_9fa48("28005") ? peerAddresses[NUM.ZERO] && null : stryMutAct_9fa48("28004") ? false : stryMutAct_9fa48("28003") ? true : (stryCov_9fa48("28003", "28004", "28005"), peerAddresses[NUM.ZERO] || null);
  }
}
async function probeRecoverablePeerAddress(peerAddresses, probePeerAddress) {
  if (stryMutAct_9fa48("28006")) {
    {}
  } else {
    stryCov_9fa48("28006");
    if (stryMutAct_9fa48("28009") ? typeof probePeerAddress === TYPEOF.FUNCTION : stryMutAct_9fa48("28008") ? false : stryMutAct_9fa48("28007") ? true : (stryCov_9fa48("28007", "28008", "28009"), typeof probePeerAddress !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("28010")) {
        {}
      } else {
        stryCov_9fa48("28010");
        return null;
      }
    }
    for (const peerAddress of peerAddresses) {
      if (stryMutAct_9fa48("28011")) {
        {}
      } else {
        stryCov_9fa48("28011");
        if (stryMutAct_9fa48("28013") ? false : stryMutAct_9fa48("28012") ? true : (stryCov_9fa48("28012", "28013"), await probePeerAddress(peerAddress))) {
          if (stryMutAct_9fa48("28014")) {
            {}
          } else {
            stryCov_9fa48("28014");
            return peerAddress;
          }
        }
      }
    }
    return null;
  }
}
function resolveDurableStartupSource(context = {}) {
  if (stryMutAct_9fa48("28015")) {
    {}
  } else {
    stryCov_9fa48("28015");
    if (stryMutAct_9fa48("28017") ? false : stryMutAct_9fa48("28016") ? true : (stryCov_9fa48("28016", "28017"), context.hintsIdentityMatched)) {
      if (stryMutAct_9fa48("28018")) {
        {}
      } else {
        stryCov_9fa48("28018");
        return REJOIN_SOURCE.REJOIN_HINTS;
      }
    }
    if (stryMutAct_9fa48("28021") ? context.durableSnapshot.hasDurableNodesTable : stryMutAct_9fa48("28020") ? false : stryMutAct_9fa48("28019") ? true : (stryCov_9fa48("28019", "28020", "28021"), context.durableSnapshot?.hasDurableNodesTable)) {
      if (stryMutAct_9fa48("28022")) {
        {}
      } else {
        stryCov_9fa48("28022");
        return REJOIN_SOURCE.DURABLE_NODES_TABLE;
      }
    }
    return REJOIN_SOURCE.NONE;
  }
}
function resolveDurableJoinSource(context = {}) {
  if (stryMutAct_9fa48("28023")) {
    {}
  } else {
    stryCov_9fa48("28023");
    return context.hintPeerAddresses.includes(context.selectedPeerAddress) ? REJOIN_SOURCE.REJOIN_HINTS : REJOIN_SOURCE.DURABLE_NODES_TABLE;
  }
}
async function collectAutoRejoinDecisionContext(options = {}) {
  if (stryMutAct_9fa48("28024")) {
    {}
  } else {
    stryCov_9fa48("28024");
    const hints = await readRejoinHints(options.dataDir);
    const hintsIdentityMatched = hintsMatchLocalIdentity(hints, options.nodeId, options.nodeAddress);
    const durableSnapshot = await readDurableNodesTableSnapshot(options);
    const hintPeerAddresses = hintsIdentityMatched ? normalizePeerAddresses(stryMutAct_9fa48("28025") ? hints.peerAddresses : (stryCov_9fa48("28025"), hints?.peerAddresses), options.nodeId, options.nodeAddress) : stryMutAct_9fa48("28026") ? ["Stryker was here"] : (stryCov_9fa48("28026"), []);
    const peerAddresses = normalizePeerAddresses(stryMutAct_9fa48("28027") ? [] : (stryCov_9fa48("28027"), [...hintPeerAddresses, ...durableSnapshot.peerAddresses]), options.nodeId, options.nodeAddress);
    const clusterNodeCount = stryMutAct_9fa48("28028") ? Math.min(hintsIdentityMatched ? parseClusterNodeCount(hints?.clusterNodeCount) : NUM.ZERO, durableSnapshot.clusterNodeCount) : (stryCov_9fa48("28028"), Math.max(hintsIdentityMatched ? parseClusterNodeCount(stryMutAct_9fa48("28029") ? hints.clusterNodeCount : (stryCov_9fa48("28029"), hints?.clusterNodeCount)) : NUM.ZERO, durableSnapshot.clusterNodeCount));
    const localNodeRole = hintsIdentityMatched ? normalizeNodeRole(stryMutAct_9fa48("28030") ? hints.localNodeRole : (stryCov_9fa48("28030"), hints?.localNodeRole)) : null;
    const selectedPeerAddress = await probeRecoverablePeerAddress(peerAddresses, options.probePeerAddress);
    const preferredPeerAddress = choosePreferredPeerAddress(peerAddresses, hintPeerAddresses);
    const durableStateDetected = stryMutAct_9fa48("28033") ? (hintsIdentityMatched || durableSnapshot.hasDurableNodesTable) && clusterNodeCount > NUM.ZERO : stryMutAct_9fa48("28032") ? false : stryMutAct_9fa48("28031") ? true : (stryCov_9fa48("28031", "28032", "28033"), (stryMutAct_9fa48("28035") ? hintsIdentityMatched && durableSnapshot.hasDurableNodesTable : stryMutAct_9fa48("28034") ? false : (stryCov_9fa48("28034", "28035"), hintsIdentityMatched || durableSnapshot.hasDurableNodesTable)) || (stryMutAct_9fa48("28038") ? clusterNodeCount <= NUM.ZERO : stryMutAct_9fa48("28037") ? clusterNodeCount >= NUM.ZERO : stryMutAct_9fa48("28036") ? false : (stryCov_9fa48("28036", "28037", "28038"), clusterNodeCount > NUM.ZERO)));
    return stryMutAct_9fa48("28039") ? {} : (stryCov_9fa48("28039"), {
      durableSnapshot,
      hintsIdentityMatched,
      hintPeerAddresses,
      peerAddresses,
      clusterNodeCount,
      localNodeRole,
      selectedPeerAddress,
      preferredPeerAddress,
      durableStateDetected,
      requiresPeerRejoin: deriveRequiresPeerRejoin(stryMutAct_9fa48("28040") ? {} : (stryCov_9fa48("28040"), {
        nodeRole: localNodeRole,
        clusterNodeCount,
        peerAddresses
      }))
    });
  }
}
function resolveAutoRejoinDecisionState(context = {}) {
  if (stryMutAct_9fa48("28041")) {
    {}
  } else {
    stryCov_9fa48("28041");
    if (stryMutAct_9fa48("28043") ? false : stryMutAct_9fa48("28042") ? true : (stryCov_9fa48("28042", "28043"), context.durableSnapshot.identityMismatch)) {
      if (stryMutAct_9fa48("28044")) {
        {}
      } else {
        stryCov_9fa48("28044");
        return AUTO_REJOIN_DECISION_STATE.IDENTITY_MISMATCH;
      }
    }
    if (stryMutAct_9fa48("28047") ? context.localNodeRole !== REJOIN_ROLE_SEED : stryMutAct_9fa48("28046") ? false : stryMutAct_9fa48("28045") ? true : (stryCov_9fa48("28045", "28046", "28047"), context.localNodeRole === REJOIN_ROLE_SEED)) {
      if (stryMutAct_9fa48("28048")) {
        {}
      } else {
        stryCov_9fa48("28048");
        return AUTO_REJOIN_DECISION_STATE.DURABLE_SEED;
      }
    }
    if (stryMutAct_9fa48("28050") ? false : stryMutAct_9fa48("28049") ? true : (stryCov_9fa48("28049", "28050"), context.selectedPeerAddress)) {
      if (stryMutAct_9fa48("28051")) {
        {}
      } else {
        stryCov_9fa48("28051");
        return AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER;
      }
    }
    if (stryMutAct_9fa48("28055") ? context.peerAddresses.length <= NUM.ZERO : stryMutAct_9fa48("28054") ? context.peerAddresses.length >= NUM.ZERO : stryMutAct_9fa48("28053") ? false : stryMutAct_9fa48("28052") ? true : (stryCov_9fa48("28052", "28053", "28054", "28055"), context.peerAddresses.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("28056")) {
        {}
      } else {
        stryCov_9fa48("28056");
        return AUTO_REJOIN_DECISION_STATE.JOIN_RECOVERED_PEER;
      }
    }
    if (stryMutAct_9fa48("28058") ? false : stryMutAct_9fa48("28057") ? true : (stryCov_9fa48("28057", "28058"), context.requiresPeerRejoin)) {
      if (stryMutAct_9fa48("28059")) {
        {}
      } else {
        stryCov_9fa48("28059");
        return AUTO_REJOIN_DECISION_STATE.PEER_REQUIRED_BUT_MISSING;
      }
    }
    return AUTO_REJOIN_DECISION_STATE.FRESH_SEED;
  }
}
function buildAutoRejoinStartupDecision(context = {}, state) {
  if (stryMutAct_9fa48("28060")) {
    {}
  } else {
    stryCov_9fa48("28060");
    switch (state) {
      case AUTO_REJOIN_DECISION_STATE.IDENTITY_MISMATCH:
        if (stryMutAct_9fa48("28061")) {} else {
          stryCov_9fa48("28061");
          return stryMutAct_9fa48("28062") ? {} : (stryCov_9fa48("28062"), {
            state,
            mode: STARTUP_MODE_FAIL,
            peerAddressState: PEER_ADDRESS_STATE.UNAVAILABLE,
            peerAddress: null,
            source: REJOIN_SOURCE.DURABLE_NODES_TABLE,
            startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
            durableStateDetected: stryMutAct_9fa48("28063") ? false : (stryCov_9fa48("28063"), true),
            identityMismatch: stryMutAct_9fa48("28064") ? false : (stryCov_9fa48("28064"), true),
            error: IDENTITY_MISMATCH_ERROR_MESSAGE
          });
        }
      case AUTO_REJOIN_DECISION_STATE.DURABLE_SEED:
        if (stryMutAct_9fa48("28065")) {} else {
          stryCov_9fa48("28065");
          return stryMutAct_9fa48("28066") ? {} : (stryCov_9fa48("28066"), {
            state,
            mode: STARTUP_MODE_SEED,
            peerAddressState: PEER_ADDRESS_STATE.UNAVAILABLE,
            peerAddress: null,
            source: resolveDurableStartupSource(context),
            startupMode: STARTUP_JOIN_MODE.SEED,
            durableStateDetected: context.durableStateDetected,
            identityMismatch: stryMutAct_9fa48("28067") ? true : (stryCov_9fa48("28067"), false)
          });
        }
      case AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER:
        if (stryMutAct_9fa48("28068")) {} else {
          stryCov_9fa48("28068");
          return stryMutAct_9fa48("28069") ? {} : (stryCov_9fa48("28069"), {
            state,
            mode: STARTUP_MODE_JOIN,
            peerAddressState: PEER_ADDRESS_STATE.SELECTED,
            peerAddress: context.selectedPeerAddress,
            source: resolveDurableJoinSource(context),
            startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
            durableStateDetected: stryMutAct_9fa48("28070") ? false : (stryCov_9fa48("28070"), true),
            identityMismatch: stryMutAct_9fa48("28071") ? true : (stryCov_9fa48("28071"), false)
          });
        }
      case AUTO_REJOIN_DECISION_STATE.JOIN_RECOVERED_PEER:
        if (stryMutAct_9fa48("28072")) {} else {
          stryCov_9fa48("28072");
          return stryMutAct_9fa48("28073") ? {} : (stryCov_9fa48("28073"), {
            state,
            mode: STARTUP_MODE_JOIN,
            peerAddressState: PEER_ADDRESS_STATE.SELECTED,
            peerAddress: context.preferredPeerAddress,
            source: (stryMutAct_9fa48("28077") ? context.hintPeerAddresses.length <= NUM.ZERO : stryMutAct_9fa48("28076") ? context.hintPeerAddresses.length >= NUM.ZERO : stryMutAct_9fa48("28075") ? false : stryMutAct_9fa48("28074") ? true : (stryCov_9fa48("28074", "28075", "28076", "28077"), context.hintPeerAddresses.length > NUM.ZERO)) ? REJOIN_SOURCE.REJOIN_HINTS : REJOIN_SOURCE.DURABLE_NODES_TABLE,
            startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
            durableStateDetected: stryMutAct_9fa48("28078") ? false : (stryCov_9fa48("28078"), true),
            identityMismatch: stryMutAct_9fa48("28079") ? true : (stryCov_9fa48("28079"), false)
          });
        }
      case AUTO_REJOIN_DECISION_STATE.PEER_REQUIRED_BUT_MISSING:
        if (stryMutAct_9fa48("28080")) {} else {
          stryCov_9fa48("28080");
          return stryMutAct_9fa48("28081") ? {} : (stryCov_9fa48("28081"), {
            state,
            mode: STARTUP_MODE_FAIL,
            peerAddressState: PEER_ADDRESS_STATE.UNAVAILABLE,
            peerAddress: null,
            source: context.durableSnapshot.hasDurableNodesTable ? REJOIN_SOURCE.DURABLE_NODES_TABLE : REJOIN_SOURCE.REJOIN_HINTS,
            startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
            durableStateDetected: stryMutAct_9fa48("28082") ? false : (stryCov_9fa48("28082"), true),
            identityMismatch: stryMutAct_9fa48("28083") ? true : (stryCov_9fa48("28083"), false),
            error: DURABLE_STATE_REJOIN_REQUIRED_ERROR_MESSAGE
          });
        }
      case AUTO_REJOIN_DECISION_STATE.FRESH_SEED:
        if (stryMutAct_9fa48("28084")) {} else {
          stryCov_9fa48("28084");
          return stryMutAct_9fa48("28085") ? {} : (stryCov_9fa48("28085"), {
            state,
            mode: STARTUP_MODE_SEED,
            peerAddressState: PEER_ADDRESS_STATE.UNAVAILABLE,
            peerAddress: null,
            source: REJOIN_SOURCE.NONE,
            startupMode: STARTUP_JOIN_MODE.SEED,
            durableStateDetected: stryMutAct_9fa48("28086") ? true : (stryCov_9fa48("28086"), false),
            identityMismatch: stryMutAct_9fa48("28087") ? true : (stryCov_9fa48("28087"), false)
          });
        }
      default:
        if (stryMutAct_9fa48("28088")) {} else {
          stryCov_9fa48("28088");
          throw new Error(stryMutAct_9fa48("28089") ? UNKNOWN_AUTO_REJOIN_DECISION_STATE_ERROR_PREFIX - String(state) : (stryCov_9fa48("28089"), UNKNOWN_AUTO_REJOIN_DECISION_STATE_ERROR_PREFIX + String(state)));
        }
    }
  }
}
async function resolveAutoRejoinStartupDecision(options = {}) {
  if (stryMutAct_9fa48("28090")) {
    {}
  } else {
    stryCov_9fa48("28090");
    const decisionContext = await collectAutoRejoinDecisionContext(options);
    const decisionState = resolveAutoRejoinDecisionState(decisionContext);
    return buildAutoRejoinStartupDecision(decisionContext, decisionState);
  }
}
async function resolveAutoRejoinPeerAddress(options = {}) {
  if (stryMutAct_9fa48("28091")) {
    {}
  } else {
    stryCov_9fa48("28091");
    const decision = await resolveAutoRejoinStartupDecision(options);
    if (stryMutAct_9fa48("28094") ? decision.mode !== STARTUP_MODE_FAIL : stryMutAct_9fa48("28093") ? false : stryMutAct_9fa48("28092") ? true : (stryCov_9fa48("28092", "28093", "28094"), decision.mode === STARTUP_MODE_FAIL)) {
      if (stryMutAct_9fa48("28095")) {
        {}
      } else {
        stryCov_9fa48("28095");
        const error = new Error(decision.error);
        error.code = AUTO_REJOIN_REQUIRED_ERROR_CODE;
        throw error;
      }
    }
    return (stryMutAct_9fa48("28098") ? decision.mode === STARTUP_MODE_JOIN || decision.peerAddressState === PEER_ADDRESS_STATE.SELECTED : stryMutAct_9fa48("28097") ? false : stryMutAct_9fa48("28096") ? true : (stryCov_9fa48("28096", "28097", "28098"), (stryMutAct_9fa48("28100") ? decision.mode !== STARTUP_MODE_JOIN : stryMutAct_9fa48("28099") ? true : (stryCov_9fa48("28099", "28100"), decision.mode === STARTUP_MODE_JOIN)) && (stryMutAct_9fa48("28102") ? decision.peerAddressState !== PEER_ADDRESS_STATE.SELECTED : stryMutAct_9fa48("28101") ? true : (stryCov_9fa48("28101", "28102"), decision.peerAddressState === PEER_ADDRESS_STATE.SELECTED)))) ? decision.peerAddress : null;
  }
}
class RejoinHintsPersistenceService {
  constructor(options = {}) {
    if (stryMutAct_9fa48("28103")) {
      {}
    } else {
      stryCov_9fa48("28103");
      this.dataDir = stryMutAct_9fa48("28106") ? options.dataDir && null : stryMutAct_9fa48("28105") ? false : stryMutAct_9fa48("28104") ? true : (stryCov_9fa48("28104", "28105", "28106"), options.dataDir || null);
      this.nodeId = stryMutAct_9fa48("28109") ? options.nodeId && null : stryMutAct_9fa48("28108") ? false : stryMutAct_9fa48("28107") ? true : (stryCov_9fa48("28107", "28108", "28109"), options.nodeId || null);
      this.nodeAddress = stryMutAct_9fa48("28112") ? options.nodeAddress && null : stryMutAct_9fa48("28111") ? false : stryMutAct_9fa48("28110") ? true : (stryCov_9fa48("28110", "28111", "28112"), options.nodeAddress || null);
      this.nodeRole = stryMutAct_9fa48("28115") ? options.nodeRole && null : stryMutAct_9fa48("28114") ? false : stryMutAct_9fa48("28113") ? true : (stryCov_9fa48("28113", "28114", "28115"), options.nodeRole || null);
      this.getSystemTableCache = (stryMutAct_9fa48("28118") ? typeof options.getSystemTableCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("28117") ? false : stryMutAct_9fa48("28116") ? true : (stryCov_9fa48("28116", "28117", "28118"), typeof options.getSystemTableCache === TYPEOF.FUNCTION)) ? options.getSystemTableCache : stryMutAct_9fa48("28119") ? () => undefined : (stryCov_9fa48("28119"), () => null);
      this.now = (stryMutAct_9fa48("28122") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("28121") ? false : stryMutAct_9fa48("28120") ? true : (stryCov_9fa48("28120", "28121", "28122"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("28123") ? () => undefined : (stryCov_9fa48("28123"), () => Date.now());
      this.logger = stryMutAct_9fa48("28126") ? options.logger && console : stryMutAct_9fa48("28125") ? false : stryMutAct_9fa48("28124") ? true : (stryCov_9fa48("28124", "28125", "28126"), options.logger || console);
      this.writeIntervalMs = (stryMutAct_9fa48("28129") ? Number.isFinite(options.writeIntervalMs) || options.writeIntervalMs > NUM.ZERO : stryMutAct_9fa48("28128") ? false : stryMutAct_9fa48("28127") ? true : (stryCov_9fa48("28127", "28128", "28129"), Number.isFinite(options.writeIntervalMs) && (stryMutAct_9fa48("28132") ? options.writeIntervalMs <= NUM.ZERO : stryMutAct_9fa48("28131") ? options.writeIntervalMs >= NUM.ZERO : stryMutAct_9fa48("28130") ? true : (stryCov_9fa48("28130", "28131", "28132"), options.writeIntervalMs > NUM.ZERO)))) ? Math.floor(options.writeIntervalMs) : REJOIN_HINTS_WRITE_INTERVAL_MS;
      this.timer = null;
      this.persistChain = Promise.resolve();
      this.persistSequence = NUM.ZERO;
    }
  }
  start() {
    if (stryMutAct_9fa48("28133")) {
      {}
    } else {
      stryCov_9fa48("28133");
      if (stryMutAct_9fa48("28135") ? false : stryMutAct_9fa48("28134") ? true : (stryCov_9fa48("28134", "28135"), this.timer)) {
        if (stryMutAct_9fa48("28136")) {
          {}
        } else {
          stryCov_9fa48("28136");
          return;
        }
      }
      this.timer = setInterval(() => {
        if (stryMutAct_9fa48("28137")) {
          {}
        } else {
          stryCov_9fa48("28137");
          void this.persistNow();
        }
      }, this.writeIntervalMs);
      if (stryMutAct_9fa48("28140") ? typeof this.timer.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("28139") ? false : stryMutAct_9fa48("28138") ? true : (stryCov_9fa48("28138", "28139", "28140"), typeof this.timer.unref === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("28141")) {
          {}
        } else {
          stryCov_9fa48("28141");
          this.timer.unref();
        }
      }
      void this.persistNow();
    }
  }
  async stop() {
    if (stryMutAct_9fa48("28142")) {
      {}
    } else {
      stryCov_9fa48("28142");
      if (stryMutAct_9fa48("28144") ? false : stryMutAct_9fa48("28143") ? true : (stryCov_9fa48("28143", "28144"), this.timer)) {
        if (stryMutAct_9fa48("28145")) {
          {}
        } else {
          stryCov_9fa48("28145");
          clearInterval(this.timer);
          this.timer = null;
        }
      }
      await this.persistNow();
    }
  }
  async persistNow() {
    if (stryMutAct_9fa48("28146")) {
      {}
    } else {
      stryCov_9fa48("28146");
      const operation = this.persistChain.catch(stryMutAct_9fa48("28147") ? () => undefined : (stryCov_9fa48("28147"), () => null)).then(stryMutAct_9fa48("28148") ? () => undefined : (stryCov_9fa48("28148"), () => this.persistSnapshot()));
      this.persistChain = operation.catch(stryMutAct_9fa48("28149") ? () => undefined : (stryCov_9fa48("28149"), () => null));
      return operation;
    }
  }
  async persistSnapshot() {
    if (stryMutAct_9fa48("28150")) {
      {}
    } else {
      stryCov_9fa48("28150");
      const snapshot = buildRejoinHintsSnapshot(stryMutAct_9fa48("28151") ? {} : (stryCov_9fa48("28151"), {
        systemTableCache: this.getSystemTableCache(),
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        nodeRole: this.nodeRole,
        now: this.now
      }));
      try {
        if (stryMutAct_9fa48("28152")) {
          {}
        } else {
          stryCov_9fa48("28152");
          rejoinHintsTempSequence = stryMutAct_9fa48("28153") ? Math.min(rejoinHintsTempSequence, this.persistSequence) : (stryCov_9fa48("28153"), Math.max(rejoinHintsTempSequence, this.persistSequence));
          const persisted = await persistRejoinHintsSnapshot(this.dataDir, snapshot);
          this.persistSequence = rejoinHintsTempSequence;
          if (stryMutAct_9fa48("28156") ? false : stryMutAct_9fa48("28155") ? true : stryMutAct_9fa48("28154") ? persisted : (stryCov_9fa48("28154", "28155", "28156"), !persisted)) {
            if (stryMutAct_9fa48("28157")) {
              {}
            } else {
              stryCov_9fa48("28157");
              return null;
            }
          }
          return snapshot;
        }
      } catch (error) {
        if (stryMutAct_9fa48("28158")) {
          {}
        } else {
          stryCov_9fa48("28158");
          stryMutAct_9fa48("28159") ? this.logger.warn(REJOIN_HINTS_PERSIST_FAILED_LOG_MESSAGE, {
            nodeId: this.nodeId,
            dataDir: this.dataDir,
            error: error.message
          }) : (stryCov_9fa48("28159"), this.logger.warn?.(REJOIN_HINTS_PERSIST_FAILED_LOG_MESSAGE, stryMutAct_9fa48("28160") ? {} : (stryCov_9fa48("28160"), {
            nodeId: this.nodeId,
            dataDir: this.dataDir,
            error: error.message
          })));
          return null;
        }
      }
    }
  }
}
export { buildBootstrapRejoinHintsSnapshot, buildRejoinHintsSnapshot, persistBootstrapRejoinHints, readRejoinHints, RejoinHintsPersistenceService, resolveAutoRejoinStartupDecision, resolveAutoRejoinPeerAddress };
const ZERO = 0;
const ONE = 1;
const DEFAULT_REPLICA_TARGET = 3;
const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/u;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertIdentifier(value, label) {
  const text = String(value || '');
  if (!IDENTIFIER_PATTERN.test(text)) {
    throw new Error(`${label} must be a simple SQL identifier`);
  }
  return text;
}

function mysqlCommand(endpoint, sql) {
  return [
    'mysql',
    '--protocol=TCP',
    `--host=${endpoint.host}`,
    `--port=${endpoint.port}`,
    '--user=root',
    '--connect-timeout=5',
    '--batch',
    '--skip-column-names',
    '--execute',
    sql,
  ];
}

function storeStatusSql() {
  return [
    'SELECT STORE_ID, ADDRESS, STORE_STATE_NAME',
    'FROM INFORMATION_SCHEMA.TIKV_STORE_STATUS',
    'WHERE STORE_STATE_NAME = \'Up\'',
    'ORDER BY STORE_ID;',
  ].join(' ');
}

function regionPeerPlacementSql(databaseName, tableName) {
  const database = assertIdentifier(databaseName, 'TiDB placement database');
  const table = assertIdentifier(tableName, 'TiDB placement table');
  return [
    'SELECT r.REGION_ID, p.PEER_ID, p.STORE_ID, s.ADDRESS,',
    'p.IS_LEARNER, p.IS_LEADER, p.STATUS',
    'FROM (',
    'SELECT DISTINCT REGION_ID',
    'FROM INFORMATION_SCHEMA.TIKV_REGION_STATUS',
    `WHERE DB_NAME = '${database}'`,
    `AND TABLE_NAME = '${table}'`,
    'AND IS_INDEX = 0',
    ') AS r',
    'JOIN INFORMATION_SCHEMA.TIKV_REGION_PEERS AS p',
    'ON p.REGION_ID = r.REGION_ID',
    'JOIN INFORMATION_SCHEMA.TIKV_STORE_STATUS AS s',
    'ON s.STORE_ID = p.STORE_ID',
    'ORDER BY r.REGION_ID, p.STORE_ID;',
  ].join(' ');
}

function parseStoreRows(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return [];
  return text.split(/\r?\n/u).filter(Boolean).map((line) => {
    const [storeId, address, state] = line.trim().split(/\s+/u);
    return {storeId, address, state};
  });
}

function parsePeerRows(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return [];
  return text.split(/\r?\n/u).filter(Boolean).map((line) => {
    const [
      regionId,
      peerId,
      storeId,
      address,
      isLearner,
      isLeader,
      status,
    ] = line.trim().split(/\s+/u);
    return {
      regionId,
      peerId,
      storeId,
      address,
      isLearner: Number.parseInt(isLearner, 10),
      isLeader: Number.parseInt(isLeader, 10),
      status,
    };
  });
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function normalizeExpectedAddresses(addresses, replicaTarget) {
  if (!Array.isArray(addresses)) {
    throw new Error('TiDB physical placement expected addresses must be an array');
  }
  const normalized = sortedUnique(addresses.map((value) => String(value).trim()));
  if (normalized.length !== replicaTarget || normalized.some((value) => !value)) {
    throw new Error(
      `TiDB physical placement requires ${replicaTarget} distinct expected addresses`,
    );
  }
  return normalized;
}

function groupPeerRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.regionId)) grouped.set(row.regionId, []);
    grouped.get(row.regionId).push(row);
  }
  return [...grouped.entries()]
    .map(([regionId, peers]) => ({regionId, peers}))
    .sort((left, right) => String(left.regionId).localeCompare(String(right.regionId)));
}

function evaluatePhysicalPlacement(options = {}) {
  const replicaTarget = options.replicaTarget ?? DEFAULT_REPLICA_TARGET;
  if (!Number.isInteger(replicaTarget) || replicaTarget < ONE) {
    throw new Error('TiDB physical placement requires positive replicaTarget');
  }
  const expectedAddresses = normalizeExpectedAddresses(
    options.expectedAddresses,
    replicaTarget,
  );
  const stores = Array.isArray(options.stores) ? options.stores : [];
  const peerRows = Array.isArray(options.peers) ? options.peers : [];

  const upStoreAddresses = sortedUnique(
    stores.filter(({state}) => state === 'Up').map(({address}) => address),
  );
  const storesReady =
    upStoreAddresses.length === replicaTarget &&
    JSON.stringify(upStoreAddresses) === JSON.stringify(expectedAddresses);

  const regions = groupPeerRows(peerRows).map(({regionId, peers}) => {
    const addresses = sortedUnique(peers.map(({address}) => address));
    const storeIds = sortedUnique(peers.map(({storeId}) => storeId));
    const learnerCount = peers.reduce(
      (sum, peer) => sum + (peer.isLearner === ONE ? ONE : ZERO),
      ZERO,
    );
    const leaderCount = peers.reduce(
      (sum, peer) => sum + (peer.isLeader === ONE ? ONE : ZERO),
      ZERO,
    );
    const normalCount = peers.reduce(
      (sum, peer) => sum + (peer.status === 'NORMAL' ? ONE : ZERO),
      ZERO,
    );
    const ready =
      peers.length === replicaTarget &&
      storeIds.length === replicaTarget &&
      addresses.length === replicaTarget &&
      JSON.stringify(addresses) === JSON.stringify(expectedAddresses) &&
      learnerCount === ZERO &&
      leaderCount === ONE &&
      normalCount === replicaTarget;
    return {
      regionId,
      peerCount: peers.length,
      storeCount: storeIds.length,
      addresses,
      learnerCount,
      leaderCount,
      normalCount,
      ready,
    };
  });

  return {
    ready: storesReady && regions.length > ZERO && regions.every(({ready}) => ready),
    replicaTarget,
    expectedAddresses,
    storesReady,
    upStores: stores,
    regions,
  };
}

async function waitForPhysicalTablePlacement(options = {}) {
  const provider = options.provider;
  if (!provider || typeof provider.execInContainer !== 'function') {
    throw new Error('TiDB physical placement proof requires provider.execInContainer');
  }
  const clientContainerId = String(options.clientContainerId || '').trim();
  if (!clientContainerId) {
    throw new Error('TiDB physical placement proof requires clientContainerId');
  }
  const endpoint = options.endpoint;
  if (!endpoint?.host || !Number.isInteger(Number(endpoint.port))) {
    throw new Error('TiDB physical placement proof requires endpoint');
  }
  const replicaTarget = options.replicaTarget ?? DEFAULT_REPLICA_TARGET;
  const expectedAddresses = normalizeExpectedAddresses(
    options.expectedAddresses,
    replicaTarget,
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const started = Date.now();
  let attempts = ZERO;
  let lastEvaluation = null;
  let lastStoreResult = null;
  let lastPeerResult = null;

  while (Date.now() - started < timeoutMs) {
    attempts += ONE;
    lastStoreResult = await provider.execInContainer(
      clientContainerId,
      mysqlCommand(endpoint, storeStatusSql()),
    );
    lastPeerResult = await provider.execInContainer(
      clientContainerId,
      mysqlCommand(
        endpoint,
        regionPeerPlacementSql(options.databaseName, options.tableName),
      ),
    );
    if (lastStoreResult?.exitCode === ZERO && lastPeerResult?.exitCode === ZERO) {
      lastEvaluation = evaluatePhysicalPlacement({
        stores: parseStoreRows(lastStoreResult.stdout),
        peers: parsePeerRows(lastPeerResult.stdout),
        expectedAddresses,
        replicaTarget,
      });
      if (lastEvaluation.ready) {
        return {...lastEvaluation, attempts};
      }
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `TiDB physical table placement did not converge within ${timeoutMs}ms; ` +
    `storesExit=${lastStoreResult?.exitCode ?? 'unknown'} ` +
    `peersExit=${lastPeerResult?.exitCode ?? 'unknown'} ` +
    `evaluation=${JSON.stringify(lastEvaluation)}`,
  );
}

export {
  DEFAULT_REPLICA_TARGET as TIDB_REFERENCE_PHYSICAL_REPLICA_TARGET,
  evaluatePhysicalPlacement,
  mysqlCommand as buildTiDbPhysicalMysqlCommand,
  parsePeerRows as parseTiDbPhysicalPeerRows,
  parseStoreRows as parseTiDbPhysicalStoreRows,
  regionPeerPlacementSql as buildTiDbPhysicalRegionPeerPlacementSql,
  storeStatusSql as buildTiDbPhysicalStoreStatusSql,
  waitForPhysicalTablePlacement,
};

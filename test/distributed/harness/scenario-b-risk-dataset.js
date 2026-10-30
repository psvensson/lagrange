import {createHash} from 'node:crypto';

const stringTrim = Function.call.bind(String.prototype.trim);
const stringSlice = Function.call.bind(String.prototype.slice);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);

const SCENARIO_B_ID = 'tidb-distributed-risk-decision';

const SCENARIO_B_DATA_PROFILE = Object.freeze({
  SMOKE: 'smoke',
  RISK: 'risk',
  HEAVY_CORRELATION: 'heavy-correlation',
});

const SCENARIO_B_GRAPH_SHAPE = Object.freeze({
  LOCAL_ONLY: 'local-only',
  ONE_REMOTE_STAGE: 'one-remote-stage',
  SEQUENTIAL: 'sequential',
  FAN_OUT: 'fan-out',
});

const SCENARIO_B_GRAPH_SHAPE_LADDER = Object.freeze([
  SCENARIO_B_GRAPH_SHAPE.LOCAL_ONLY, SCENARIO_B_GRAPH_SHAPE.ONE_REMOTE_STAGE,
  SCENARIO_B_GRAPH_SHAPE.SEQUENTIAL, SCENARIO_B_GRAPH_SHAPE.FAN_OUT,
]);

const PROFILES = Object.freeze({
  [SCENARIO_B_DATA_PROFILE.SMOKE]: Object.freeze({
    profileId: 'smoke', entityCount: 4, eventsPerAccount: 16, eventsPerMerchant: 12,
    eventsPerDevice: 10, eventsPerRelatedAccount: 8, logicalBytesPerEventRow: 128,
  }),
  [SCENARIO_B_DATA_PROFILE.RISK]: Object.freeze({
    profileId: 'risk', entityCount: 8, eventsPerAccount: 64, eventsPerMerchant: 48,
    eventsPerDevice: 40, eventsPerRelatedAccount: 32, logicalBytesPerEventRow: 256,
  }),
  [SCENARIO_B_DATA_PROFILE.HEAVY_CORRELATION]: Object.freeze({
    profileId: 'heavy-correlation', entityCount: 12, eventsPerAccount: 160,
    eventsPerMerchant: 120, eventsPerDevice: 96, eventsPerRelatedAccount: 64,
    logicalBytesPerEventRow: 512,
  }),
});

function getScenarioBProfileConfig(profileId = 'smoke') {
  const resolved = typeof profileId === 'string' ? stringTrim(profileId) : '';
  const key = resolved || 'smoke';
  const cfg = PROFILES[key];
  if (!cfg) {
    throw new Error(`Unsupported Scenario B data profile: ${profileId}`);
  }
  return cfg;
}

function resolveAccountEventRisk(shapeIndex, eIdx) {
  if (shapeIndex === 1) {
    return {riskPoints: 100, flagged: eIdx === 0 ? 1 : 0, crossEntityAlert: 0};
  }
  if (shapeIndex === 2) {
    return {riskPoints: 120, flagged: eIdx < 2 ? 1 : 0, crossEntityAlert: 0};
  }
  if (shapeIndex === 3) {
    return {riskPoints: 400, flagged: 1, crossEntityAlert: 1};
  }
  return {riskPoints: 5, flagged: 0, crossEntityAlert: 0};
}

function appendAccountEvents(accountEvents, idNum, accountId, shapeIndex, cfg, seed, idx) {
  for (let eIdx = 0; eIdx < cfg.eventsPerAccount; eIdx += 1) {
    const {riskPoints, flagged, crossEntityAlert} = resolveAccountEventRisk(shapeIndex, eIdx);
    accountEvents.push(Object.freeze({
      eventId: `ae-${idNum}-${eIdx + 1}`,
      accountId,
      amountCents: 1000 + ((seed + idx * 31 + eIdx * 17) % 9000),
      riskPoints,
      flagged,
      crossEntityAlert,
      byteSize: cfg.logicalBytesPerEventRow,
    }));
  }
}

function appendMerchantEvents(merchantEvents, idNum, merchantId, shapeIndex, cfg, seed, idx) {
  const isHighRisk = shapeIndex === 2 || shapeIndex === 3;
  const merchantRisk = isHighRisk ? 200 : 10;
  const chargeback = isHighRisk ? 1 : 0;
  for (let eIdx = 0; eIdx < cfg.eventsPerMerchant; eIdx += 1) {
    merchantEvents.push(Object.freeze({
      eventId: `me-${idNum}-${eIdx + 1}`,
      merchantId,
      amountCents: 2000 + ((seed + idx * 19 + eIdx * 13) % 5000),
      riskPoints: merchantRisk,
      chargebackFlag: chargeback,
      byteSize: cfg.logicalBytesPerEventRow,
    }));
  }
}

function appendDeviceEvents(deviceEvents, idNum, deviceId, shapeIndex, cfg) {
  const devRisk = shapeIndex >= 2 ? 150 : 15;
  const devFail = shapeIndex >= 2 ? 1 : 0;
  for (let eIdx = 0; eIdx < cfg.eventsPerDevice; eIdx += 1) {
    deviceEvents.push(Object.freeze({
      eventId: `de-${idNum}-${eIdx + 1}`,
      deviceId,
      riskPoints: devRisk,
      failedAuthCount: devFail,
      byteSize: cfg.logicalBytesPerEventRow,
    }));
  }
}

function appendRelatedAccountEvents(
  relatedAccountEvents,
  idNum,
  relatedAccountId,
  shapeIndex,
  cfg,
) {
  const relRisk = shapeIndex === 3 ? 250 : 10;
  const relFlag = shapeIndex === 3 ? 1 : 0;
  for (let eIdx = 0; eIdx < cfg.eventsPerRelatedAccount; eIdx += 1) {
    relatedAccountEvents.push(Object.freeze({
      eventId: `re-${idNum}-${eIdx + 1}`,
      relatedAccountId,
      riskPoints: relRisk,
      flagged: relFlag,
      byteSize: cfg.logicalBytesPerEventRow,
    }));
  }
}

function generateScenarioBRiskDataset(options = {}) {
  const profileId = options.profileId || 'smoke';
  const seed = Number.isInteger(options.seed) ? options.seed : 20261030;
  const cfg = getScenarioBProfileConfig(profileId);

  const accounts = [];
  const accountEvents = [];
  const merchants = [];
  const merchantEvents = [];
  const devices = [];
  const deviceEvents = [];
  const relatedAccounts = [];
  const relatedAccountEvents = [];

  for (let idx = 0; idx < cfg.entityCount; idx += 1) {
    const idNum = idx + 1;
    const shapeIndex = idx % 4;
    const expectedGraphShape = SCENARIO_B_GRAPH_SHAPE_LADDER[shapeIndex];
    const accountId = `acc-${idNum}`;
    const merchantId = `mer-${idNum}`;
    const deviceId = `dev-${idNum}`;
    const relatedAccountId = `rel-${idNum}`;

    accounts.push(Object.freeze({accountId, relatedAccountId, expectedGraphShape}));
    merchants.push(Object.freeze({merchantId, categoryCode: (idx + seed) % 10}));
    devices.push(Object.freeze({deviceId, osFamily: idx % 2 === 0 ? 'linux' : 'ios'}));
    relatedAccounts.push(Object.freeze({relatedAccountId, linkedAccountId: accountId}));

    appendAccountEvents(accountEvents, idNum, accountId, shapeIndex, cfg, seed, idx);
    appendMerchantEvents(merchantEvents, idNum, merchantId, shapeIndex, cfg, seed, idx);
    appendDeviceEvents(deviceEvents, idNum, deviceId, shapeIndex, cfg);
    appendRelatedAccountEvents(relatedAccountEvents, idNum, relatedAccountId, shapeIndex, cfg);
  }

  const tables = Object.freeze({
    accounts: Object.freeze(accounts),
    accountEvents: Object.freeze(accountEvents),
    merchants: Object.freeze(merchants),
    merchantEvents: Object.freeze(merchantEvents),
    devices: Object.freeze(devices),
    deviceEvents: Object.freeze(deviceEvents),
    relatedAccounts: Object.freeze(relatedAccounts),
    relatedAccountEvents: Object.freeze(relatedAccountEvents),
  });

  const totalEventRows = accountEvents.length + merchantEvents.length +
    deviceEvents.length + relatedAccountEvents.length;
  const totalEntityRows = accounts.length + merchants.length +
    devices.length + relatedAccounts.length;
  const totalRows = totalEntityRows + totalEventRows;
  const totalLogicalBytes = totalEventRows * cfg.logicalBytesPerEventRow;

  const datasetSha256 = createHash('sha256').update(JSON.stringify({
    scenarioId: SCENARIO_B_ID,
    profileId: cfg.profileId,
    seed,
    tables,
  })).digest('hex');

  return Object.freeze({
    scenarioId: SCENARIO_B_ID,
    profileId: cfg.profileId,
    seed,
    profileConfig: cfg,
    tables,
    tableStats: Object.freeze({
      totalEntityRows, totalEventRows, totalRows, totalLogicalBytes,
    }),
    datasetSha256,
  });
}

function resolveCandidateAccounts(dataset, rawShape) {
  if (!rawShape || rawShape === 'aggregate-mix') {
    return dataset.tables.accounts;
  }
  if (!arrayIncludes(SCENARIO_B_GRAPH_SHAPE_LADDER, rawShape)) {
    throw new Error(`Unsupported Scenario B target graph shape: ${rawShape}`);
  }
  return arrayFilter(
    dataset.tables.accounts,
    (acc) => acc.expectedGraphShape === rawShape,
  );
}

function buildPlanRequests(candidateAccounts, requestCount) {
  const requests = [];
  for (let i = 0; i < requestCount; i += 1) {
    const acc = candidateAccounts[i % candidateAccounts.length];
    const idNum = stringSlice(acc.accountId, 4);
    requests.push(Object.freeze({
      requestId: `req-${i + 1}`,
      sequenceIndex: i,
      accountId: acc.accountId,
      merchantId: `mer-${idNum}`,
      deviceId: `dev-${idNum}`,
      relatedAccountId: acc.relatedAccountId,
      amountCents: 1500 + ((i * 37) % 4000),
      expectedGraphShape: acc.expectedGraphShape,
    }));
  }
  return requests;
}

function buildScenarioBWorkloadPlan(options = {}) {
  if (!options?.dataset || !options.dataset.datasetSha256) {
    throw new Error('options.dataset with datasetSha256 is required');
  }
  const dataset = options.dataset;
  const requestCount = Number.isInteger(options.requestCount) && options.requestCount > 0 ?
    options.requestCount :
    8;
  const rawShape = typeof options.targetGraphShape === 'string' ?
    stringTrim(options.targetGraphShape) :
    '';

  const candidateAccounts = resolveCandidateAccounts(dataset, rawShape);
  const requests = buildPlanRequests(candidateAccounts, requestCount);

  const targetGraphShape = rawShape || 'aggregate-mix';
  const workloadPlanSha256 = createHash('sha256').update(JSON.stringify({
    scenarioId: SCENARIO_B_ID,
    datasetSha256: dataset.datasetSha256,
    targetGraphShape,
    requests,
  })).digest('hex');

  return Object.freeze({
    scenarioId: SCENARIO_B_ID,
    profileId: dataset.profileId,
    datasetSha256: dataset.datasetSha256,
    targetGraphShape,
    requestCount: requests.length,
    requests: Object.freeze(requests),
    workloadPlanSha256,
  });
}

export {
  SCENARIO_B_ID,
  SCENARIO_B_DATA_PROFILE,
  SCENARIO_B_GRAPH_SHAPE,
  SCENARIO_B_GRAPH_SHAPE_LADDER,
  getScenarioBProfileConfig,
  generateScenarioBRiskDataset,
  buildScenarioBWorkloadPlan,
};

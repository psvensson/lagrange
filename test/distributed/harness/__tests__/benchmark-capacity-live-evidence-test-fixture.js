import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS,
  BENCHMARK_CAPACITY_LIVE_PROVENANCE_PROVIDER,
  BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER,
  BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
} from '../benchmark-capacity-protocol-constants.js';
import {
  createBenchmarkCapacityWindowReceipt,
} from '../benchmark-capacity-window-receipt.js';
import {
  createBenchmarkCapacityCacheResetReceipt,
} from '../benchmark-capacity-cache-reset-receipt.js';
import {
  completeBenchmarkCapacityProtocolResourceWindows,
  inspectBenchmarkCapacityProtocolReport,
} from '../benchmark-capacity-protocol.js';
import {
  createBenchmarkCapacityCleanupReceipt,
  createBenchmarkCapacityLiveProvenanceReceipt,
  createBenchmarkCapacityLiveResetEngagement,
  createBenchmarkCapacityLiveWindowEngagement,
  replayBenchmarkCapacityRawArtifact,
} from '../benchmark-capacity-raw-artifact.js';
import {
  createBenchmarkCapacityPostgresqlObservedSql,
  createBenchmarkCapacityPostgresqlOutcomeMarker,
  inspectBenchmarkCapacityExternalOperationOccurrences,
} from '../benchmark-capacity-live-observation-authority.js';

const execFileAsync = promisify(execFile);

function sampleByDigest(report) {
  return new Map(
    [...report.warmupSamples, ...report.rawSamples]
      .map((sample) => [sample.sampleDigest, sample]),
  );
}

function liveWindowLog(preregistration, engagement, correctCount) {
  const entries = [];
  const prefix = `${preregistration.executionIdentity.runId}-` +
    `${engagement.sideId}-${engagement.blockIndex}-` +
    `${engagement.blockedOrderIndex}-${engagement.offeredLoad}-` +
    `${engagement.phase}-`;
  for (let operationIndex = 0;
    operationIndex < correctCount;
    operationIndex += 1) {
    const marker = createBenchmarkCapacityPostgresqlOutcomeMarker({
      kind: 'window',
      runId: preregistration.executionIdentity.runId,
      blockIndex: engagement.blockIndex,
      blockedOrderIndex: engagement.blockedOrderIndex,
      sideId: engagement.sideId,
      phase: engagement.phase,
      offeredLoad: engagement.offeredLoad,
      operationIndex,
      command: 'INSERT',
      rowCount: 1,
    });
    entries.push({
      operationIndex,
      sql: createBenchmarkCapacityPostgresqlObservedSql({
        sql: `INSERT ${prefix}${operationIndex}`,
        outcomeMarker: marker,
        expectedRowCount: 1,
        sleepSeconds: 0.04,
      }),
      command: 'INSERT',
      rowCount: 1,
    });
  }
  return JSON.stringify({
    version: BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
    issuer: BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.MANAGED_POSTGRESQL,
    blockIndex: engagement.blockIndex,
    blockedOrderIndex: engagement.blockedOrderIndex,
    sideId: engagement.sideId,
    phase: engagement.phase,
    offeredLoad: engagement.offeredLoad,
    entries,
  });
}

function liveResetLog(engagement) {
  const marker = createBenchmarkCapacityPostgresqlOutcomeMarker({
    kind: 'reset',
    runId: engagement.runId,
    blockIndex: engagement.blockIndex,
    blockedOrderIndex: engagement.blockedOrderIndex,
    sideId: engagement.sideId,
    phase: engagement.phase,
    offeredLoad: engagement.offeredLoad,
    operationIndex: null,
    command: 'TRUNCATE',
    rowCount: 0,
  });
  return JSON.stringify({
    version: BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
    issuer: BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.MANAGED_POSTGRESQL,
    blockIndex: engagement.blockIndex,
    blockedOrderIndex: engagement.blockedOrderIndex,
    sideId: engagement.sideId,
    phase: engagement.phase,
    offeredLoad: engagement.offeredLoad,
    sql: createBenchmarkCapacityPostgresqlObservedSql({
      sql: 'TRUNCATE fixture_table',
      outcomeMarker: marker,
      expectedRowCount: 0,
      sleepSeconds: null,
    }),
    command: 'TRUNCATE',
    rowCount: 0,
  });
}

function replaceWindowEvidence(preregistration, report, engagements) {
  const samples = sampleByDigest(report);
  const replaced = [];
  for (let index = 0; index < engagements.length; index += 1) {
    const prior = engagements[index];
    const sample = samples.get(prior.capacitySampleDigest);
    const engagement = createBenchmarkCapacityLiveWindowEngagement({
      blockIndex: prior.blockIndex,
      blockedOrderIndex: prior.blockedOrderIndex,
      sideId: prior.sideId,
      phase: prior.phase,
      offeredLoad: prior.offeredLoad,
      startedAt: prior.startedAt,
      endedAt: prior.endedAt,
      operationLogText: liveWindowLog(
        preregistration,
        prior,
        sample.counts.correct,
      ),
    }, sample, preregistration);
    const receipt = report.windowReceipts[index];
    report.windowReceipts[index] = createBenchmarkCapacityWindowReceipt({
      blockIndex: receipt.blockIndex,
      blockedOrderIndex: receipt.blockedOrderIndex,
      sideId: receipt.sideId,
      phase: receipt.phase,
      offeredLoad: receipt.offeredLoad,
      startedAt: receipt.startedAt,
      endedAt: receipt.endedAt,
      capacitySampleDigest: receipt.capacitySampleDigest,
      semanticReceiptDigest: receipt.semanticReceiptDigest,
      liveEngagementDigest: engagement.liveEngagementDigest,
      resourceWindowDigest: receipt.resourceWindowDigest,
    }, sample, preregistration);
    replaced.push(engagement);
  }
  return replaced;
}

function replaceResetEvidence(preregistration, report, engagements) {
  const replaced = [];
  for (let index = 0; index < engagements.length; index += 1) {
    const prior = engagements[index];
    const engagement = createBenchmarkCapacityLiveResetEngagement({
      blockIndex: prior.blockIndex,
      blockedOrderIndex: prior.blockedOrderIndex,
      sideId: prior.sideId,
      offeredLoad: prior.offeredLoad,
      startedAt: prior.startedAt,
      endedAt: prior.endedAt,
      operationLogText: liveResetLog(prior),
    }, preregistration);
    const receipt = report.cacheResetReceipts[index];
    report.cacheResetReceipts[index] =
      createBenchmarkCapacityCacheResetReceipt({
        blockIndex: receipt.blockIndex,
        blockedOrderIndex: receipt.blockedOrderIndex,
        sideId: receipt.sideId,
        offeredLoad: receipt.offeredLoad,
        startedAt: receipt.startedAt,
        endedAt: receipt.endedAt,
        policy: receipt.policy,
        liveEngagementDigest: engagement.liveEngagementDigest,
      }, preregistration);
    replaced.push(engagement);
  }
  return replaced;
}

function reportWithReplacedReceipts(source) {
  const report = structuredClone(source);
  const body = {...report};
  delete body.reportDigest;
  report.reportDigest = digestBenchmarkSemanticData(body);
  return report;
}

function selfAuthoredWindowObservationRecord(engagement) {
  return {
    request: {
      runId: engagement.runId,
      liveEngagementDigest: engagement.liveEngagementDigest,
      capacitySampleDigest: engagement.capacitySampleDigest,
      blockIndex: engagement.blockIndex,
      blockedOrderIndex: engagement.blockedOrderIndex,
      sideId: engagement.sideId,
      phase: engagement.phase,
      offeredLoad: engagement.offeredLoad,
    },
    text: engagement.operationLogText,
  };
}

function selfAuthoredResetObservationRecord(engagement) {
  return {
    request: {
      runId: engagement.runId,
      liveEngagementDigest: engagement.liveEngagementDigest,
      blockIndex: engagement.blockIndex,
      blockedOrderIndex: engagement.blockedOrderIndex,
      sideId: engagement.sideId,
      phase: engagement.phase,
      offeredLoad: engagement.offeredLoad,
    },
    text: engagement.operationLogText,
  };
}

function selfAuthoredObservationReceipt(
  liveEvidence,
  liveObservation,
  cleanupObservation,
) {
  const observationText = JSON.stringify({
    version: 'benchmark-capacity-live-observation-payload-v1',
    liveObservation,
    cleanupObservation,
    containerLogText: liveEvidence.containerLogText,
    windowOperationLogs: liveEvidence.windowEngagements.map(
      selfAuthoredWindowObservationRecord,
    ),
    resetOperationLogs: liveEvidence.resetEngagements.map(
      selfAuthoredResetObservationRecord,
    ),
  });
  const bytes = Buffer.from(observationText, 'utf8');
  return {
    version: 'benchmark-capacity-live-observation-receipt-v1',
    issuer: 'benchmark-capacity-managed-postgresql-observer-v1',
    observationByteLength: bytes.byteLength,
    observationByteDigest:
      `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    observationText,
  };
}

export function createExternallyObservedFixture(
  preregistration,
  reportAndEngagements,
  syntheticEvidence,
) {
  const mutableReport = structuredClone(reportAndEngagements.report);
  const windowEngagements = replaceWindowEvidence(
    preregistration,
    mutableReport,
    reportAndEngagements.windowEngagements,
  );
  const resetEngagements = replaceResetEvidence(
    preregistration,
    mutableReport,
    reportAndEngagements.resetEngagements,
  );
  const report = reportWithReplacedReceipts(mutableReport);
  const liveObservation = {
    runId: preregistration.executionIdentity.runId,
    provider: BENCHMARK_CAPACITY_LIVE_PROVENANCE_PROVIDER,
    observedAt: 2_000_000,
    containerId: 'fixture-observed-container',
    containerImageId: syntheticEvidence.imageId,
    containerRunning: true,
    containerLabelsDigest:
      digestBenchmarkSemanticData({fixture: 'observed'}),
    networkId: 'fixture-observed-network',
    networkName: 'fixture-observed-network-name',
    networkObservedId: 'fixture-observed-network',
    networkObservedName: 'fixture-observed-network-name',
  };
  const provenanceReceipt =
    createBenchmarkCapacityLiveProvenanceReceipt(liveObservation);
  const latestEnd = Math.max(
    ...windowEngagements.map((engagement) => engagement.endedAt),
    ...resetEngagements.map((engagement) => engagement.endedAt),
  );
  const cleanupObservation = {
    runId: preregistration.executionIdentity.runId,
    liveEnvironmentContractDigest:
      preregistration.executionIdentity.liveEnvironmentContractDigest,
    provenanceReceiptDigest: provenanceReceipt.provenanceReceiptDigest,
    provider: BENCHMARK_CAPACITY_LIVE_PROVENANCE_PROVIDER,
    containerId: liveObservation.containerId,
    containerLookup: 'absent',
    networkId: liveObservation.networkId,
    networkName: liveObservation.networkName,
    networkLookup: 'absent',
    containerAbsent: true,
    networkAbsent: true,
    completedAt: latestEnd + 1,
  };
  const cleanupReceipt =
    createBenchmarkCapacityCleanupReceipt(cleanupObservation);
  const liveEvidence = {
    ...syntheticEvidence,
    reportDigest: report.reportDigest,
    evidenceClass:
      BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.EXTERNALLY_OBSERVED,
    provenanceReceipt,
    engagementOnly: false,
    comparativeClaimEligible: true,
    reason: 'terminal_measured_capacity_protocol',
    windowEngagements,
    resetEngagements,
    cleanupReceipt,
  };
  liveEvidence.observationReceipt = selfAuthoredObservationReceipt(
    liveEvidence,
    liveObservation,
    cleanupObservation,
  );
  const windowLogs = new Map(windowEngagements.map((engagement) => [
    engagement.liveEngagementDigest,
    engagement.operationLogText,
  ]));
  const resetLogs = new Map(resetEngagements.map((engagement) => [
    engagement.liveEngagementDigest,
    engagement.operationLogText,
  ]));
  const selfAuthoredAuthorityImpostor = {
    async resolveLiveObservation() {
      return liveObservation;
    },
    async resolveCleanupObservation() {
      return cleanupObservation;
    },
    async resolveWindowOperationLog(request) {
      return windowLogs.get(request.liveEngagementDigest);
    },
    async resolveResetOperationLog(request) {
      return resetLogs.get(request.liveEngagementDigest);
    },
  };
  return {
    report,
    liveEvidence,
    liveObservation,
    cleanupObservation,
    selfAuthoredAuthorityImpostor,
  };
}

export function rebuildExternallyObservedFixtureWithForgedLog(
  preregistration,
  observed,
) {
  const report = structuredClone(observed.report);
  const liveEvidence = structuredClone(observed.liveEvidence);
  const prior = liveEvidence.windowEngagements[0];
  const log = JSON.parse(prior.operationLogText);
  log.entries[0].sql += ' forged-but-well-shaped';
  const sample = sampleByDigest(report).get(prior.capacitySampleDigest);
  const engagement = createBenchmarkCapacityLiveWindowEngagement({
    blockIndex: prior.blockIndex,
    blockedOrderIndex: prior.blockedOrderIndex,
    sideId: prior.sideId,
    phase: prior.phase,
    offeredLoad: prior.offeredLoad,
    startedAt: prior.startedAt,
    endedAt: prior.endedAt,
    operationLogText: JSON.stringify(log),
  }, sample, preregistration);
  const receipt = report.windowReceipts[0];
  report.windowReceipts[0] = createBenchmarkCapacityWindowReceipt({
    blockIndex: receipt.blockIndex,
    blockedOrderIndex: receipt.blockedOrderIndex,
    sideId: receipt.sideId,
    phase: receipt.phase,
    offeredLoad: receipt.offeredLoad,
    startedAt: receipt.startedAt,
    endedAt: receipt.endedAt,
    capacitySampleDigest: receipt.capacitySampleDigest,
    semanticReceiptDigest: receipt.semanticReceiptDigest,
    liveEngagementDigest: engagement.liveEngagementDigest,
    resourceWindowDigest: receipt.resourceWindowDigest,
  }, sample, preregistration);
  const reportBody = {...report};
  delete reportBody.reportDigest;
  report.reportDigest = digestBenchmarkSemanticData(reportBody);
  liveEvidence.reportDigest = report.reportDigest;
  liveEvidence.windowEngagements[0] = engagement;
  return {report, liveEvidence};
}

function externalOutcomeMarker(kind, engagement, entry) {
  return createBenchmarkCapacityPostgresqlOutcomeMarker({
    kind,
    runId: engagement.runId,
    blockIndex: engagement.blockIndex,
    blockedOrderIndex: engagement.blockedOrderIndex,
    sideId: engagement.sideId,
    phase: engagement.phase,
    offeredLoad: engagement.offeredLoad,
    operationIndex: entry.operationIndex,
    command: entry.command,
    rowCount: entry.rowCount,
  });
}

function externalPostgresqlPrefix(sequence) {
  const milliseconds = `${sequence % 1000}`.padStart(3, '0');
  const processId = 97 + Math.floor(sequence / 1000);
  return `2026-07-27 13:56:47.${milliseconds} UTC ` +
    `[${processId}] LOG:  `;
}

export function externalPostgresqlLogRecord(
  payload,
  sequence,
  continuationTabs = false,
) {
  const normalized = continuationTabs ?
    payload.replaceAll('\n', '\n\t') :
    payload;
  return `${externalPostgresqlPrefix(sequence)}${normalized}`;
}

function appendExternalOccurrences(
  lines,
  kind,
  engagement,
  entry,
  sequence,
) {
  lines.push(externalPostgresqlLogRecord(
    `statement: ${entry.sql}`,
    sequence.value,
    true,
  ));
  sequence.value += 1;
  lines.push(externalPostgresqlLogRecord(
    externalOutcomeMarker(kind, engagement, entry),
    sequence.value,
  ));
  sequence.value += 1;
}

export function externalOperationOccurrenceLog(liveEvidence) {
  const lines = [];
  const sequence = {value: 0};
  for (let index = 0;
    index < liveEvidence.windowEngagements.length;
    index += 1) {
    const engagement = liveEvidence.windowEngagements[index];
    const log = JSON.parse(engagement.operationLogText);
    for (let entryIndex = 0;
      entryIndex < log.entries.length;
      entryIndex += 1) {
      appendExternalOccurrences(
        lines,
        'window',
        engagement,
        log.entries[entryIndex],
        sequence,
      );
    }
  }
  for (let index = 0;
    index < liveEvidence.resetEngagements.length;
    index += 1) {
    const engagement = liveEvidence.resetEngagements[index];
    const log = JSON.parse(engagement.operationLogText);
    appendExternalOccurrences(
      lines,
      'reset',
      engagement,
      {...log, operationIndex: null},
      sequence,
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function replayInSpawnedFreshProcess(receipt) {
  const moduleUrl = new URL(
    '../benchmark-capacity-raw-artifact.js',
    import.meta.url,
  ).href;
  const source =
    'import {replayBenchmarkCapacityRawArtifact as replay} from ' +
    `${JSON.stringify(moduleUrl)};` +
    'const receipt=JSON.parse(Buffer.from(' +
    'process.env.LAGRANGE_CAPACITY_TEST_RECEIPT,\'base64\')' +
    '.toString(\'utf8\'));' +
    'const result=await replay(receipt);' +
    'process.stdout.write(JSON.stringify(' +
      '{valid:result.valid,reason:result.reason}));';
  const encoded = Buffer.from(JSON.stringify(receipt), 'utf8')
    .toString('base64');
  const {stdout} = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', source],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        LAGRANGE_CAPACITY_TEST_RECEIPT: encoded,
      },
    },
  );
  return JSON.parse(stdout);
}

export function completeResourceWindowsUnderHostileMap(
  report,
  preregistration,
  completions,
) {
  const mapPrototype = Object.getPrototypeOf(new Map());
  const descriptor = Object.getOwnPropertyDescriptor(mapPrototype, 'has');
  try {
    Object.defineProperty(mapPrototype, 'has', {
      configurable: true,
      value: () => false,
    });
    const completed = completeBenchmarkCapacityProtocolResourceWindows(
      report,
      preregistration,
      completions,
    );
    return inspectBenchmarkCapacityProtocolReport(
      completed,
      preregistration,
    ).valid;
  } finally {
    Object.defineProperty(mapPrototype, 'has', descriptor);
  }
}

export async function replayUnderHostileIntrinsics(receipt) {
  const mapPrototype = Object.getPrototypeOf(new Map());
  const baselineTargets = [
    ['string.slice', String.prototype, 'slice', () => ''],
    ['regexp.exec', RegExp.prototype, 'exec', () => null],
    ['array.some', Array.prototype, 'some', () => false],
    ['map.has', mapPrototype, 'has', () => false],
    ['map.get', mapPrototype, 'get', () => undefined],
    ['json.stringify', JSON, 'stringify', () => 'hostile'],
  ];
  const additionalTargets = [
    ['string.split', String.prototype, 'split', () => []],
    ['array.find', Array.prototype, 'find', () => undefined],
    ['array.join', Array.prototype, 'join', () => ''],
    ['array.push', Array.prototype, 'push', () => 0],
    [
      'map.values',
      mapPrototype,
      'values',
      () => [][Symbol.iterator](),
    ],
  ];
  const scenarios = [
    ['baseline', baselineTargets],
    ...additionalTargets.map((target) => [target[0], [target]]),
    ['combined', [...baselineTargets, ...additionalTargets]],
  ];
  const failures = [];
  for (let scenarioIndex = 0;
    scenarioIndex < scenarios.length;
    scenarioIndex += 1) {
    const [label, targets] = scenarios[scenarioIndex];
    const descriptors = targets.map((entry) =>
      Object.getOwnPropertyDescriptor(entry[1], entry[2]));
    try {
      for (let index = 0; index < targets.length; index += 1) {
        Object.defineProperty(targets[index][1], targets[index][2], {
          configurable: true,
          value: targets[index][3],
        });
      }
      const replay = await replayBenchmarkCapacityRawArtifact(receipt);
      if (!replay.valid) {
        failures[failures.length] = {label, reason: replay.reason};
      }
    } finally {
      for (let index = 0; index < targets.length; index += 1) {
        Object.defineProperty(
          targets[index][1],
          targets[index][2],
          descriptors[index],
        );
      }
    }
  }
  return failures;
}

export function inspectOperationOccurrencesUnderHostileIntrinsics(
  options,
  containerLogText,
) {
  const mapPrototype = Object.getPrototypeOf(new Map());
  const targets = [
    [String.prototype, 'split', () => []],
    [Array.prototype, 'join', () => ''],
    [Array.prototype, 'push', () => 0],
    [mapPrototype, 'values', () => [][Symbol.iterator]()],
  ];
  const descriptors = targets.map(([target, key]) =>
    Object.getOwnPropertyDescriptor(target, key));
  try {
    for (let index = 0; index < targets.length; index += 1) {
      Object.defineProperty(targets[index][0], targets[index][1], {
        configurable: true,
        value: targets[index][2],
      });
    }
    return inspectBenchmarkCapacityExternalOperationOccurrences(
      options,
      containerLogText,
    );
  } finally {
    for (let index = 0; index < targets.length; index += 1) {
      Object.defineProperty(
        targets[index][0],
        targets[index][1],
        descriptors[index],
      );
    }
  }
}

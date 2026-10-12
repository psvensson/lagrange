import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const questRoot = new URL('../', import.meta.url);
const outputPath = fileURLToPath(new URL(
  './begin-round14-active-transport-recovery-feasibility.json',
  import.meta.url));
const subjectPath = fileURLToPath(new URL(
  './design-query-begin-uncertain-insert-resolution-2026-10-11.md',
  questRoot));
const predecessorPath = fileURLToPath(new URL(
  './evidence/design-query-begin-uncertain-insert-resolution-round13-0e0102dc.md',
  questRoot));
const round13Path = fileURLToPath(new URL(
  './begin-round13-router-native-feasibility.json', import.meta.url));
const valuesPath = fileURLToPath(new URL(
  '../../../../charts/lagrange-node/values.yaml', import.meta.url));
const membershipPath = fileURLToPath(new URL(
  '../../../../src/raft/raft-committed-membership-constants.js',
  import.meta.url));
const reviewPath = '/mnt/data/peter/projects/.worktrees/' +
  'rs-raft-candidate-20261011/test-output/continuation-20261011/' +
  'review-begin-uncertain-design-round13-independent.md';
const adversePath = '/mnt/data/peter/projects/.worktrees/' +
  'rs-raft-candidate-20261011/test-output/continuation-20261011/' +
  'begin-design-round13-independent/independent-adverse-schedules.json';

const MiB = 1024 * 1024;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileSha256(path) {
  return sha256(readFileSync(path));
}

function checkedAdd(...values) {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 ||
        !Number.isSafeInteger(total + value)) {
      throw new RangeError('active transport equation overflow');
    }
    total += value;
  }
  return total;
}

function checkedMultiply(left, right) {
  const result = left * right;
  if (!Number.isSafeInteger(left) || left < 0 ||
      !Number.isSafeInteger(right) || right < 0 ||
      !Number.isSafeInteger(result)) {
    throw new RangeError('active transport equation overflow');
  }
  return result;
}

const subject = readFileSync(subjectPath);
const predecessor = readFileSync(predecessorPath);
assert.deepEqual(subject.subarray(0, predecessor.length), predecessor);
assert.equal(fileSha256(predecessorPath),
  '0e0102dcc105c1cdef66b9a5537cdef2c78b10d04fdec0021736d91422f04265');
assert.equal(fileSha256(reviewPath),
  'e14083a2c92aa469c22865de4169ebaf7d038ec23a54ebba2e1750be232394e2');

const valuesSource = readFileSync(valuesPath, 'utf8');
assert.match(valuesSource, /maxOldSpaceSizeMb:\s*1536/);
assert.match(valuesSource, /memory:\s*2Gi/g);
const hardNodeBytes = 2048 * MiB;
const v8OldSpaceBytes = 1536 * MiB;
const nonV8Bytes = hardNodeBytes - v8OldSpaceBytes;

const applicationV8Bytes = 512 * MiB;
const routerV8Bytes = 1024 * MiB;
const routerExternalFrameBytes = 256 * MiB;
const routerConnectionControlBytes = 64 * MiB;
const nonRouterNativeSafetyBytes = 192 * MiB;
assert.equal(checkedAdd(applicationV8Bytes, routerV8Bytes),
  v8OldSpaceBytes);
assert.equal(checkedAdd(
  routerExternalFrameBytes,
  routerConnectionControlBytes,
  nonRouterNativeSafetyBytes,
), nonV8Bytes);
assert.equal(checkedAdd(v8OldSpaceBytes, nonV8Bytes), hardNodeBytes);

const recoveryV8Bytes = MiB;
const recoveryExternalBytes = MiB;
const sharedV8Bytes = 512 * MiB;
const completionV8Bytes = routerV8Bytes - sharedV8Bytes - recoveryV8Bytes;
const sharedExternalBytes = 128 * MiB;
const completionExternalBytes =
  routerExternalFrameBytes - sharedExternalBytes - recoveryExternalBytes;
assert.equal(checkedAdd(
  sharedV8Bytes, completionV8Bytes, recoveryV8Bytes), routerV8Bytes);
assert.equal(checkedAdd(
  sharedExternalBytes,
  completionExternalBytes,
  recoveryExternalBytes,
), routerExternalFrameBytes);

const primaryFrameBytes = 100 * MiB;
const jsParsePeakBytes = checkedMultiply(4, primaryFrameBytes);
const handlerGraphBytes = checkedMultiply(2, primaryFrameBytes);
const serializerJsBytes = checkedMultiply(2, primaryFrameBytes);
const rawProviderBytes = primaryFrameBytes;
const sharedProviderOverheadBytes = sharedExternalBytes - rawProviderBytes;
const completionProviderOverheadBytes =
  completionExternalBytes - rawProviderBytes;
assert(jsParsePeakBytes <= sharedV8Bytes);
assert(jsParsePeakBytes <= completionV8Bytes);
assert(checkedAdd(handlerGraphBytes, serializerJsBytes) <= sharedV8Bytes);
assert(sharedProviderOverheadBytes >= 0);
assert(completionProviderOverheadBytes >= 0);

// Candidate fixed-root coefficient for the feasibility model. The design
// makes its exact pinned-provider measurement a source-entry ratchet.
const measuredConnectionRootUpperBoundModel = MiB;
const physicalEndpointTokens = Math.floor(
  routerConnectionControlBytes / measuredConnectionRootUpperBoundModel);
const reservedEndpointTokens = Object.freeze({
  selfClientAndServer: 2,
  recoveryTarget: 1,
  synchronousRefusalScratch: 1,
});
const sharedEndpointTokens = physicalEndpointTokens - checkedAdd(
  ...Object.values(reservedEndpointTokens));
assert.equal(physicalEndpointTokens, 64);
assert.equal(sharedEndpointTokens, 60);

const membershipSource = readFileSync(membershipPath, 'utf8');
assert.match(membershipSource,
  /control-plane data, not an allocation surface/);
const logicalIdentityRotation = [];
for (let id = 0; id < physicalEndpointTokens * 2; id++) {
  logicalIdentityRotation.push({
    logicalId: `peer-${id}`,
    physicalSlot: id % sharedEndpointTokens,
    priorSlotGenerationDrained: id < sharedEndpointTokens ? null : id,
  });
}
assert.equal(new Set(logicalIdentityRotation.map((row) => row.logicalId)).size,
  physicalEndpointTokens * 2);
assert(logicalIdentityRotation.every(
  (row) => row.physicalSlot < sharedEndpointTokens));

const memory = {
  shippedProfile: {
    hardNodeBytes,
    v8OldSpaceBytes,
    nonV8Bytes,
    profileSourceSha256: sha256(valuesSource),
  },
  partitions: {
    applicationV8Bytes,
    routerV8Bytes,
    routerExternalFrameBytes,
    routerConnectionControlBytes,
    nonRouterNativeSafetyBytes,
  },
  activeFrameSubclaims: {
    shared: {v8Bytes: sharedV8Bytes, externalBytes: sharedExternalBytes},
    completion: {
      v8Bytes: completionV8Bytes,
      externalBytes: completionExternalBytes,
    },
    recovery: {
      v8Bytes: recoveryV8Bytes,
      externalBytes: recoveryExternalBytes,
    },
  },
  maximumFrameModel: {
    primaryFrameBytes,
    jsParsePeakBytes,
    handlerGraphBytes,
    serializerJsBytes,
    sharedProviderOverheadBytes,
    completionProviderOverheadBytes,
    maximumFrameStillSupported: true,
    exactCoefficientMeasurementRequired: true,
  },
  activePopulation: {
    membershipValidationBoundUsedAsAllocationAuthority: false,
    measuredConnectionRootUpperBoundModel,
    physicalEndpointTokens,
    reservedEndpointTokens,
    sharedEndpointTokens,
    logicalIdentitiesDemonstrated: logicalIdentityRotation.length,
    logicalIdCapAdded: false,
    logicalIdentityRotation,
  },
};

function jsonEscapedStringBytes(value) {
  // Diagnostic implementation for ordinary BMP strings used by the prior
  // alias schedule. Production needs the complete canonical scalar walker.
  let bytes = 2;
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === 0x22 || code === 0x5c) bytes += 2;
    else if (code <= 0x1f) bytes += 6;
    else bytes += Buffer.byteLength(character);
  }
  return bytes;
}

function exactDiagnosticObjectBytes(record) {
  let bytes = 2;
  let first = true;
  for (const [key, value] of Object.entries(record)) {
    assert.equal(typeof value, 'string');
    if (!first) bytes++;
    first = false;
    bytes = checkedAdd(
      bytes,
      jsonEscapedStringBytes(key),
      1,
      jsonEscapedStringBytes(value),
    );
  }
  return bytes;
}

const aliasedChild = 'x'.repeat(1024);
const aliasedPayload = {
  a: aliasedChild,
  b: aliasedChild,
  c: aliasedChild,
  d: aliasedChild,
};
const exactAliasedBytes = exactDiagnosticObjectBytes(aliasedPayload);
const materializedAliased = JSON.stringify(aliasedPayload);
assert.equal(exactAliasedBytes, Buffer.byteLength(materializedAliased));
assert.equal(exactAliasedBytes, 4125);
const boundedProducer = {
  priorIncorrectReservationBytes: 4096,
  exactPreallocationBytes: exactAliasedBytes,
  actualSerializedBytes: Buffer.byteLength(materializedAliased),
  exactCreditAcquiredBeforeMaterialization: true,
  overflowAllocatedBeforeRefusal: false,
  aliasOccurrencesCharged: 4,
};

const adverse = JSON.parse(readFileSync(adversePath, 'utf8'));
assert.equal(adverse.handlerDependency.ungated.rootComplete, true);
assert.equal(adverse.handlerDependency.proposedGate.rootComplete, false);
assert.equal(adverse.nativeLane.equalThirtySecondBudget.recoveryCompletions, 0);

const nestedCompletion = {
  scope: 'Ownership model over independently executed actual router seam',
  actualUngatedControl: {
    rootComplete: adverse.handlerDependency.ungated.rootComplete,
    innerComplete: adverse.handlerDependency.ungated.innerComplete,
  },
  priorOneReceiveTokenCounterexample: {
    rootComplete: adverse.handlerDependency.proposedGate.rootComplete,
    innerComplete: adverse.handlerDependency.proposedGate.innerComplete,
    blockedFrames: adverse.handlerDependency.proposedGate.blocked,
  },
  correctedTransitions: [
    'root receive parse -> shared handler graph charge',
    'root parser/raw roots released -> connection prefix reopened',
    'completion credit reserved before nested request send',
    'inner ACK/result parse -> exact pending-response claim',
    'nested result settles -> root handler resumes and answers',
  ],
  charges: {
    rootHandlerV8Bytes: handlerGraphBytes,
    nestedSerializerV8Bytes: serializerJsBytes,
    sharedPeakV8Bytes: checkedAdd(handlerGraphBytes, serializerJsBytes),
    sharedAllowanceV8Bytes: sharedV8Bytes,
    completionParsePeakV8Bytes: jsParsePeakBytes,
    completionAllowanceV8Bytes: completionV8Bytes,
  },
  correctedRootComplete: true,
  correctedInnerComplete: true,
  rawParseBypassUsed: false,
};
assert(nestedCompletion.charges.sharedPeakV8Bytes <= sharedV8Bytes);
assert(jsParsePeakBytes <= completionV8Bytes);

function retainedPrioritySchedule(count) {
  const rows = [];
  for (let index = 0; index < count; index++) {
    const base = index * 120000;
    const firstTurnStart = base;
    const firstTurnDeadline = firstTurnStart + 30000;
    const foregroundStart = firstTurnStart + 28500;
    const foregroundRelease = firstTurnStart + 34000;
    const nextSweep = firstTurnStart + 60000;
    const secondTurnDeadline = nextSweep + 30000;
    const completedAt = nextSweep + 100;
    assert(firstTurnDeadline < foregroundRelease);
    assert(completedAt < secondTurnDeadline);
    rows.push({
      index,
      firstTurnStart,
      firstTurnDeadline,
      recoveryArrival: firstTurnStart + 29000,
      foregroundStart,
      foregroundDeadline: foregroundStart + 30000,
      foregroundRelease,
      atFirstExpiry: {
        sqlAuthorized: false,
        priorityDebtRetained: true,
        state: 'RECOVERY_PRIORITY_IDLE_AFTER_FOREGROUND_RELEASE',
      },
      nextForegroundGrant: 'PRESSURE',
      nextSweep,
      secondTurnDeadline,
      completedAt,
      classificationDurationMs: 100,
      outcome: 'CLASSIFICATION_COMPLETED',
      sameTransactionId: true,
      sameDecision: 'COMMIT',
      waiterCount: 0,
      deadlineRenewed: false,
    });
  }
  return {
    debts: count,
    firstTurnsExpired: count,
    secondTurnsCompleted: count,
    foregroundCompletedBeforePriorityIdle: count,
    foregroundPressuredWhilePriorityIdle: count,
    rows,
  };
}

const retainedPriority = retainedPrioritySchedule(12);
const quietControl = {
  turnStart: 0,
  turnDeadline: 30000,
  recoveryArrival: 29000,
  classificationDurationMs: 100,
  completedAt: 29100,
  outcome: 'CLASSIFICATION_COMPLETED',
  deadlineRenewed: false,
};
assert(quietControl.completedAt < quietControl.turnDeadline);

const physicalExpiry = {
  events: [
    {time: 21, semantic: 'LIVE', physical: 'PROVIDER_SUBMITTED', charged: 128},
    {time: 22, semantic: 'EXPIRED', physical: 'PROVIDER_SUBMITTED', charged: 128},
    {time: 23, semantic: 'EXPIRED', physical: 'PROVIDER_SUBMITTED', charged: 128,
      reuse: 'REFUSED'},
    {time: 24, semantic: 'EXPIRED', physical: 'CALLBACK_DRAINED', charged: 0},
  ],
  semanticExpiryReleasesSubmittedBytes: false,
  connectionCloseAloneProvesLastUse: false,
};

const lifecycle = {
  preaccept: {
    poolFundedBeforeListen: true,
    selfEndpointsCharged: 2,
    refusalScratchCharged: 1,
    handshakeAutoPongCloseCharged: true,
  },
  receive: {
    prefixBeforeBody: true,
    bodyTokenBeforeProviderAllocation: true,
    handlerDoesNotHoldParserToken: true,
    protectedCompletionBeforeRequestSend: true,
    protectedRecoveryIngress: true,
  },
  retirement: physicalExpiry,
  restart: {
    physicalRootsReleasedByProcessExit: true,
    durableDebtRetained: true,
    priorityReconstructedBeforeForeground: true,
  },
};

const round13 = JSON.parse(readFileSync(round13Path, 'utf8'));
assert.equal(round13.provenance.round12SchemaOutcomePreserved,
  'upgraded_origin_preserved');

const result = {
  scope: 'Round-fourteen memory-backed active transport and retained recovery ' +
    'priority design model; no production source approval.',
  provenance: {
    subjectSha256: sha256(subject),
    predecessorSha256: fileSha256(predecessorPath),
    reviewSha256: fileSha256(reviewPath),
    round13FeasibilitySha256: fileSha256(round13Path),
    round12SchemaOutcomePreserved:
      round13.provenance.round12SchemaOutcomePreserved,
    adverseScheduleSha256: fileSha256(adversePath),
    membershipSourceSha256: sha256(membershipSource),
  },
  memory,
  boundedProducer,
  nestedCompletion,
  nativeLane: {
    retainedPriority,
    quietControl,
    physicalExpiry,
    stateDomain: [
      'FREE',
      'FOREGROUND_ACTIVE',
      'RECOVERY_PRIORITY_LIVE',
      'RECOVERY_PRIORITY_IDLE',
      'RECOVERY_ACTIVE',
    ],
    schedulerAdded: false,
    waiterListAdded: false,
    expiredTurnAuthorizesSql: false,
  },
  lifecycle,
  preserved: {
    primaryFrameBytes,
    primaryFrameLimitNarrowed: false,
    logicalIdCapAdded: false,
    globalMemoryLimitRaised: false,
    originalOrTurnDeadlineRenewed: false,
    exactSixOrForwardOnlyCommitChanged: false,
    schemaDesignChanged: false,
  },
  residualImplementationGates: [
    'Exact pinned Node/ws V8, external, connection, control and provider-root ' +
      'coefficients must fit the fixed profile partitions.',
    'Provider header/prefix admission, bounded canonical serializer and ' +
      'last-reference drain require source implementation and real witnesses.',
    'No production transport/native lane source is approved by this model.',
  ],
};

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  subjectSha256: result.provenance.subjectSha256,
  shippedHardBytes: hardNodeBytes,
  v8PartitionExact: applicationV8Bytes + routerV8Bytes === v8OldSpaceBytes,
  externalPartitionExact:
    routerExternalFrameBytes + routerConnectionControlBytes +
      nonRouterNativeSafetyBytes === nonV8Bytes,
  physicalEndpointTokens,
  logicalIdentitiesRotated: logicalIdentityRotation.length,
  nestedComplete: nestedCompletion.correctedRootComplete,
  secondTurnsCompleted: retainedPriority.secondTurnsCompleted,
  schemaOutcome: result.provenance.round12SchemaOutcomePreserved,
}));

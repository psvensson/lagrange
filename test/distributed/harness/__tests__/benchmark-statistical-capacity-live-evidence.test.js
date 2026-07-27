import {test} from '../../../../src/test-helpers/tap.js';
import {
  BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS,
  BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES,
} from '../benchmark-capacity-protocol-constants.js';
import {
  sealBenchmarkCapacityPreregistration,
} from '../benchmark-capacity-preregistration.js';
import {
  createBenchmarkCapacityLiveWindowEngagement,
  replayBenchmarkCapacityRawArtifact,
  writeBenchmarkCapacityRawArtifact,
  writeExternallyObservedBenchmarkCapacityRawArtifact,
} from '../benchmark-capacity-raw-artifact.js';
import {
  createBenchmarkCapacityPostgresqlOutcomeMarker,
  inspectBenchmarkCapacityExternalOperationOccurrences,
} from '../benchmark-capacity-live-observation-authority.js';
import {
  FIXTURE_LIVE_ENVIRONMENT,
  artifactFixtureLiveEvidence,
  artifactFixtureReport,
  preregistrationInput,
} from './benchmark-capacity-protocol-test-fixture.js';
import {
  createExternallyObservedFixture,
  externalOperationOccurrenceLog,
  externalPostgresqlLogRecord,
  inspectOperationOccurrencesUnderHostileIntrinsics,
  rebuildExternallyObservedFixtureWithForgedLog,
  replayInSpawnedFreshProcess,
  replayUnderHostileIntrinsics,
} from './benchmark-capacity-live-evidence-test-fixture.js';

async function createRawArtifactFixture() {
  const preregistration =
    sealBenchmarkCapacityPreregistration(preregistrationInput());
  const result = await artifactFixtureReport(preregistration);
  const liveEvidence =
    artifactFixtureLiveEvidence(preregistration, result);
  const receipt = await writeBenchmarkCapacityRawArtifact({
    preregistration,
    report: result.report,
    liveEvidence,
  });
  return {preregistration, result, liveEvidence, receipt};
}

const fixturePromise = createRawArtifactFixture();

test('raw artifact replays from durable bytes in hostile and fresh processes',
  async (t) => {
    const {receipt} = await fixturePromise;
    const replay = await replayBenchmarkCapacityRawArtifact(receipt);

    t.equal(replay.valid, true);
    t.equal(
      replay.artifact.liveEvidence.containerLogText,
      'fixture managed PostgreSQL log bytes',
    );
    t.equal(replay.artifact.liveEvidence.engagementOnly, true);
    t.equal(replay.artifact.liveEvidence.comparativeClaimEligible, false);
    t.same(await replayUnderHostileIntrinsics(receipt), []);
    t.same(
      await replayInSpawnedFreshProcess(receipt),
      {valid: true, reason: 'valid'},
    );
    t.end();
  });

test('raw artifact admission snapshots exact data without invoking traps',
  async (t) => {
    const {preregistration, result, liveEvidence} = await fixturePromise;
    let getterCalls = 0;
    const accessorEvidence = structuredClone(liveEvidence);
    Object.defineProperty(accessorEvidence, 'evidenceClass', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.SYNTHETIC_FIXTURE;
      },
    });
    await t.rejects(
      writeBenchmarkCapacityRawArtifact({
        preregistration,
        report: result.report,
        liveEvidence: accessorEvidence,
      }),
      /exact_live_authority_bound_records_required/u,
    );
    t.equal(getterCalls, 0);

    const nestedAccessorEvidence = structuredClone(liveEvidence);
    Object.defineProperty(
      nestedAccessorEvidence.liveEnvironmentContract,
      'image',
      {
        enumerable: true,
        get() {
          getterCalls += 1;
          return FIXTURE_LIVE_ENVIRONMENT.image;
        },
      },
    );
    await t.rejects(
      writeBenchmarkCapacityRawArtifact({
        preregistration,
        report: result.report,
        liveEvidence: nestedAccessorEvidence,
      }),
      /exact_live_authority_bound_records_required/u,
    );
    t.equal(getterCalls, 0);

    let proxyTrapCalls = 0;
    const trapHandler = {
      get(target, key, receiver) {
        proxyTrapCalls += 1;
        return Reflect.get(target, key, receiver);
      },
      getOwnPropertyDescriptor(target, key) {
        proxyTrapCalls += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      getPrototypeOf(target) {
        proxyTrapCalls += 1;
        return Reflect.getPrototypeOf(target);
      },
      ownKeys(target) {
        proxyTrapCalls += 1;
        return Reflect.ownKeys(target);
      },
    };
    const proxyEvidence =
      new Proxy(structuredClone(liveEvidence), trapHandler);
    await t.rejects(
      writeBenchmarkCapacityRawArtifact({
        preregistration,
        report: result.report,
        liveEvidence: proxyEvidence,
      }),
      /exact_live_authority_bound_records_required/u,
    );
    t.equal(proxyTrapCalls, 0);

    const nestedProxyEvidence = structuredClone(liveEvidence);
    nestedProxyEvidence.liveEnvironmentContract = new Proxy(
      nestedProxyEvidence.liveEnvironmentContract,
      trapHandler,
    );
    await t.rejects(
      writeBenchmarkCapacityRawArtifact({
        preregistration,
        report: result.report,
        liveEvidence: nestedProxyEvidence,
      }),
      /exact_live_authority_bound_records_required/u,
    );
    t.equal(proxyTrapCalls, 0);
    t.end();
  });

test('PostgreSQL observation consumes exact ordered operation occurrences',
  async (t) => {
    const {preregistration, result, liveEvidence} = await fixturePromise;
    const observed = createExternallyObservedFixture(
      preregistration,
      result,
      liveEvidence,
    );
    const occurrenceOptions = {
      windowEngagements: observed.liveEvidence.windowEngagements,
      resetEngagements: observed.liveEvidence.resetEngagements,
    };
    const occurrenceLog =
      externalOperationOccurrenceLog(observed.liveEvidence);
    const startedAtMs = Date.now();
    t.equal(
      inspectBenchmarkCapacityExternalOperationOccurrences(
        occurrenceOptions,
        occurrenceLog,
      ).valid,
      true,
    );
    t.ok(Date.now() - startedAtMs < 2000);

    const firstWindowLog = JSON.parse(
      occurrenceOptions.windowEngagements[0].operationLogText,
    );
    const firstEntry = firstWindowLog.entries[0];
    const firstEngagement = occurrenceOptions.windowEngagements[0];
    const firstStatement = externalPostgresqlLogRecord(
      `statement: ${firstEntry.sql}`,
      0,
      true,
    );
    const firstMarker = createBenchmarkCapacityPostgresqlOutcomeMarker({
      kind: 'window',
      runId: firstEngagement.runId,
      blockIndex: firstEngagement.blockIndex,
      blockedOrderIndex: firstEngagement.blockedOrderIndex,
      sideId: firstEngagement.sideId,
      phase: firstEngagement.phase,
      offeredLoad: firstEngagement.offeredLoad,
      operationIndex: firstEntry.operationIndex,
      command: firstEntry.command,
      rowCount: firstEntry.rowCount,
    });
    const firstOutcome = externalPostgresqlLogRecord(firstMarker, 1);
    t.equal(
      inspectBenchmarkCapacityExternalOperationOccurrences(
        occurrenceOptions,
        occurrenceLog.replace(`${firstStatement}\n`, ''),
      ).valid,
      false,
    );
    t.equal(
      inspectBenchmarkCapacityExternalOperationOccurrences(
        occurrenceOptions,
        `${firstStatement}\n${occurrenceLog}`,
      ).valid,
      false,
    );
    t.equal(
      inspectBenchmarkCapacityExternalOperationOccurrences(
        occurrenceOptions,
        occurrenceLog.replace(
          `${firstStatement}\n${firstOutcome}`,
          `${firstOutcome}\n${firstStatement}`,
        ),
      ).valid,
      false,
    );
    t.equal(
      inspectBenchmarkCapacityExternalOperationOccurrences(
        occurrenceOptions,
        occurrenceLog.slice(0, -1),
      ).valid,
      false,
    );
    const ambiguousContinuation = occurrenceLog.replace(
      '\n\tDECLARE affected BIGINT;',
      '\n2026-07-27 13:56:47.999 UTC [999] LOG:  statement: injected' +
        '\n\tDECLARE affected BIGINT;',
    );
    t.equal(
      inspectBenchmarkCapacityExternalOperationOccurrences(
        occurrenceOptions,
        ambiguousContinuation,
      ).valid,
      false,
    );
    t.equal(
      inspectBenchmarkCapacityExternalOperationOccurrences(
        occurrenceOptions,
        occurrenceLog.replace(
          'LOG:  statement: ',
          'LOG:  execute <unnamed>: ',
        ),
      ).valid,
      true,
    );
    t.same(
      inspectOperationOccurrencesUnderHostileIntrinsics(
        occurrenceOptions,
        occurrenceLog,
      ),
      {valid: true, reason: 'valid'},
    );

    const reusedOccurrence = structuredClone(occurrenceOptions);
    const reusedLog = JSON.parse(
      reusedOccurrence.windowEngagements[0].operationLogText,
    );
    reusedLog.entries[1].sql = reusedLog.entries[0].sql;
    reusedOccurrence.windowEngagements[0].operationLogText =
      JSON.stringify(reusedLog);
    t.equal(
      inspectBenchmarkCapacityExternalOperationOccurrences(
        reusedOccurrence,
        occurrenceLog,
      ).valid,
      false,
    );
    const coordinateForgery = structuredClone(occurrenceOptions);
    const coordinateLog = JSON.parse(
      coordinateForgery.windowEngagements[0].operationLogText,
    );
    coordinateLog.blockIndex += 1;
    coordinateForgery.windowEngagements[0].operationLogText =
      JSON.stringify(coordinateLog);
    t.equal(
      inspectBenchmarkCapacityExternalOperationOccurrences(
        coordinateForgery,
        occurrenceLog,
      ).valid,
      false,
    );
    const countForgery = structuredClone(occurrenceOptions);
    const countLog = JSON.parse(
      countForgery.windowEngagements[0].operationLogText,
    );
    countLog.entries[0].rowCount = 2;
    countForgery.windowEngagements[0].operationLogText =
      JSON.stringify(countLog);
    t.equal(
      inspectBenchmarkCapacityExternalOperationOccurrences(
        countForgery,
        occurrenceLog,
      ).valid,
      false,
    );
    t.end();
  });

test('raw artifact rejects self-authored authority and path forgeries',
  async (t) => {
    const {
      preregistration,
      result,
      liveEvidence,
      receipt,
    } = await fixturePromise;
    const observed = createExternallyObservedFixture(
      preregistration,
      result,
      liveEvidence,
    );
    await t.rejects(
      writeBenchmarkCapacityRawArtifact({
        preregistration,
        report: observed.report,
        liveEvidence: observed.liveEvidence,
      }),
      /external_live_artifact_authorization_required/u,
    );
    await t.rejects(
      writeExternallyObservedBenchmarkCapacityRawArtifact(
        {
          preregistration,
          report: observed.report,
          liveEvidence: observed.liveEvidence,
        },
        observed.selfAuthoredAuthorityImpostor,
      ),
      /unused live artifact authorization required/u,
    );
    const forged = rebuildExternallyObservedFixtureWithForgedLog(
      preregistration,
      observed,
    );
    await t.rejects(
      writeExternallyObservedBenchmarkCapacityRawArtifact(
        {
          preregistration,
          report: forged.report,
          liveEvidence: forged.liveEvidence,
        },
        observed.selfAuthoredAuthorityImpostor,
      ),
      /exact_live_authority_bound_records_required/u,
    );

    const relocated = {
      ...receipt,
      artifactPath: `${receipt.artifactPath}.relocated`,
    };
    t.same(
      await replayBenchmarkCapacityRawArtifact(relocated),
      {valid: false, reason: 'artifact_path_not_canonical'},
    );

    const flippedEligibility = structuredClone(liveEvidence);
    flippedEligibility.comparativeClaimEligible = true;
    await t.rejects(
      writeBenchmarkCapacityRawArtifact({
        preregistration,
        report: result.report,
        liveEvidence: flippedEligibility,
      }),
      /exact_live_authority_bound_records_required/u,
    );

    const tamperedLog = structuredClone(liveEvidence);
    tamperedLog.windowEngagements[0].operationLogText = 'forged log bytes';
    await t.rejects(
      writeBenchmarkCapacityRawArtifact({
        preregistration,
        report: result.report,
        liveEvidence: tamperedLog,
      }),
      /exact_live_authority_bound_records_required/u,
    );

    const sample = result.report.rawSamples[0];
    const receiptForSample = result.report.windowReceipts.find(
      (candidate) => candidate.capacitySampleDigest === sample.sampleDigest,
    );
    t.throws(
      () => createBenchmarkCapacityLiveWindowEngagement(
        {
          blockIndex: receiptForSample.blockIndex,
          blockedOrderIndex: receiptForSample.blockedOrderIndex,
          sideId: receiptForSample.sideId,
          phase: receiptForSample.phase,
          offeredLoad: receiptForSample.offeredLoad,
          startedAt: receiptForSample.startedAt,
          endedAt: receiptForSample.endedAt,
          operationLogText:
            'x'.repeat(BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES + 1),
        },
        sample,
        preregistration,
      ),
      /bounded_text_required/u,
    );
    await t.rejects(
      writeBenchmarkCapacityRawArtifact({
        directory: 'caller-controlled-relocation',
        preregistration,
        report: result.report,
        liveEvidence,
      }),
      /exact_live_authority_bound_records_required/u,
    );
    t.end();
  });

// Instrumentation patcher for the scratch worktree ONLY. Each needle must occur exactly once.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/mnt/data/peter/projects/.worktrees/activation-trace-14fac';
const TRACE_HELPER = `
// --- diagnostic instrumentation (scratch only) ---
function __trace(ev, fields) {
  process.stderr.write(JSON.stringify({t: Date.now(), ev, ...fields}) + '\\n');
}
function __short(id) { return typeof id === 'string' ? id.slice(0, 10) : id ?? null; }
function __caller(depth = 3) {
  const lines = new Error().stack.split('\\n');
  return [lines[depth], lines[depth + 1]].map((l) => (l ?? '').trim()
    .replace(/file:\\/\\/\\/[^ )]*\\//, '')).join(' <- ');
}
// --- end instrumentation ---
`;
function patch(rel, edits) {
  const file = path.join(ROOT, rel);
  let text = fs.readFileSync(file, 'utf8');
  for (const [needle, replacement] of edits) {
    const first = text.indexOf(needle);
    if (first < 0) throw new Error(`needle not found in ${rel}: ${needle.slice(0, 80)}`);
    if (text.indexOf(needle, first + 1) >= 0) throw new Error(`needle not unique in ${rel}: ${needle.slice(0, 80)}`);
    text = text.slice(0, first) + replacement + text.slice(first + needle.length);
  }
  fs.writeFileSync(file, text);
  console.log('patched', rel);
}

// 1. cutover owner
patch('src/node/replica-handler-participant-cutover.js', [
  [`const RUNS = new WeakMap();\n`, `const RUNS = new WeakMap();\nconst __DEPTH = new WeakMap();\n${TRACE_HELPER}`],
  [`async function runCutoverAttempt(handler, request) {\n  if (Number.isSafeInteger(request.deadlineAtMs) &&`,
   `async function runCutoverAttempt(handler, request) {
  const __started = Date.now();
  const __depth = (__DEPTH.get(handler) ?? 0) + 1;
  __DEPTH.set(handler, __depth);
  __trace('attempt.start', {partitionId: request.partitionId, trigger: request.trigger ?? null,
    depth: __depth, deadlineAtMs: request.deadlineAtMs ?? null, remainingMs: Number.isSafeInteger(request.deadlineAtMs) ? request.deadlineAtMs - Date.now() : null});
  try {
    const answer = await runCutoverAttemptInner(handler, request);
    __trace('attempt.end', {partitionId: request.partitionId, trigger: request.trigger ?? null, depth: __depth,
      elapsedMs: Date.now() - __started, outcome: answer?.outcome ?? null,
      missingFact: answer?.missingFact ?? null, reason: answer?.reason ?? null,
      stage: answer?.querySettlementFailure?.stage ?? null,
      stageReason: answer?.querySettlementFailure?.reason ?? null,
      controlOutcome: answer?.controlOutcome ?? null, controlMissingFact: answer?.controlMissingFact ?? null,
      controlReason: answer?.controlReason ?? null,
      heldReplicas: answer?.heldReplicas ?? null,
      authorizationId: __short(answer?.controlAuthorization?.authorizationId),
      authorizationRevision: answer?.controlAuthorization?.authorizationRevision ?? null});
    return answer;
  } catch (error) {
    __trace('attempt.throw', {partitionId: request.partitionId, depth: __depth,
      elapsedMs: Date.now() - __started, error: String(error?.message ?? error)});
    throw error;
  } finally {
    __DEPTH.set(handler, __depth - 1);
  }
}

async function runCutoverAttemptInner(handler, request) {
  if (Number.isSafeInteger(request.deadlineAtMs) &&`],
  [`  const wasClosed = participantCutoverPauseOf(service) !== null;\n  // Close the requesting partition before any remote control observation.`,
   `  const wasClosed = participantCutoverPauseOf(service) !== null;\n  __trace('attempt.wasClosed', {partitionId: request.partitionId, replicaId: service.replicaId, wasClosed, localRetirement: readParticipantReleaseLocalRetirement(service) !== null});\n  // Close the requesting partition before any remote control observation.`],
  [`    const continued = await continueDurableRelease(handler, service, request, null);\n    if (continued !== null) return continued;\n  }\n  const retired = await retireParticipantReleaseBeforeReplacement(handler, service,\n    {deadlineAtMs: request.deadlineAtMs});\n  const controlOwner = await releaseControlOwnerFirst(handler, service, request);`,
   `    const continued = await continueDurableRelease(handler, service, request, null);\n    __trace('attempt.continueDurable', {partitionId: request.partitionId, outcome: continued?.outcome ?? null, missingFact: continued?.missingFact ?? null});\n    if (continued !== null) return continued;\n  }\n  const retired = await retireParticipantReleaseBeforeReplacement(handler, service,\n    {deadlineAtMs: request.deadlineAtMs});\n  __trace('attempt.retired', {partitionId: request.partitionId, retired: retired.retired, answerOutcome: retired.answer?.outcome ?? null});\n  const controlOwner = await releaseControlOwnerFirst(handler, service, request);\n  __trace('attempt.controlOwner', {partitionId: request.partitionId, outcome: controlOwner?.outcome ?? null, missingFact: controlOwner?.missingFact ?? null, valid: controlReleaseAnswerValid(controlOwner, request.targetBuildDigest), authorizationId: __short(controlOwner?.controlAuthorization?.authorizationId)});`],
  [`  const committedPause = await pauseParticipantAdmission(service, attempt);\n  if (committedPause?.outcome !== 'PAUSED') {`,
   `  const committedPause = await pauseParticipantAdmission(service, attempt);\n  __trace('attempt.pause', {partitionId: request.partitionId, outcome: committedPause?.outcome ?? null, replayed: committedPause?.replayed ?? false, pauseGeneration: committedPause?.pauseGeneration ?? null});\n  if (committedPause?.outcome !== 'PAUSED') {`],
  [`  if (census.some((facts) => !isReleaseDrained(facts.work))) {\n    return attemptRefusal({...request, release}, OUTCOME.DRAIN_PENDING, {`,
   `  if (census.some((facts) => !isReleaseDrained(facts.work))) {\n    __trace('attempt.stage', {partitionId: request.partitionId, stage: 'post_pause_drain', work: census.map((facts) => ({replicaId: facts.generation.replicaId, work: facts.work}))});\n    return attemptRefusal({...request, release}, OUTCOME.DRAIN_PENDING, {`],
  [`  const reopened = await reopenCohort(handler, service, request, release, attempt, census);\n  if (reopened !== null) return reopened;`,
   `  const reopened = await reopenCohort(handler, service, request, release, attempt, census);\n  if (reopened !== null) { __trace('attempt.stage', {partitionId: request.partitionId, stage: 'reopen', outcome: reopened.outcome, missingFact: reopened.missingFact ?? null}); return reopened; }`],
  [`  const enabled = await askParticipantRelease(handler, handler.nodeId,\n    requestFor(release, attempt, ACTION.ENABLE, local,\n      {census, queryDrainProof: queryRelease.queryDrainProof}));\n  if (enabled.outcome !== OUTCOME.OBSERVED) return enabled;`,
   `  const enabled = await askParticipantRelease(handler, handler.nodeId,\n    requestFor(release, attempt, ACTION.ENABLE, local,\n      {census, queryDrainProof: queryRelease.queryDrainProof}));\n  __trace('attempt.enable', {partitionId: request.partitionId, outcome: enabled.outcome, missingFact: enabled.missingFact ?? null, originIndex: enabled.origin?.originIndex ?? null});\n  if (enabled.outcome !== OUTCOME.OBSERVED) return enabled;`],
  [`  const finalDefect = releaseCensusDefect(release, census, finalLocal,\n    {attempt, queryDrainProof: finalQueryDrainProof});\n  if (finalDefect !== null) {`,
   `  const finalDefect = releaseCensusDefect(release, census, finalLocal,\n    {attempt, queryDrainProof: finalQueryDrainProof});\n  if (finalDefect !== null) {\n    __trace('attempt.stage', {partitionId: request.partitionId, stage: 'post_enable_release_census', defect: finalDefect, work: census.map((facts) => ({replicaId: facts.generation.replicaId, work: facts.work, paused: facts.paused, queryState: facts.queryCensus?.state ?? null}))});`],
  // completeAuthorizedRelease steps
  [`  const authorized = await authorizeDependentRelease(handler, request, control, dependent);\n  if (authorized.outcome !== OUTCOME.AUTHORIZED) return authorized;`,
   `  const authorized = await authorizeDependentRelease(handler, request, control, dependent);\n  __trace('complete.authorized', {partitionId: request.partitionId, outcome: authorized.outcome, missingFact: authorized.missingFact ?? null, authorizationId: __short(authorized.authorizationId), authorizationRevision: authorized.authorizationRevision ?? null, replayed: authorized.replayed ?? false});\n  if (authorized.outcome !== OUTCOME.AUTHORIZED) return authorized;`],
  [`  if (durableResume?.outcome !== 'RESUMED') {\n    return attemptRefusal(request, OUTCOME.UNAVAILABLE,\n      {missingFact: 'committed_dependent_resume', resumed: durableResume});\n  }`,
   `  __trace('complete.durableResume', {partitionId: request.partitionId, outcome: durableResume?.outcome ?? null, replayed: durableResume?.replayed ?? false, pauseGeneration: durableResume?.pauseGeneration ?? null});\n  if (durableResume?.outcome !== 'RESUMED') {\n    return attemptRefusal(request, OUTCOME.UNAVAILABLE,\n      {missingFact: 'committed_dependent_resume', resumed: durableResume});\n  }`],
  [`  if (resumedResult.refusal !== null) return resumedResult.refusal;`,
   `  __trace('complete.resumeCohort', {partitionId: request.partitionId, refusal: resumedResult.refusal?.outcome ?? null, missingFact: resumedResult.refusal?.missingFact ?? null, answers: resumedResult.answers?.map((a) => a.outcome) ?? null});\n  if (resumedResult.refusal !== null) return resumedResult.refusal;`],
  [`  const confirmed = await confirmDependentRelease(handler, request, control,\n    controlAuthorization, receipts);\n  return confirmed.outcome !== OUTCOME.CONFIRMED ? confirmed :`,
   `  const confirmed = await confirmDependentRelease(handler, request, control,\n    controlAuthorization, receipts);\n  __trace('complete.confirmed', {partitionId: request.partitionId, outcome: confirmed.outcome, missingFact: confirmed.missingFact ?? null, controlRevision: confirmed.controlRevision ?? null});\n  return confirmed.outcome !== OUTCOME.CONFIRMED ? confirmed :`],
  // releaseControlOwnerFirst
  [`  if (localControlLeader !== undefined && localControlLeader !== null) {\n    const observed = await observeCurrentControlOwner(handler, localControlLeader,\n      request);\n    if (observed !== null) return observed;\n  }`,
   `  __trace('control.first', {dependent: request.partitionId, localControlLeader: localControlLeader?.replicaId ?? null, nodeId});\n  if (localControlLeader !== undefined && localControlLeader !== null) {\n    const observed = await observeCurrentControlOwner(handler, localControlLeader,\n      request);\n    if (observed !== null) return observed;\n  }\n  __trace('control.nested.start', {dependent: request.partitionId, control: partitionId, nodeId});`],
  [`  const answer = await requestParticipantRelease(handler, {partitionId, nodeId,\n    targetBuildDigest: request.targetBuildDigest, trigger: request.trigger,\n    deadlineAtMs: request.deadlineAtMs, authorization});\n  if (answer?.outcome === OUTCOME.BUILD_MISMATCH) {`,
   `  const answer = await requestParticipantRelease(handler, {partitionId, nodeId,\n    targetBuildDigest: request.targetBuildDigest, trigger: request.trigger,\n    deadlineAtMs: request.deadlineAtMs, authorization});\n  __trace('control.nested.end', {dependent: request.partitionId, outcome: answer?.outcome ?? null, missingFact: answer?.missingFact ?? null, reason: answer?.reason ?? null, valid: controlReleaseAnswerValid(answer, request.targetBuildDigest), authorizationId: __short(answer?.controlAuthorization?.authorizationId)});\n  if (answer?.outcome === OUTCOME.BUILD_MISMATCH) {`],
  // observeCurrentControlOwner
  [`  if (own.outcome !== OUTCOME.OBSERVED || own.origin === null) return null;\n  const release = releaseIdentityOf({partitionId: service.partitionId,\n    targetBuildDigest: request.targetBuildDigest,\n    configurationKey: own.membership.configurationKey,\n    membershipGenerationIndex: own.membership.membershipGenerationIndex});\n  const cohort = release === null ? null : cohortOf(handler, own);\n  if (cohort === null) return null;\n  const census = await readCohort(handler, service.partitionId, cohort,\n    request.deadlineAtMs);\n  if (unavailableCensus(census) !== null || census.some((facts) => facts.paused === true)) {\n    return null;\n  }\n  const authorization = parseJson(readParticipantReleaseState(service.db).authorizationText);\n  if (authorization?.dependentReleaseText !== JSON.stringify(release) ||\n      authorization.targetEntriesText !== canonicalTargetEntriesText(census) ||\n      authorization.targetConfigurationText !== canonicalConfigurationText(census)) return null;\n  const local = census.find((facts) => facts.generation.replicaId === service.replicaId);\n  const attempt = releaseAttemptFromFacts(request, release, own);\n  if (releaseCensusDefect(release, census, local,\n    {attempt, pausedRequired: false}) !== null) return null;\n  return releaseAnswer(OUTCOME.CUT_OVER, {...request, release},`,
   `  const __base = {dependent: request.partitionId, control: service.partitionId};
  if (own.outcome !== OUTCOME.OBSERVED || own.origin === null) {
    __trace('observe.return', {...__base, line: 296, why: 'own_unavailable_or_origin_null', ownOutcome: own.outcome, missingFact: own.missingFact ?? null, reason: own.reason ?? null, origin: own.origin ?? null});
    return null;
  }
  const release = releaseIdentityOf({partitionId: service.partitionId,
    targetBuildDigest: request.targetBuildDigest,
    configurationKey: own.membership.configurationKey,
    membershipGenerationIndex: own.membership.membershipGenerationIndex});
  const cohort = release === null ? null : cohortOf(handler, own);
  if (cohort === null) {
    __trace('observe.return', {...__base, line: 302, why: 'cohort_null', releaseNull: release === null});
    return null;
  }
  const census = await readCohort(handler, service.partitionId, cohort,
    request.deadlineAtMs);
  if (unavailableCensus(census) !== null || census.some((facts) => facts.paused === true)) {
    __trace('observe.return', {...__base, line: 305, why: 'census_unavailable_or_paused', unavailable: unavailableCensus(census), members: census.map((f) => ({replicaId: f.generation?.replicaId ?? null, outcome: f.outcome, paused: f.paused ?? null}))});
    return null;
  }
  const authorization = parseJson(readParticipantReleaseState(service.db).authorizationText);
  if (authorization?.dependentReleaseText !== JSON.stringify(release) ||
      authorization.targetEntriesText !== canonicalTargetEntriesText(census) ||
      authorization.targetConfigurationText !== canonicalConfigurationText(census)) {
    __trace('observe.return', {...__base, line: 309, why: 'authorization_mismatch', hasAuthorization: authorization !== null,
      dependentReleaseMatch: authorization?.dependentReleaseText === JSON.stringify(release),
      targetEntriesMatch: authorization?.targetEntriesText === canonicalTargetEntriesText(census),
      configurationMatch: authorization?.targetConfigurationText === canonicalConfigurationText(census),
      recordedTargets: parseJson(authorization?.targetEntriesText)?.map((t) => ({replicaIdentity: t.replicaIdentity, admissionGeneration: t.admissionGeneration, connectionGeneration: t.connectionGeneration, runtimeGeneration: t.runtimeGeneration, lifecycleIncarnation: t.lifecycleIncarnation})) ?? null,
      currentTargets: census.map((f) => targetEntryOf(f)).map((t) => t && ({replicaIdentity: t.replicaIdentity, admissionGeneration: t.admissionGeneration, connectionGeneration: t.connectionGeneration, runtimeGeneration: t.runtimeGeneration, lifecycleIncarnation: t.lifecycleIncarnation})),
      authorizationId: __short(authorization?.controlAuthorizationId), authorizationRevision: authorization?.controlAuthorizationRevision ?? null});
    return null;
  }
  const local = census.find((facts) => facts.generation.replicaId === service.replicaId);
  const attempt = releaseAttemptFromFacts(request, release, own);
  const __defect = releaseCensusDefect(release, census, local, {attempt, pausedRequired: false});
  if (__defect !== null) {
    __trace('observe.return', {...__base, line: 314, why: 'census_defect', defect: __defect, members: census.map((f) => ({replicaId: f.generation.replicaId, work: f.work, paused: f.paused, queryState: f.queryCensus?.state ?? null, servedLegacy: f.connection?.servedLegacy ?? null, topology: f.topology, originIndex: f.origin?.originIndex ?? null, term: f.membership?.term, leader: f.leaderReplicaId}))});
    return null;
  }
  __trace('observe.return', {...__base, line: 316, why: 'ok', authorizationId: __short(authorization.controlAuthorizationId), authorizationRevision: authorization.controlAuthorizationRevision});
  return releaseAnswer(OUTCOME.CUT_OVER, {...request, release},`],
  // runParticipantCutover: in-flight conflicts and caught throws
  [`  if (current) {\n    return current.requestIdentity === requestIdentity ? current.promise :\n      attemptRefusal(request, OUTCOME.UNAVAILABLE,\n        {missingFact: 'different_release_request_in_flight'});\n  }\n  const running = runCutoverAttempt(handler, request).catch((error) =>\n    attemptRefusal(request, OUTCOME.UNAVAILABLE, {reason: String(error?.message ?? error)}));`,
   `  if (current) {\n    __trace('run.inflight', {partitionId: request.partitionId, same: current.requestIdentity === requestIdentity, trigger: request.trigger ?? null});\n    return current.requestIdentity === requestIdentity ? current.promise :\n      attemptRefusal(request, OUTCOME.UNAVAILABLE,\n        {missingFact: 'different_release_request_in_flight'});\n  }\n  const running = runCutoverAttempt(handler, request).catch((error) => {\n    __trace('run.caught', {partitionId: request.partitionId, trigger: request.trigger ?? null, error: String(error?.message ?? error)});\n    return attemptRefusal(request, OUTCOME.UNAVAILABLE, {reason: String(error?.message ?? error)});\n  });`],
]);

// 2. retirement
patch('src/node/participant-release-lifecycle-retirement.js', [
  [`import {askParticipantRelease, releaseNodeOfAddress} from './participant-release-client.js';\n`,
   `import {askParticipantRelease, releaseNodeOfAddress} from './participant-release-client.js';\n${TRACE_HELPER}`],
  [`  if (!Array.isArray(targets) || targets.some((target) => !targetEntryValid(target)) ||\n      typeof authorization?.controlAuthorizationId !== 'string' ||\n      typeof authorization?.controlPartitionId !== 'string') return null;\n  const retiredTarget = targets.find((target) =>\n    target.replicaIdentity === service.replicaId) ?? null;\n  if (retiredTarget === null) return null;`,
   `  if (!Array.isArray(targets) || targets.some((target) => !targetEntryValid(target)) ||\n      typeof authorization?.controlAuthorizationId !== 'string' ||\n      typeof authorization?.controlPartitionId !== 'string') {\n    __trace('reconstruct', {replicaId: service.replicaId, partitionId: service.partitionId, why: 'no_durable_authorization', hasAuthorization: authorization !== null});\n    return null;\n  }\n  const retiredTarget = targets.find((target) =>\n    target.replicaIdentity === service.replicaId) ?? null;\n  if (retiredTarget === null) { __trace('reconstruct', {replicaId: service.replicaId, partitionId: service.partitionId, why: 'no_retired_target'}); return null; }`],
  [`  if (JSON.stringify(currentTarget) === JSON.stringify(retiredTarget)) {\n    return null;\n  }`,
   `  if (JSON.stringify(currentTarget) === JSON.stringify(retiredTarget)) {\n    __trace('reconstruct', {replicaId: service.replicaId, partitionId: service.partitionId, why: 'same_target', authorizationId: __short(authorization.controlAuthorizationId), admissionGeneration: currentTarget.admissionGeneration});\n    return null;\n  }\n  __trace('reconstruct', {replicaId: service.replicaId, partitionId: service.partitionId, why: 'reconstructed', authorizationId: __short(authorization.controlAuthorizationId), controlAuthorizationRevision: authorization.controlAuthorizationRevision ?? null, retiredTarget: {admissionGeneration: retiredTarget.admissionGeneration, connectionGeneration: retiredTarget.connectionGeneration, runtimeGeneration: retiredTarget.runtimeGeneration}, currentTarget: {admissionGeneration: currentTarget.admissionGeneration, connectionGeneration: currentTarget.connectionGeneration, runtimeGeneration: currentTarget.runtimeGeneration}});`],
  [`  if (obligation === null) {\n    obligation = current === null ?\n      await reconstructDurableRetirement(handler, service) :\n      retainParticipantReleaseLocalRetirement(service, current);\n  }\n  if (obligation === null) return Object.freeze({retired: false});`,
   `  let __source = obligation !== null ? 'retained' : 'none';\n  if (obligation === null) {\n    if (current === null) {\n      obligation = await reconstructDurableRetirement(handler, service);\n      __source = obligation === null ? 'none' : 'reconstructed';\n    } else {\n      obligation = retainParticipantReleaseLocalRetirement(service, current);\n      __source = 'from_current';\n    }\n  }\n  __trace('retire.obligation', {replicaId: service.replicaId, partitionId: service.partitionId, source: __source,\n    current: current === null ? null : {authorizationId: __short(current.authorizationId), admissionGeneration: current.target?.admissionGeneration ?? null, controlOwner: current.controlOwner?.replicaId ?? null},\n    obligation: obligation === null ? null : {authorizationId: __short(obligation.authorizationId), retiredAdmissionGeneration: obligation.retiredTarget?.admissionGeneration ?? null, controlOwner: obligation.controlOwner?.replicaId ?? null}});\n  if (obligation === null) return Object.freeze({retired: false});`],
  [`  const answer = await askParticipantRelease(handler,\n    request.controlOwnerNodeId, request);\n  if (answer.outcome !== OUTCOME.RETIRED) {`,
   `  const answer = await askParticipantRelease(handler,\n    request.controlOwnerNodeId, request);\n  __trace('retire.answer', {replicaId: service.replicaId, partitionId: service.partitionId, authorizationId: __short(obligation.authorizationId), retirementId: __short(request.retirementId), outcome: answer.outcome, missingFact: answer.missingFact ?? null, retiredOutcome: answer.retired?.outcome ?? null, controlRevision: answer.controlRevision ?? answer.retired?.controlRevision ?? null, retirementIndex: answer.retirementIndex ?? null});\n  if (answer.outcome !== OUTCOME.RETIRED) {`],
]);

// 3. release action recipient
patch('src/node/replica-handler-participant-release.js', [
  [`import {retireParticipantReleaseBeforeReplacement} from\n  './participant-release-lifecycle-retirement.js';\n`,
   `import {retireParticipantReleaseBeforeReplacement} from\n  './participant-release-lifecycle-retirement.js';\n${TRACE_HELPER}`],
  [`async function executeReleaseAction(handler, service, request, facts) {\n  switch (request.action) {`,
   `async function executeReleaseAction(handler, service, request, facts) {
  const __started = Date.now();
  const answer = await executeReleaseActionInner(handler, service, request, facts);
  __trace('action', {action: request.action, partitionId: service.partitionId, replicaId: service.replicaId,
    outcome: answer?.outcome ?? null, missingFact: answer?.missingFact ?? null,
    authorizationId: __short(request.controlAuthorization?.authorizationId),
    dependent: request.dependentRelease?.partitionId ?? null,
    retainedAuthorization: request.retainedAuthorization !== null && request.retainedAuthorization !== undefined,
    elapsedMs: Date.now() - __started,
    resultAuthorizationId: __short(answer?.authorizationId), resultAuthorizationRevision: answer?.authorizationRevision ?? null,
    replayed: answer?.replayed ?? null, controlRevision: answer?.controlRevision ?? null,
    retiredOutcome: answer?.retired?.outcome ?? null,
    reservedOutcome: answer?.reserved?.outcome ?? null, finalizedOutcome: answer?.finalized?.outcome ?? null});
  return answer;
}

async function executeReleaseActionInner(handler, service, request, facts) {
  switch (request.action) {`],
  [`    const retainedAuthorization = retainedAuthorizationMatches(service, request);\n    const controlDefect = releaseCensusDefect(request.release,`,
   `    const retainedAuthorization = retainedAuthorizationMatches(service, request);\n    __trace('authorize.enter', {partitionId: service.partitionId, dependent: request.dependentRelease?.partitionId ?? null, authorizationId: __short(request.controlAuthorization?.authorizationId), retainedAuthorization, controlState: parseJson(readParticipantReleaseState(service.db).controlText)?.state ?? null, controlAuth: __short(parseJson(readParticipantReleaseState(service.db).controlText)?.authorizationId)});\n    const controlDefect = releaseCensusDefect(request.release,`],
  [`    if (controlDefect !== null || dependentDefect !== null) {\n      return releaseAnswer(controlDefect ?? dependentDefect, request);\n    }`,
   `    if (controlDefect !== null || dependentDefect !== null) {\n      __trace('authorize.defect', {partitionId: service.partitionId, dependent: request.dependentRelease?.partitionId ?? null, controlDefect, dependentDefect});\n      return releaseAnswer(controlDefect ?? dependentDefect, request);\n    }`],
  [`    const facts = await readParticipantReleaseFacts(handler, service, purpose);\n    if (request.action === ACTION.INSPECT || facts.outcome !== OUTCOME.OBSERVED) return facts;`,
   `    const facts = await readParticipantReleaseFacts(handler, service, purpose);\n    if (facts.outcome !== OUTCOME.OBSERVED) __trace('receive.factsUnavailable', {action: request.action, partitionId: service.partitionId, replicaId: service.replicaId, missingFact: facts.missingFact ?? null, reason: facts.reason ?? null});\n    if (request.action === ACTION.INSPECT || facts.outcome !== OUTCOME.OBSERVED) return facts;`],
  [`    if (!sameReplicaGeneration(request.target, facts.generation)) {\n      return releaseAnswer(OUTCOME.STALE, request,\n        {missingFact: 'current_replica_generation', requested: request.target,\n          current: facts.generation});\n    }\n    if (!attemptMatches(request, facts)) {\n      return releaseAnswer(OUTCOME.STALE, request,\n        {missingFact: 'current_release_attempt'});\n    }`,
   `    if (!sameReplicaGeneration(request.target, facts.generation)) {\n      __trace('receive.stale', {action: request.action, partitionId: service.partitionId, replicaId: service.replicaId, why: 'current_replica_generation', requested: request.target, current: facts.generation});\n      return releaseAnswer(OUTCOME.STALE, request,\n        {missingFact: 'current_replica_generation', requested: request.target,\n          current: facts.generation});\n    }\n    if (!attemptMatches(request, facts)) {\n      __trace('receive.stale', {action: request.action, partitionId: service.partitionId, replicaId: service.replicaId, why: 'current_release_attempt'});\n      return releaseAnswer(OUTCOME.STALE, request,\n        {missingFact: 'current_release_attempt'});\n    }`],
  [`      return releaseAnswer(OUTCOME.STALE, request,\n        {missingFact: 'current_runtime_attempt'});\n    }\n    return executeReleaseAction(handler, service, request, facts);\n  } catch (error) {\n    return releaseAnswer(OUTCOME.INVALID, request, {reason: String(error?.message ?? error)});`,
   `      __trace('receive.stale', {action: request.action, partitionId: service.partitionId, replicaId: service.replicaId, why: 'current_runtime_attempt'});\n      return releaseAnswer(OUTCOME.STALE, request,\n        {missingFact: 'current_runtime_attempt'});\n    }\n    return executeReleaseAction(handler, service, request, facts);\n  } catch (error) {\n    __trace('receive.throw', {action: request.action, partitionId: request.partitionId ?? null, replicaId: request.replicaId ?? null, error: String(error?.message ?? error)});\n    return releaseAnswer(OUTCOME.INVALID, request, {reason: String(error?.message ?? error)});`],
]);

// 4. apply
patch('src/partition/partition-participant-release-apply.js', [
  [`import {raiseParticipantCutoverPause} from\n  './partition-participant-transaction-pause.js';\n`,
   `import {raiseParticipantCutoverPause} from\n  './partition-participant-transaction-pause.js';\n${TRACE_HELPER}
let __lastResult = null;
function __stateSummary(db) {
  const s = readParticipantReleaseState(db);
  const c = parseJson(s.controlText);
  const a = parseJson(s.authorizationText);
  return {rev: s.controlRevision, state: c?.state ?? null, auth: __short(c?.authorizationId), authRev: c?.authorizationRevision ?? null,
    retirement: __short(c?.retirementId), retiredReplica: c?.retiredReplicaIdentity ?? null, pauseGen: s.pauseGeneration,
    resumeAuth: __short(a?.controlAuthorizationId), resumeAuthRev: a?.controlAuthorizationRevision ?? null, authIndex: s.authorizationIndex};
}
`],
  [`function resolve(service, committed, result) {\n  committed.afterCommit(() => service.resolveCommittedWrite(`,
   `function resolve(service, committed, result) {\n  __lastResult = result;\n  committed.afterCommit(() => service.resolveCommittedWrite(`],
  [`function applyParticipantReleaseCommand(service, committed) {\n  switch (committed.command.type) {`,
   `function applyParticipantReleaseCommand(service, committed) {
  const before = __stateSummary(service.db);
  __lastResult = null;
  let applied = null;
  try {
    applied = applyParticipantReleaseCommandInner(service, committed);
    return applied;
  } finally {
    const command = committed.command;
    __trace('apply', {replicaId: service.replicaId, partitionId: service.partitionId, type: command.type, index: committed.index, term: committed.term,
      authorizationId: __short(command.authorizationId), expectedControlRevision: command.expectedControlRevision ?? null,
      expectedPauseGeneration: command.expectedPauseGeneration ?? null, retirementId: __short(command.retirementId),
      retiredAdmissionGeneration: parseJson(command.retiredTargetText ?? null)?.admissionGeneration ?? null,
      applied, result: __lastResult?.outcome ?? null, replayed: __lastResult?.replayed ?? false, before, after: __stateSummary(service.db)});
  }
}

function applyParticipantReleaseCommandInner(service, committed) {
  switch (committed.command.type) {`],
]);

// 5. local current
patch('src/partition/partition-participant-release-local-current.js', [
  [`const CURRENT = new WeakMap();\nconst RETIREMENTS = new WeakMap();\n`,
   `const CURRENT = new WeakMap();\nconst RETIREMENTS = new WeakMap();\n${TRACE_HELPER}`],
  [`  CURRENT.set(service, Object.freeze({authorizationId, target, controlOwner}));\n}`,
   `  __trace('local.publish', {replicaId: service.replicaId, partitionId: service.partitionId, authorizationId: __short(authorizationId), previous: __short(CURRENT.get(service)?.authorizationId), admissionGeneration: target?.admissionGeneration ?? null, controlOwner: controlOwner?.replicaId ?? null, retained: __short(RETIREMENTS.get(service)?.authorizationId), caller: __caller()});\n  CURRENT.set(service, Object.freeze({authorizationId, target, controlOwner}));\n}`],
  [`  const retained = RETIREMENTS.get(service);\n  if (obligation !== null && retained === undefined) {\n    RETIREMENTS.set(service, obligation);\n  } else if (obligation !== null && JSON.stringify(retained) !== JSON.stringify(obligation)) {\n    throw new Error('Participant release retirement identity changed');\n  }\n  CURRENT.delete(service);`,
   `  const retained = RETIREMENTS.get(service);\n  __trace('local.invalidate', {replicaId: service.replicaId, partitionId: service.partitionId, current: __short(current?.authorizationId), currentAdmissionGeneration: current?.target?.admissionGeneration ?? null, obligation: obligation !== null, retained: __short(retained?.authorizationId), retainedAdmissionGeneration: retained?.retiredTarget?.admissionGeneration ?? null, conflict: obligation !== null && retained !== undefined && JSON.stringify(retained) !== JSON.stringify(obligation), caller: __caller()});\n  if (obligation !== null && retained === undefined) {\n    RETIREMENTS.set(service, obligation);\n  } else if (obligation !== null && JSON.stringify(retained) !== JSON.stringify(obligation)) {\n    throw new Error('Participant release retirement identity changed');\n  }\n  CURRENT.delete(service);`],
  [`  const retained = existing ?? Object.freeze(request);\n  RETIREMENTS.set(service, retained);\n  return retained;`,
   `  const retained = existing ?? Object.freeze(request);\n  __trace('local.retain', {replicaId: service.replicaId, partitionId: service.partitionId, authorizationId: __short(retained.authorizationId), existed: existing !== undefined, caller: __caller()});\n  RETIREMENTS.set(service, retained);\n  return retained;`],
  [`function clearParticipantReleaseLocalRetirement(service, request) {\n  if (RETIREMENTS.get(service) === request) RETIREMENTS.delete(service);`,
   `function clearParticipantReleaseLocalRetirement(service, request) {\n  __trace('local.clear', {replicaId: service.replicaId, partitionId: service.partitionId, authorizationId: __short(request?.authorizationId), matched: RETIREMENTS.get(service) === request, caller: __caller()});\n  if (RETIREMENTS.get(service) === request) RETIREMENTS.delete(service);`],
]);

// 6. pause / admissions
patch('src/partition/partition-participant-transaction-pause.js', [
  [`const ADMISSIONS = new WeakMap();\nlet nextAdmissionGeneration = 0;\n`,
   `const ADMISSIONS = new WeakMap();\nlet nextAdmissionGeneration = 0;\n${TRACE_HELPER}`],
  [`  invalidateParticipantReleaseLocalCurrent(service);\n  nextAdmissionGeneration += 1;\n  const admission = Object.freeze({state: ADMISSION.CLOSED,\n    raisedAtMs: service.timeSource.now(), generation: nextAdmissionGeneration, releaseId: null});\n  ADMISSIONS.set(service, admission);\n  return admission;`,
   `  const __previous = ADMISSIONS.get(service) ?? null;\n  invalidateParticipantReleaseLocalCurrent(service);\n  nextAdmissionGeneration += 1;\n  const admission = Object.freeze({state: ADMISSION.CLOSED,\n    raisedAtMs: service.timeSource.now(), generation: nextAdmissionGeneration, releaseId: null});\n  __trace('admission.newPause', {replicaId: service.replicaId, partitionId: service.partitionId, generation: admission.generation, previousState: __previous?.state ?? null, previousGeneration: __previous?.generation ?? null, caller: __caller()});\n  ADMISSIONS.set(service, admission);\n  return admission;`],
  [`  if (status?.term !== proof.term || status?.leaderId !== proof.leaderId ||\n      status?.configurationKey !== proof.configurationKey ||\n      status?.membershipGenerationIndex !== proof.membershipGenerationIndex ||\n      status?.runtimeGeneration !== proof.runtimeGeneration ||\n      status?.lifecycleIncarnation !== proof.lifecycleIncarnation) {\n    invalidateParticipantReleaseLocalCurrent(service);`,
   `  if (status?.term !== proof.term || status?.leaderId !== proof.leaderId ||\n      status?.configurationKey !== proof.configurationKey ||\n      status?.membershipGenerationIndex !== proof.membershipGenerationIndex ||\n      status?.runtimeGeneration !== proof.runtimeGeneration ||\n      status?.lifecycleIncarnation !== proof.lifecycleIncarnation) {\n    __trace('admission.invalidated', {replicaId: service.replicaId, partitionId: service.partitionId, generation: admission.generation, diff: {term: [proof.term, status?.term], leaderId: [proof.leaderId, status?.leaderId], configurationKey: [proof.configurationKey, status?.configurationKey], membershipGenerationIndex: [proof.membershipGenerationIndex, status?.membershipGenerationIndex], runtimeGeneration: [proof.runtimeGeneration, status?.runtimeGeneration], lifecycleIncarnation: [proof.lifecycleIncarnation, status?.lifecycleIncarnation]}, caller: __caller()});\n    invalidateParticipantReleaseLocalCurrent(service);`],
  [`  ADMISSIONS.set(service, Object.freeze({...current, state: ADMISSION.OPEN,\n    releaseId: request.release.releaseId,\n    authorizationId: authorization.controlAuthorizationId,`,
   `  __trace('admission.open', {replicaId: service.replicaId, partitionId: service.partitionId, generation: current.generation, authorizationId: __short(authorization.controlAuthorizationId)});\n  ADMISSIONS.set(service, Object.freeze({...current, state: ADMISSION.OPEN,\n    releaseId: request.release.releaseId,\n    authorizationId: authorization.controlAuthorizationId,`],
]);

// 7. seed loop
patch('src/bootstrap/bootstrap-service-seed-workflow.js', [
  [`      const timeSource = this.nodeService.getTimeSource();\n      for (const service of services) {\n        const authorization = this.replicaHandler`,
   `      const timeSource = this.nodeService.getTimeSource();\n      process.stderr.write(JSON.stringify({t: Date.now(), ev: 'seed.plan', count: services.length, deadlineAtMs, remainingMs: deadlineAtMs - timeSource.now(), order: services.map((s) => s.partitionId), allPartitionServices: this.partitionServices.size}) + '\\n');\n      let __index = 0;\n      for (const service of services) {\n        const __startedAt = timeSource.now();\n        let __attempts = 0;\n        process.stderr.write(JSON.stringify({t: Date.now(), ev: 'seed.partition.start', index: __index, partitionId: service.partitionId, remainingMs: deadlineAtMs - __startedAt}) + '\\n');\n        __index += 1;\n        const authorization = this.replicaHandler`],
  [`          if (answer.outcome === PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER) break;\n          firstRefusal ||= answer;`,
   `          __attempts += 1;\n          process.stderr.write(JSON.stringify({t: Date.now(), ev: 'seed.answer', partitionId: service.partitionId, attempt: __attempts, outcome: answer.outcome, missingFact: answer.missingFact ?? null, controlOutcome: answer.controlOutcome ?? null, controlReason: answer.controlReason ?? null, stage: answer.querySettlementFailure?.stage ?? null, stageReason: answer.querySettlementFailure?.reason ?? null, retryAfterMs: answer.retryAfterMs ?? null, elapsedMs: timeSource.now() - __startedAt}) + '\\n');\n          if (answer.outcome === PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER) break;\n          firstRefusal ||= answer;`],
  [`        } while (timeSource.now() <= deadlineAtMs);\n        if (answer?.outcome !== PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER) {`,
   `        } while (timeSource.now() <= deadlineAtMs);\n        process.stderr.write(JSON.stringify({t: Date.now(), ev: 'seed.partition.end', partitionId: service.partitionId, attempts: __attempts, outcome: answer?.outcome ?? null, elapsedMs: timeSource.now() - __startedAt, remainingMs: deadlineAtMs - timeSource.now()}) + '\\n');\n        if (answer?.outcome !== PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER) {`],
]);

// 8. keep the runtime root
patch('test/integration/pgwire-command-tag-real-engine.integration.test.js', [
  [`  t.teardown(() => rm(root, {force: true, recursive: true}));`,
   `  console.error('DIAGNOSTIC_RUNTIME_ROOT', root);`],
]);
console.log('done');

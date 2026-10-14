import {Buffer} from 'node:buffer';
import {writeSync} from 'node:fs';

const EXIT_DIAGNOSTIC_BYTE_CAP = 4096;

function gateDiagnosticOf(gate) {
  if (gate === null) return null;
  const result = {followers: 0, matched: 0, suppressed: 0, overflow: 0,
    forwarded: 0, restored: 0};
  for (const facts of gate.diagnosticFacts()) {
    result.followers += 1;
    result.matched += facts.matched;
    result.suppressed += facts.suppressed;
    result.overflow += Number(facts.overflow);
    result.forwarded += Number(facts.forwarded);
    result.restored += Number(facts.restored);
  }
  return Object.freeze(result);
}

function membershipDiagnosticOf(membershipReads) {
  if (membershipReads === null) return null;
  return membershipReads.states.map((state) => Object.freeze({
    replicaId: state.replicaId,
    captureStarted: state.captureStarted,
    captured: state.captured !== null,
    carrier: state.carrierOutcome?.kind ?? null,
    progress: state.progress !== null,
    currentStarted: state.currentStarted,
    current: state.current !== null,
    route: state.routeOutcome?.kind ?? null,
    errors: state.errors.length,
    ...stepDiagnosticOf(state.stepOutcome),
  }));
}

function stepDiagnosticOf(record) {
  if (record === null) {
    return {stepKind: null, stepOutcome: null, stepReason: null};
  }
  const value = record.value;
  return {stepKind: record.kind, stepOutcome: value?.outcome ?? null,
    stepReason: value?.reason ?? null};
}

function installBeforeExitDiagnostic(context) {
  const listener = () => {
    try {
      const snapshot = Object.freeze({kind: 'native-before-exit',
        partitionId: context.partitionId, phase: context.phase,
        edge: context.edgeKind, cleanupEntered: context.cleanupEntered,
        releaseSettled: context.trackedRelease?.settled ?? false,
        routerInitialized: context.routerInitialized,
        groupFormed: context.groupFormed,
        settledObserved: context.settledObserved,
        releaseOwnersAttached: context.releaseOwnersAttached,
        gate: gateDiagnosticOf(context.gate),
        membership: membershipDiagnosticOf(context.membershipReads),
        route: context.route?.diagnosticFacts() ?? null});
      const serialized = JSON.stringify(snapshot);
      const line = Buffer.byteLength(serialized) <= EXIT_DIAGNOSTIC_BYTE_CAP ?
        serialized : JSON.stringify({kind: 'native-before-exit',
          phase: context.phase, diagnosticOverflow: true});
      const output = `${line}\n`;
      if (writeSync(2, output) !== Buffer.byteLength(output)) {
        context.error = new Error('native before-exit diagnostic write incomplete');
      }
    } catch (error) {
      context.error = error;
    }
  };
  context.listener = listener;
  process.once('beforeExit', listener);
}

export {installBeforeExitDiagnostic};

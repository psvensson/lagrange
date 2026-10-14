import {Buffer} from 'node:buffer';
import {writeSync} from 'node:fs';
import {NATIVE_INBOUND_STAGE} from '../../src/raft/raft-rs-runtime-owner.js';

const EXIT_DIAGNOSTIC_BYTE_CAP = 4096;

const NATIVE_STAGE_EVENT_CAP = 32;

// The one native runtime owner reports its own stages with exact replica
// identity. This collector never reads a port, registers a timer or drives work.
function createNativeDrainStageCapture(partitionId, replicaIds) {
  const records = {};
  for (const replicaId of replicaIds) {
    records[replicaId] = {accepted: 0, acceptedWithTimer: 0,
      coalesced: 0, requests: 0, retryRequests: 0,
      callbacks: 0, persistenceWaits: 0, turnRequests: 0,
      closedOrEmpty: 0, waitBound: 0, other: 0,
      events: 0, overflow: 0, lastStage: null};
  }
  const capture = (event) => {
    if (event.groupId !== partitionId) return;
    const record = records[event.replicaIdentity];
    if (record === undefined) return;
    record.events += 1;
    if (record.events > NATIVE_STAGE_EVENT_CAP) {
      record.overflow += 1;
      return;
    }
    record.lastStage = event.stage;
    switch (event.stage) {
    case NATIVE_INBOUND_STAGE.ACCEPTED:
      record.accepted += 1;
      if (event.scheduled) record.acceptedWithTimer += 1;
      break;
    case NATIVE_INBOUND_STAGE.COALESCED: record.coalesced += 1; break;
    case NATIVE_INBOUND_STAGE.REQUEST: record.requests += 1; break;
    case NATIVE_INBOUND_STAGE.RETRY_REQUEST: record.retryRequests += 1; break;
    case NATIVE_INBOUND_STAGE.CALLBACK: record.callbacks += 1; break;
    case NATIVE_INBOUND_STAGE.PERSISTENCE_WAIT: record.persistenceWaits += 1; break;
    case NATIVE_INBOUND_STAGE.TURN_REQUEST: record.turnRequests += 1; break;
    case NATIVE_INBOUND_STAGE.CLOSED_OR_EMPTY: record.closedOrEmpty += 1; break;
    case NATIVE_INBOUND_STAGE.WAIT_BOUND: record.waitBound += 1; break;
    default: record.other += 1;
    }
  };
  return {records, capture};
}

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
        route: context.route?.diagnosticFacts() ?? null,
        // Existing core-entry seam is group-scoped, never follower-attributed.
        nativeGroupCore: context.nativeCore ?? null,
        nativeDrainInstalled: context.nativeDrainInstalled ?? false,
        nativeDrain: context.nativeDrain ?? null});
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

export {createNativeDrainStageCapture, installBeforeExitDiagnostic};

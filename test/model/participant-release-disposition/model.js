// Executable verification model for the release-linearization transition
// table. Companion to
// solve/quests/seed-control-current-proof-amortization/evidence/
// release-linearization-rev2-addendum-20261015.md.
//
// Two rule sets are executable from the same transitions:
//   MODE_REV2 - the published revision-2 rows T1-T7, implemented literally
//               from the table in revision 2 section 10 plus the D3 and D4
//               prose those rows cite. Counterexamples against these rules
//               must keep firing here.
//   MODE_REV3 - the corrected rows of the addendum's transition table.
//
// Mapping to the published rows: every apply branch is labelled with the row
// it implements (T1..T7) in the model trace.
//
// Modeled abstractions (not production behavior): one shared committed log
// (D1) that replicas apply in strict log order (D2); canonical command bytes
// are the deterministic JSON of the command record; a census is a digest over
// the replicated release state at the coordinator's observed prefix; D3 is a
// derived, never-persisted gate per replica; D4 answers are coordinator reads
// at a named observed prefix; restart keeps the durable replicated state and
// changes only the local incarnation and the process-local gate.
//
// Excluded behavior (stated, per revision 2 section 2.4 and the addendum):
// live term/leaderId effects, transport loss inside Raft commit, timeout
// machinery, wall clocks, snapshot transfer mechanics, SQL semantics,
// membership changes. No src/ import: these rows have no production
// implementation to stay honest against, and this work must not create one.

export const MODE_REV2 = 'rev2-published';
export const MODE_REV3 = 'rev3-corrected';

const RETENTION_BOUND = 4;

const CURRENT_IDENTITY = identityOf();

const IDENTITY_FIELDS = Object.freeze([
  'partitionId',
  'protocolVersion',
  'targetBuildDigest',
  'configurationKey',
  'membershipGenerationIndex',
]);

export function identityOf(over = {}) {
  return {
    partitionId: 'p1',
    protocolVersion: 'v1',
    targetBuildDigest: 'build-a',
    configurationKey: 'cfg-1',
    membershipGenerationIndex: 3,
    ...over,
  };
}

function identityValid(identity) {
  return (
    identity !== null &&
    typeof identity === 'object' &&
    IDENTITY_FIELDS.every(
      (f) => identity[f] !== undefined && identity[f] !== null && identity[f] !== '',
    )
  );
}

function digestOf(value) {
  return JSON.stringify(value);
}

function rowsSignature(rows) {
  return digestOf([...rows.entries()].sort((a, b) => a[0] - b[0]));
}

// The transaction-command apply step per command type, by rule set.
const REV2_OTHER_APPLY = Object.freeze({
  WRITE: 'applyWriteRev2',
  BEGIN: 'applyBeginRev2',
  PREPARE: 'applyPrepareRev2',
  DECISION: 'applyTxnDecision',
});

const REV3_OTHER_APPLY = Object.freeze({
  WRITE: 'applyWriteRev3',
  BEGIN: 'applyBeginRev3',
  PREPARE: 'applyPrepareRev3',
  DECISION: 'applyTxnDecision',
});

class Replica {
  constructor(id, {startedIncarnation = 1} = {}) {
    this.id = id;
    this.startedIncarnation = startedIncarnation;
    this.establishedIncarnation = 1;
    this.l = 0;
    this.rows = new Map();
    this.annotations = [];
    this.appliedEntries = new Map();
    this.txn = new Map();
    this.effects = [];
    this.gate = 'CLOSED';
    this.heldReason = 'NO_DECISION';
    this.retiredBelow = 0;
    this.appliedCount = 0;
    this.lastL = 0;
  }

  restart() {
    this.startedIncarnation += 1;
    this.gate = 'CLOSED';
    this.heldReason = 'INCARNATION_CHANGED';
  }

  localObservationsMatch() {
    return this.startedIncarnation === this.establishedIncarnation;
  }

  rowOf(epoch) {
    return this.rows.get(epoch) || null;
  }

  topRow() {
    return this.rowOf(this.l);
  }

  replicatedAdmissionOpen() {
    const row = this.topRow();
    return row !== null && row.type === 'DECISION' && row.disposition === 'APPROVED';
  }

  obligationsDigest() {
    const entries = [...this.txn.entries()].map(([txn, st]) => [
      txn,
      st.decided ? `decided:${st.decided.outcome}` : st.preparedIndex !== null ? 'prepared' : 'staged',
    ]);
    entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return digestOf(entries);
  }

  releaseStateSignature() {
    return digestOf({
      l: this.l,
      top: this.topRow() ? this.topRow().bytes : null,
      obligations: this.obligationsDigest(),
    });
  }

  fullSignature() {
    return digestOf({
      l: this.l,
      rows: [...this.rows.entries()].sort((a, b) => a[0] - b[0]),
      txn: [...this.txn.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      effects: this.effects,
      annotations: this.annotations,
    });
  }
}

export class PartitionModel {
  constructor(mode, {r1 = 1, r2 = 1} = {}) {
    this.mode = mode;
    this.log = [];
    this.replicas = {
      r1: new Replica('r1', {startedIncarnation: r1}),
      r2: new Replica('r2', {startedIncarnation: r2}),
    };
    this.pending = new Map();
    this.nextEntryId = 1;
    this.d4Answers = [];
    this.retentions = [];
    this.epochReads = [];
    this.violations = [];
    this.trace = [];
    this.recording = true;
    this.lastApplyOutcome = null;
  }

  violate(invariant, detail) {
    if (!this.recording) return;
    if (this.violations.some((v) => v.invariant === invariant)) return;
    this.violations.push({
      invariant,
      atEntry: this.log.length,
      mode: this.mode,
      recentTrace: this.trace.slice(-4),
      detail,
    });
  }

  pushTrace(line) {
    if (this.recording) this.trace.push(line);
  }

  submit(cmd) {
    const bytes = digestOf(cmd);
    const entryId = `e${this.nextEntryId}`;
    this.nextEntryId += 1;
    const entry = {index: this.log.length + 1, cmd, bytes, entryId};
    this.pending.set(entryId, entry);
    return entry;
  }

  commit(entryId) {
    const entry = this.pending.get(entryId);
    this.pending.delete(entryId);
    this.log.push(entry);
    return entry;
  }

  commitNow(cmd) {
    return this.commit(this.submit(cmd).entryId);
  }

  censusNow() {
    return {stateDigest: this.releaseStateSignatureAtPrefix(this.log.length)};
  }

  releaseStateSignatureAtPrefix(k) {
    const upto = Math.min(k, this.log.length);
    const snapshot = new Replica('read');
    const wasRecording = this.recording;
    this.recording = false;
    try {
      for (let idx = 0; idx < upto; idx += 1) this.applyEntry(snapshot, this.log[idx]);
    } finally {
      this.recording = wasRecording;
    }
    return snapshot.releaseStateSignature();
  }

  applyUpTo(k) {
    const target = Math.min(k, this.log.length);
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const r of Object.values(this.replicas)) {
        if (r.appliedCount >= target) continue;
        const entry = this.log[r.appliedCount];
        r.appliedCount += 1;
        this.applyEntry(r, entry);
        this.applyGate(r);
        this.checkInvariants(r, entry);
        progressed = true;
      }
    }
  }

  applyAll() {
    this.applyUpTo(this.log.length);
  }

  reapply(replicaId, index) {
    const r = this.replicas[replicaId];
    const entry = this.log[index];
    if (!entry || r.appliedCount <= index) return;
    this.applyEntry(r, entry);
    this.checkInvariants(r, entry);
  }

  restartReplica(id) {
    this.replicas[id].restart();
    this.pushTrace({kind: 'restart', replica: id});
  }

  applyGate(r) {
    if (this.mode === MODE_REV2) this.deriveGateRev2(r);
    else this.deriveGateRev3(r);
  }

  deriveGateRev2(r) {
    const row = r.topRow();
    if (
      row &&
      row.type === 'DECISION' &&
      row.disposition === 'APPROVED' &&
      identityValid(CURRENT_IDENTITY) &&
      r.localObservationsMatch()
    ) {
      r.gate = 'OPEN';
      r.heldReason = null;
      return;
    }
    r.gate = 'CLOSED';
    r.heldReason = row ?
      'SUPERSEDED' :
      !r.localObservationsMatch() ?
        'INCARNATION_CHANGED' :
        'NO_DECISION';
  }

  deriveGateRev3(r) {
    const row = r.topRow();
    if (
      row &&
      row.type === 'DECISION' &&
      row.disposition === 'APPROVED' &&
      identityValid(CURRENT_IDENTITY) &&
      r.localObservationsMatch()
    ) {
      r.gate = 'OPEN';
      r.heldReason = null;
      return;
    }
    r.gate = 'CLOSED';
    r.heldReason = row ?
      row.type === 'HOLD' || (row.type === 'DECISION' && row.disposition !== 'APPROVED') ?
        'SUPERSEDED' :
        'IDENTITY_STALE' :
      !r.localObservationsMatch() ?
        'INCARNATION_CHANGED' :
        'NO_DECISION';
  }

  gateAtEpochRev2(r, epoch) {
    const row = r.rowOf(epoch);
    if (
      row &&
      row.type === 'DECISION' &&
      row.disposition === 'APPROVED' &&
      identityValid(CURRENT_IDENTITY) &&
      r.localObservationsMatch()
    ) {
      return 'OPEN';
    }
    return 'CLOSED';
  }

  annotateConflict(r, E, reason) {
    const winner = describeRow(resolveCurrentAuthority(r));
    r.annotations.push({kind: 'EPOCH_CONFLICT', epoch: E, reason, winner});
  }

  annotate(r, kind, detail) {
    r.annotations.push({kind, ...detail});
  }

  retain(r) {
    const live = [...r.rows.keys()];
    if (live.length <= RETENTION_BOUND) return;
    let retired = 0;
    for (const e of live) {
      if (live.length - retired <= RETENTION_BOUND) break;
      if (e === r.l) continue;
      const unsettled = [...r.txn.values()].some(
        (st) => st.stagedEpoch === e && !st.decided,
      );
      if (unsettled) continue;
      r.rows.delete(e);
      retired += 1;
      r.retiredBelow = Math.max(r.retiredBelow, e);
    }
    if (retired > 0) this.retentions.push({replica: r.id, retired});
  }

  applyEntry(r, entry) {
    const cmd = entry.cmd;
    const before = {l: r.l, rowsSig: rowsSignature(r.rows)};
    this.lastApplyOutcome = {kind: 'row', epoch: cmd.epoch};
    if (cmd.type === 'RELEASE_DECISION') this.applyReleaseDecision(r, entry);
    else if (cmd.type === 'RELEASE_HOLD') this.applyReleaseHold(r, entry);
    else this.applyOther(r, entry);
    if (this.mode === MODE_REV3) this.retain(r);
    r.appliedEntries.set(entry.entryId, entry.bytes);
    if (this.lastApplyOutcome.kind === 'refusal') {
      if (r.l !== before.l || rowsSignature(r.rows) !== before.rowsSig) {
        this.violate('C4-refusal-no-replace', {
          entryId: entry.entryId,
          note: 'a refused or stale command changed the durable release state',
        });
      }
    }
  }

  applyReleaseDecision(r, entry) {
    if (this.mode === MODE_REV2) this.applyReleaseDecisionRev2(r, entry);
    else this.applyReleaseDecisionRev3(r, entry);
  }

  // A refused or stale release command: the outcome is a refusal at E.
  refuseRelease(r, E, t, out) {
    this.lastApplyOutcome = {kind: 'refusal', epoch: E};
    this.pushTrace({t, r: r.id, E, out});
  }

  applyReleaseDecisionRev2(r, entry) {
    const cmd = entry.cmd;
    const E = cmd.epoch;
    const row = r.rowOf(E);
    const valid = identityValid(cmd.identity);
    if (sameEntryRow(row, entry)) {
      this.pushTrace({t: 'T2', r: r.id, E, out: 'REPLAYED'});
      this.lastApplyOutcome = {kind: 'replay', epoch: E};
      r.gate = this.gateAtEpochRev2(r, E);
      return;
    }
    if (valid && rev2DecisionAdmissible(r, E, row, entry)) {
      if (rowBytesDiffer(row, entry)) {
        this.violate('C4-refusal-no-replace', {
          entryId: entry.entryId,
          epoch: E,
          note: 'a stale epoch command overwrote an existing disposition row',
        });
      }
      this.writeDecisionRow(r, E, cmd, entry);
      this.pushTrace({t: 'T1', r: r.id, E, out: cmd.disposition});
      return;
    }
    if (E <= r.l && rowBytesDiffer(row, entry)) {
      this.annotate(r, 'EPOCH_CONFLICT', {epoch: E, reason: 'conflicting-bytes'});
      this.refuseRelease(r, E, 'T3', 'EPOCH_CONFLICT');
      return;
    }
    if (!valid) {
      this.annotate(r, 'REFUSED_APPLY', {epoch: E, reason: 'identity_invalid'});
      r.l = E;
      this.refuseRelease(r, E, 'T5', 'REFUSED_APPLY');
      return;
    }
    this.annotate(r, 'REFUSED_APPLY', {epoch: E, reason: 'precondition'});
    this.refuseRelease(r, E, 'T5', 'REFUSED_APPLY');
  }

  applyReleaseDecisionRev3(r, entry) {
    const cmd = entry.cmd;
    const E = cmd.epoch;
    const row = r.rowOf(E);
    const valid = identityValid(cmd.identity);
    const expected = this.releaseStateSignatureAtPrefix(entry.index - 1);
    const censusCurrent = cmd.census && cmd.census.stateDigest === expected;

    if (sameEntryRow(row, entry)) {
      this.pushTrace({t: 'T2', r: r.id, E, out: 'REPLAYED'});
      this.lastApplyOutcome = {kind: 'replay', epoch: E};
      return;
    }
    if (E <= r.l) {
      this.annotateConflict(r, E, 'epoch-spent');
      this.refuseRelease(r, E, 'T3', 'EPOCH_CONFLICT');
      return;
    }
    if (!valid) {
      this.annotate(r, 'REFUSED_APPLY', {epoch: E, reason: 'identity_invalid'});
      this.refuseRelease(r, E, 'T5', 'REFUSED_APPLY');
      return;
    }
    if (!censusCurrent) {
      this.annotate(r, 'REFUSED_APPLY', {epoch: E, reason: 'census_stale'});
      this.refuseRelease(r, E, 'T1', 'CENSUS_STALE');
      return;
    }
    if (E !== r.l + 1) {
      this.annotate(r, 'REFUSED_APPLY', {epoch: E, reason: 'epoch_gap'});
      this.refuseRelease(r, E, 'T1', 'EPOCH_GAP');
      return;
    }
    this.writeDecisionRow(r, E, cmd, entry);
    this.pushTrace({t: 'T1', r: r.id, E, out: cmd.disposition});
  }

  writeDecisionRow(r, E, cmd, entry) {
    const expected = this.releaseStateSignatureAtPrefix(entry.index - 1);
    if (!cmd.census || cmd.census.stateDigest !== expected) {
      this.violate('B-census-binding', {
        entryId: entry.entryId,
        epoch: E,
        note: 'a disposition row was written whose census does not name the replicated state at its own prefix',
      });
    }
    r.rows.set(E, {
      type: 'DECISION',
      epoch: E,
      disposition: cmd.disposition,
      bytes: entry.bytes,
      entryId: entry.entryId,
      censusBound: Boolean(cmd.census && cmd.census.stateDigest === expected),
    });
    r.l = E;
    this.lastApplyOutcome = {kind: 'row', epoch: E};
  }

  applyReleaseHold(r, entry) {
    if (this.mode === MODE_REV2) this.applyReleaseHoldRev2(r, entry);
    else this.applyReleaseHoldRev3(r, entry);
  }

  writeHoldRow(r, E, cmd, entry) {
    r.rows.set(E, {
      type: 'HOLD',
      epoch: E,
      supersedes: cmd.supersedes,
      bytes: entry.bytes,
      entryId: entry.entryId,
    });
    r.l = E;
    this.lastApplyOutcome = {kind: 'row', epoch: E};
    this.pushTrace({t: 'T6', r: r.id, E, out: 'HOLD'});
  }

  replayHold(r, E) {
    this.pushTrace({t: 'T6', r: r.id, E, out: 'REPLAYED'});
    this.lastApplyOutcome = {kind: 'replay', epoch: E};
  }

  applyReleaseHoldRev2(r, entry) {
    const cmd = entry.cmd;
    const E = cmd.epoch;
    if (sameEntryRow(r.rowOf(E), entry)) {
      this.replayHold(r, E);
      return;
    }
    if (cmd.supersedes <= r.l && E > r.l) {
      this.writeHoldRow(r, E, cmd, entry);
      return;
    }
    this.annotate(r, 'EPOCH_CONFLICT', {epoch: E, reason: 'hold-precondition'});
    this.refuseRelease(r, E, 'T6', 'EPOCH_CONFLICT');
  }

  applyReleaseHoldRev3(r, entry) {
    const cmd = entry.cmd;
    const E = cmd.epoch;
    if (sameEntryRow(r.rowOf(E), entry)) {
      this.replayHold(r, E);
      return;
    }
    if (E <= r.l) {
      this.annotateConflict(r, E, 'epoch-spent');
      this.refuseRelease(r, E, 'T6', 'EPOCH_CONFLICT');
      return;
    }
    if (cmd.supersedes > r.l || E !== r.l + 1) {
      this.annotate(r, 'REFUSED_APPLY', {epoch: E, reason: 'hold_precondition'});
      this.refuseRelease(r, E, 'T6', 'REFUSED_APPLY');
      return;
    }
    this.writeHoldRow(r, E, cmd, entry);
  }

  applyOther(r, entry) {
    const previouslyApplied = r.appliedEntries.has(entry.entryId);
    if (this.mode === MODE_REV2) return this.applyOtherRev2(r, entry, previouslyApplied);
    return this.applyOtherRev3(r, entry, previouslyApplied);
  }

  traceTxn(r, out, cmd) {
    this.pushTrace({t: 'T7', r: r.id, out, txn: cmd.txn});
  }

  // Rev2 replays only a WRITE; every other command re-applies.
  applyOtherRev2(r, entry, previouslyApplied) {
    const cmd = entry.cmd;
    const apply = REV2_OTHER_APPLY[cmd.type];
    if (apply === undefined) return;
    if (cmd.type === 'WRITE' && previouslyApplied) {
      this.traceTxn(r, 'WRITE_REPLAYED', cmd);
      return;
    }
    this[apply](r, entry);
  }

  applyWriteRev2(r, entry) {
    const cmd = entry.cmd;
    if (r.gate === 'OPEN') {
      r.effects.push({entryId: entry.entryId, txn: cmd.txn, executed: true});
      this.checkWriteBinding(r, cmd, entry);
      this.traceTxn(r, 'WRITE_EXECUTED', cmd);
      return;
    }
    r.effects.push({
      entryId: entry.entryId,
      txn: cmd.txn,
      executed: false,
      reason: 'WRITE_CUTOVER_PAUSED',
    });
    this.traceTxn(r, 'WRITE_REFUSED', cmd);
  }

  applyBeginRev2(r, entry) {
    const cmd = entry.cmd;
    if (r.gate === 'OPEN') {
      stageTxn(r, cmd, entry);
      this.traceTxn(r, 'STAGED', cmd);
    } else {
      this.traceTxn(r, 'BEGIN_REFUSED', cmd);
    }
  }

  applyPrepareRev2(r, entry) {
    const cmd = entry.cmd;
    const staged = r.txn.get(cmd.txn);
    r.txn.set(cmd.txn, {...(staged || blankTxn()), preparedIndex: entry.index});
    if (!staged && !r.replicatedAdmissionOpen()) {
      this.violate('E-prepare-classification', {
        entryId: entry.entryId,
        txn: cmd.txn,
        note: 'a fresh, unstaged PREPARE was admitted while the replicated state was HELD',
      });
    }
    this.traceTxn(r, staged ? 'PREPARE_SETTLED' : 'PREPARE_APPLIED', cmd);
  }

  applyTxnDecision(r, entry) {
    const cmd = entry.cmd;
    const st = r.txn.get(cmd.txn) || blankTxn();
    st.decided = {outcome: cmd.outcome, index: entry.index};
    r.txn.set(cmd.txn, st);
    this.traceTxn(r, `DECISION_${cmd.outcome}`, cmd);
  }

  // Rev3 replays every transaction command under its own entry identity.
  applyOtherRev3(r, entry, previouslyApplied) {
    const cmd = entry.cmd;
    const apply = REV3_OTHER_APPLY[cmd.type];
    if (apply === undefined) return;
    if (previouslyApplied) {
      this.traceTxn(r, `${cmd.type}_REPLAYED`, cmd);
      return;
    }
    this[apply](r, entry);
  }

  applyWriteRev3(r, entry) {
    const cmd = entry.cmd;
    const bound = cmd.admissionEpoch;
    const boundKnown = bound > r.retiredBelow;
    const boundRow = boundKnown ? r.rowOf(bound) : null;
    const admitted = approvedDecisionRow(boundRow) && bound === r.l;
    if (admitted) {
      r.effects.push({
        entryId: entry.entryId,
        txn: cmd.txn,
        executed: true,
        admissionEpoch: bound,
      });
      this.checkWriteBinding(r, cmd, entry);
      this.traceTxn(r, 'WRITE_EXECUTED', cmd);
      return;
    }
    r.effects.push({
      entryId: entry.entryId,
      txn: cmd.txn,
      executed: false,
      reason: 'STALE_ADMISSION',
      bound,
      currentEpoch: r.l,
    });
    this.lastApplyOutcome = {kind: 'refusal', entryId: entry.entryId};
    this.traceTxn(r, 'WRITE_REFUSED_STALE_ADMISSION', cmd);
  }

  applyBeginRev3(r, entry) {
    const cmd = entry.cmd;
    const admitted = cmd.admissionEpoch === r.l &&
      approvedDecisionRow(r.rowOf(cmd.admissionEpoch));
    if (admitted) {
      stageTxn(r, cmd, entry);
      this.traceTxn(r, 'STAGED', cmd);
      return;
    }
    r.effects.push({
      entryId: entry.entryId,
      txn: cmd.txn,
      executed: false,
      reason: 'STALE_ADMISSION',
    });
    this.lastApplyOutcome = {kind: 'refusal', entryId: entry.entryId};
    this.traceTxn(r, 'BEGIN_REFUSED_STALE_ADMISSION', cmd);
  }

  applyPrepareRev3(r, entry) {
    const cmd = entry.cmd;
    const staged = r.txn.get(cmd.txn);
    if (!staged && !r.replicatedAdmissionOpen()) {
      this.annotate(r, 'PREPARE_ADMISSIBILITY_REFUSED', {txn: cmd.txn});
      this.lastApplyOutcome = {kind: 'refusal', txn: cmd.txn};
      this.traceTxn(r, 'PREPARE_REFUSED', cmd);
      return;
    }
    if (staged) {
      r.txn.set(cmd.txn, {...staged, preparedIndex: entry.index});
      this.traceTxn(r, 'PREPARE_SETTLED', cmd);
      return;
    }
    r.txn.set(cmd.txn, {
      stagedEpoch: r.l,
      stagedAt: entry.index,
      preparedIndex: entry.index,
      decided: null,
    });
    this.traceTxn(r, 'PREPARE_APPLIED', cmd);
  }

  checkWriteBinding(r, cmd, entry) {
    if (cmd.admissionEpoch !== undefined && cmd.admissionEpoch !== r.l) {
      this.violate('D-no-silent-adoption', {
        entryId: entry.entryId,
        txn: cmd.txn,
        boundEpoch: cmd.admissionEpoch,
        currentEpoch: r.l,
        note: 'work bound to an earlier epoch executed under the current epoch',
      });
    }
  }

  checkInvariants(r, entry) {
    if (r.l < r.lastL) {
      this.violate('C1-l-monotone', {
        replica: r.id,
        entryId: entry.entryId,
        from: r.lastL,
        to: r.l,
        note: 'T5 reduced lastAppliedReleaseEpoch',
      });
    }
    r.lastL = r.l;
    if (
      r.gate === 'OPEN' &&
      !(r.topRow() && r.topRow().type === 'DECISION' && r.topRow().disposition === 'APPROVED')
    ) {
      this.violate('C2-gate-supersession', {
        replica: r.id,
        entryId: entry.entryId,
        note: 'the gate opened for an epoch that is not the current applied epoch',
      });
    }
    for (const a of r.annotations) {
      if (a.kind === 'EPOCH_CONFLICT' && !a.winner) {
        this.violate('C3-conflict-names-winner', {
          replica: r.id,
          epoch: a.epoch,
          note: 'an EPOCH_CONFLICT annotation does not name the winning disposition',
        });
      }
    }
    if (r1r2Synced(this)) checkDeterminism(this);
  }

  d4Read(entryId, prefix) {
    const upto = Math.min(prefix, this.log.length);
    const entry = this.log.slice(0, upto).find((e) => e.entryId === entryId);
    const r = this.replicas.r1;
    let answer;
    if (this.mode === MODE_REV2) {
      if (!entry) {
        answer = {requestId: entryId, prefix: upto, class: 'NOT_COMMITTED', terminal: true, action: 'full-fallback'};
        this.violate('F1-uncertainty-nonterminal', {
          entryId,
          prefix: upto,
          note: 'an entryId-absence read at one instant was reported as the terminal aborted class',
        });
      } else {
        answer = {requestId: entryId, prefix: upto, class: 'COMMITTED', epoch: entry.cmd.epoch, disposition: entry.cmd.disposition};
      }
    } else if (!entry) {
      answer = {requestId: entryId, prefix: upto, class: 'PENDING', terminal: false};
    } else {
      answer = {
        requestId: entryId,
        prefix: upto,
        bytes: entry.bytes,
        class: 'COMMITTED',
        epoch: entry.cmd.epoch,
        disposition: entry.cmd.disposition,
        applied: r.appliedEntries.has(entryId),
      };
    }
    this.d4Answers.push(answer);
    return answer;
  }

  readEpoch(epoch) {
    const r = this.replicas.r1;
    const row = r.rowOf(epoch);
    if (row) {
      const answer = {epoch, typed: row.disposition, type: row.type};
      this.epochReads.push(answer);
      return answer;
    }
    let answer;
    if (this.mode === MODE_REV2) {
      answer = {epoch, typed: 'UNKNOWN_EPOCH'};
    } else if (r.retiredBelow >= epoch) {
      answer = {epoch, typed: 'RETIRED', knowable: 'history-retired-below-watermark'};
    } else if (epoch <= r.l) {
      answer = {epoch, typed: 'SPENT_WITHOUT_ROW'};
    } else {
      answer = {epoch, typed: 'PENDING'};
    }
    this.epochReads.push(answer);
    return answer;
  }
}

function r1r2Synced(m) {
  return m.replicas.r1.appliedCount === m.replicas.r2.appliedCount;
}

function checkDeterminism(m) {
  const a = m.replicas.r1.fullSignature();
  const b = m.replicas.r2.fullSignature();
  if (a !== b) {
    m.violate('A-deterministic-effects', {
      r1: a,
      r2: b,
      note: 'replicas that applied the same committed prefix persisted different applied state',
    });
  }
}

function resolveCurrentAuthority(r) {
  const row = r.topRow();
  if (row) return {epoch: row.epoch, kind: row.type, disposition: row.disposition || null};
  return {epoch: r.l, kind: 'NO_ROW', disposition: null};
}

function describeRow(resolved) {
  return resolved;
}

function blankTxn() {
  return {stagedEpoch: null, stagedAt: null, preparedIndex: null, decided: null};
}

// The row already holds exactly this committed entry: a replay.
function sameEntryRow(row, entry) {
  return Boolean(row && row.bytes === entry.bytes && row.entryId === entry.entryId);
}

function rowBytesDiffer(row, entry) {
  return Boolean(row && row.bytes !== entry.bytes);
}

// Rev2 T1: a fresh epoch, or the current epoch re-carrying its own bytes.
function rev2DecisionAdmissible(r, E, row, entry) {
  return E > r.l || (E === r.l && Boolean(row) && row.bytes === entry.bytes);
}

function approvedDecisionRow(row) {
  return Boolean(row && row.type === 'DECISION' && row.disposition === 'APPROVED');
}

function stageTxn(r, cmd, entry) {
  r.txn.set(cmd.txn, {
    stagedEpoch: r.l,
    stagedAt: entry.index,
    preparedIndex: null,
    decided: null,
  });
}

#!/usr/bin/env node

// Runner for the release-linearization verification model
// (test/model/participant-release-disposition/model.js).
//
// For each review-required scenario A-G it runs two executable rule sets and
// asserts one thing about each:
//   rev2-published - the counterexamples the review requires MUST fire: the
//                    counterexamples to the published rules stay retained and
//                    reproducible; the published rules were not silently
//                    "corrected" in place.
//   rev3-corrected - the corrected transition-table rules MUST satisfy every
//                    modeled invariant and every named positive claim.
//
// The exploration is bounded and explicit: fixed finite schedules, applied
// entry by entry, summarized per scenario. No unrestricted proof is claimed.
//
// Exit 0 only when every rev2 expectation and every rev3 expectation holds.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  MODE_REV2,
  MODE_REV3,
  PartitionModel,
  identityOf,
} from '../../test/model/participant-release-disposition/model.js';

const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayEvery = Function.call.bind(Array.prototype.every);

const NUM_ZERO = 0;
const NUM_ONE = 1;
const NEWLINE = '\n';
const TXN_T2 = 't2';

const CMD_RELEASE_DECISION = 'RELEASE_DECISION';
const CMD_RELEASE_HOLD = 'RELEASE_HOLD';
const CMD_WRITE = 'WRITE';
const CMD_BEGIN = 'BEGIN';
const CMD_PREPARE = 'PREPARE';
const CMD_DECISION = 'DECISION';
const DISPOSITION_APPROVED = 'APPROVED';
const CENSUS_DEFECT_REASON = 'census-defect';
const PUBLISHED_RULES_GAP_NOTE = 'the published rules lack this behavior';
const REV2_EVIDENCE_FILENAME = 'rev2-counterevidence.json';
const REV3_EVIDENCE_FILENAME = 'rev3-correction-evidence.json';
const SUMMARY_FILENAME = 'summary.json';
const EVIDENCE_DIR_FLAG = '--evidence-dir';
const DEFAULT_REPORT_DIR = path.join('test-output', 'reports', 'participant-release-transition-model');
const REV2_RULES_TEXT = 'revision-2 section 10 rows T1-T7 (published, preserved byte-for-byte as executable rules)';
const REV3_RULES_TEXT = 'addendum corrected transition table';
const BOUNDS_TEXT = 'fixed finite schedules; per-scenario step and apply-event counts reported; no exhaustive or unbounded exploration claimed';
const MARK_OK = 'ok';
const MARK_FAIL = 'FAIL';
const EVIDENCE_PREFIX = 'evidence: ';
const TXN_W1 = 'w1';
const TXN_OLD_WORK = 'old-work';
const TXN_NEW_WORK = 'new-work';
const TXN_RETIRED_EPOCH_WORK = 'retired-epoch-work';
const KIND_EPOCH_CONFLICT = 'EPOCH_CONFLICT';
const KIND_PREPARE_ADMISSIBILITY_REFUSED = 'PREPARE_ADMISSIBILITY_REFUSED';
function approvedDecision(
  epoch,
  census,
  identity = identityOf(),
  disposition = DISPOSITION_APPROVED,
) {
  return {
    type: CMD_RELEASE_DECISION,
    epoch,
    disposition,
    reason: disposition === DISPOSITION_APPROVED ? undefined : CENSUS_DEFECT_REASON,
    identity,
    census,
  };
}

function hold(epoch, supersedes) {
  return {type: CMD_RELEASE_HOLD, epoch, supersedes};
}

function write(txn, admissionEpoch) {
  return {type: CMD_WRITE, txn, admissionEpoch};
}

function begin(txn, admissionEpoch) {
  return {type: CMD_BEGIN, txn, admissionEpoch};
}

function prepare(txn) {
  return {type: CMD_PREPARE, txn};
}

function decide(txn, outcome) {
  return {type: CMD_DECISION, txn, outcome};
}

function invalidIdentity() {
  return identityOf({targetBuildDigest: ''});
}

const SCENARIOS = [
  {
    id: 'A-restart-d3-determinism',
    review: 'A: committed application versus local eligibility',
    rev2Expect: ['A-deterministic-effects'],
    run(m, obs) {
      m.commitNow(approvedDecision(1, m.censusNow()));
      m.applyAll();
      m.restartReplica('r2');
      m.commitNow(write('w1', 1));
      m.applyAll();
      obs.gates = {
        r1: m.replicas.r1.gate,
        r2: m.replicas.r2.gate,
        r2Reason: m.replicas.r2.heldReason,
      };
      obs.w1 = arrayFind(m.replicas.r2.effects, (e) => e.txn === TXN_W1);
      return [
        {id: 'committed-effect-identical-despite-d3', ok: Boolean(obs.w1 && obs.w1.executed === true), observed: obs},
        {id: 'd3-may-differ-across-replicas', ok: obs.gates.r1 === 'OPEN' && obs.gates.r2 === 'CLOSED', observed: obs.gates},
      ];
    },
  },
  {
    id: 'B-stale-attempt-vs-newer-hold',
    review: 'B: authorization consumes exact expected state',
    rev2Expect: ['B-census-binding', 'B-stale-reopen-observed'],
    run(m, obs) {
      m.commitNow(approvedDecision(1, m.censusNow()));
      m.applyAll();
      const staleCensus = m.censusNow();
      m.commitNow(hold(2, 1));
      m.applyAll();
      m.commitNow(approvedDecision(3, staleCensus));
      m.applyAll();
      m.commitNow(approvedDecision(2, staleCensus));
      m.applyAll();
      m.commitNow(approvedDecision(1, m.censusNow()));
      m.applyAll();
      obs.approvedRows = arrayMap(
        arrayFilter(
          [...m.replicas.r1.rows.values()],
          (row) => row.disposition === DISPOSITION_APPROVED,
        ),
        (row) => row.epoch,
      );
      obs.noReopen = !arraySome(obs.approvedRows, (epoch) => epoch > 1);
      return [
        m.claim('stale-decision-did-not-reopen', obs.noReopen, {approvedRows: obs.approvedRows}),
        m.claim('hold-still-current', m.replicas.r1.topRow() && m.replicas.r1.topRow().type === 'HOLD', {top: m.replicas.r1.topRow()}),
      ];
    },
    rev2Injection(m) {
      const reopened = arraySome(
        [...m.replicas.r1.rows.values()],
        (row) => row.disposition === DISPOSITION_APPROVED && row.epoch > 1,
      );
      const injection = [];
      if (reopened) {
        injection.push({
          invariant: 'B-stale-reopen-observed',
          detail: {note: 'a numerically larger epoch with a pre-HOLD census reopened past the committed HOLD'},
        });
      }
      return injection;
    },
  },
  {
    id: 'C-monotonicity-and-replay',
    review: 'C: monotonicity, replay and conflicting epochs',
    rev2Expect: [
      'C1-l-monotone',
      'C2-gate-supersession',
      'C3-conflict-names-winner',
      'C4-refusal-no-replace',
    ],
    run(m, obs) {
      if (m.mode === MODE_REV2) {
        m.commitNow(approvedDecision(2, m.censusNow()));
        m.applyAll();
        m.commitNow(hold(3, 2));
        m.applyAll();
        m.reapply('r1', 0);
        obs.gateAfterReplay = {gate: m.replicas.r1.gate, top: m.replicas.r1.topRow().type};
        m.commitNow(approvedDecision(1, m.censusNow(), invalidIdentity()));
        m.applyAll();
        obs.lAfterInvalid = m.replicas.r1.l;
        m.commitNow(approvedDecision(2, m.censusNow(), identityOf(), 'REFUSED'));
        m.applyAll();
        obs.epoch2RowAfterStale = m.replicas.r1.rowOf(2).disposition;
        m.commitNow(approvedDecision(2, m.censusNow()));
        m.applyAll();
        obs.conflictAnnotations = arrayFilter(
          m.replicas.r1.annotations,
          (a) => a.kind === KIND_EPOCH_CONFLICT,
        );
      } else {
        m.commitNow(approvedDecision(1, m.censusNow()));
        m.applyAll();
        m.commitNow(approvedDecision(2, m.censusNow()));
        m.applyAll();
        m.commitNow(hold(3, 2));
        m.applyAll();
        m.reapply('r1', 1);
        obs.gateAfterReplay = {gate: m.replicas.r1.gate, top: m.replicas.r1.topRow().type};
        m.commitNow(approvedDecision(1, m.censusNow(), invalidIdentity()));
        m.applyAll();
        obs.lAfterInvalid = m.replicas.r1.l;
        m.commitNow(approvedDecision(2, m.censusNow(), identityOf(), 'REFUSED'));
        m.applyAll();
        obs.epoch2RowAfterStale = m.replicas.r1.rowOf(2).disposition;
        m.commitNow(approvedDecision(2, m.censusNow()));
        m.applyAll();
        obs.conflictAnnotations = arrayFilter(
          m.replicas.r1.annotations,
          (a) => a.kind === KIND_EPOCH_CONFLICT,
        );
        m.commitNow(approvedDecision(4, m.censusNow()));
        m.applyAll();
        obs.releasedAfterHold = m.replicas.r1.rowOf(4);
      }
      return [
        m.claim(
          'replay-does-not-restore-authority',
          obs.gateAfterReplay.gate === 'CLOSED',
          obs.gateAfterReplay,
        ),
        m.claim(
          'invalid-lower-epoch-command-does-not-move-L',
          obs.lAfterInvalid === 3,
          {lAfterInvalid: obs.lAfterInvalid},
        ),
        m.claim(
          'stale-command-does-not-replace-disposition',
          obs.epoch2RowAfterStale === 'APPROVED',
          {epoch2Disposition: obs.epoch2RowAfterStale},
        ),
        m.claim(
          'conflict-annotations-name-winner',
          obs.conflictAnnotations.length === 0 ||
            arrayEvery(obs.conflictAnnotations, (a) => a.winner !== undefined),
          {annotations: obs.conflictAnnotations},
        ),
        m.claim(
          'legitimate-reauthorization-after-still-possible',
          m.mode === MODE_REV3 ? obs.releasedAfterHold.disposition === 'APPROVED' : true,
          {releasedAfterHold: obs.releasedAfterHold},
        ),
      ];
    },
  },
  {
    id: 'D-work-crossing-hold-and-reauthorization',
    review: 'D: work crossing HOLD and later reauthorization',
    rev2Expect: ['D-no-silent-adoption'],
    run(m, obs) {
      m.commitNow(approvedDecision(1, m.censusNow()));
      m.applyAll();
      m.commitNow(hold(2, 1));
      m.applyAll();
      m.commitNow(approvedDecision(3, m.censusNow()));
      m.applyAll();
      m.commitNow(write('old-work', 1));
      m.applyAll();
      m.commitNow(write('new-work', 3));
      m.applyAll();
      m.reapply('r1', 3);
      obs.oldEffect = arrayFind(m.replicas.r1.effects, (e) => e.txn === TXN_OLD_WORK);
      obs.newEffect = arrayFind(m.replicas.r1.effects, (e) => e.txn === TXN_NEW_WORK);
      obs.oldWorkEffectCount = arrayFilter(
        m.replicas.r1.effects,
        (e) => e.txn === TXN_OLD_WORK,
      ).length;
      return [
        m.claim(
          'old-work-never-adopt-newer-epoch',
          obs.oldEffect && obs.oldEffect.executed === false && obs.oldEffect.reason === 'STALE_ADMISSION',
          {oldEffect: obs.oldEffect},
        ),
        m.claim(
          'legitimate-new-epoch-work-executed',
          obs.newEffect && obs.newEffect.executed === true,
          {newEffect: obs.newEffect},
        ),
        m.claim(
          'exact-replay-of-settled-result-is-no-effect',
          obs.oldWorkEffectCount === 1,
          {oldWorkEffectCount: obs.oldWorkEffectCount},
        ),
      ];
    },
  },
  {
    id: 'E-prepare-versus-settlement',
    review: 'E: PREPARE versus settlement',
    rev2Expect: ['E-prepare-classification'],
    run(m, obs) {
      m.commitNow(approvedDecision(1, m.censusNow()));
      m.applyAll();
      m.commitNow(begin('t1', 1));
      m.applyAll();
      m.commitNow(hold(2, 1));
      m.applyAll();
      m.commitNow(prepare('t1'));
      m.applyAll();
      m.commitNow(prepare('t1'));
      m.applyAll();
      obs.t1Prepared = m.replicas.r1.txn.get('t1');
      m.commitNow(begin('t2', 1));
      m.applyAll();
      m.commitNow(prepare('t2'));
      m.applyAll();
      obs.t2 = m.replicas.r1.txn.get('t2') || null;
      obs.t2Annotation = arrayFind(m.replicas.r1.annotations,
        (a) => a.kind === KIND_PREPARE_ADMISSIBILITY_REFUSED && a.txn === TXN_T2,
      );
      m.commitNow(decide('t1', 'COMMIT'));
      m.applyAll();
      obs.t1Decided = m.replicas.r1.txn.get('t1').decided;
      return [
        m.claim(
          'settling-prepare-applies-while-held',
          obs.t1Prepared && obs.t1Prepared.preparedIndex !== null,
          {t1: obs.t1Prepared},
        ),
        m.claim(
          'duplicate-prepare-no-new-effect',
          obs.t1Prepared.decided && obs.t1Prepared.decided.outcome === 'COMMIT',
          {t1: obs.t1Decided},
        ),
        m.claim(
          'fresh-prepare-after-hold-is-no-settlement',
          Boolean(obs.t2Annotation),
          {annotation: obs.t2Annotation || null},
        ),
        m.claim(
          'authoritative-decision-applies',
          obs.t1Decided && obs.t1Decided.outcome === 'COMMIT',
          {t1: obs.t1Decided},
        ),
      ];
    },
  },
  {
    id: 'F-outcome-uncertainty',
    review: 'F: outcome uncertainty',
    rev2Expect: ['F1-uncertainty-nonterminal'],
    run(m, obs) {
      const entry = m.submit(approvedDecision(1, m.censusNow()));
      obs.beforeCommit = m.d4Read(entry.entryId, m.log.length);
      m.commit(entry.entryId);
      obs.readBeforeApply = m.readEpoch(1);
      m.applyAll();
      obs.afterCommit = m.d4Read(entry.entryId, m.log.length);
      return [
        m.claim(
          'intermediate-answer-nonterminal',
          obs.beforeCommit.terminal === false,
          {answer: obs.beforeCommit},
        ),
        m.claim(
          'F2-row-absence-not-proof',
          obs.readBeforeApply.typed === 'PENDING',
          {read: obs.readBeforeApply},
        ),
        m.claim(
          'answer-bound-to-identity-bytes-prefix',
          obs.afterCommit.bytes !== undefined && obs.afterCommit.prefix === m.log.length,
          {answer: obs.afterCommit},
        ),
        m.claim(
          'classification-monotone',
          obs.beforeCommit.class === 'PENDING' && obs.afterCommit.class === 'COMMITTED',
          {transition: [obs.beforeCommit.class, obs.afterCommit.class]},
        ),
      ];
    },
  },
  {
    id: 'G-retention-policy',
    review: 'G: retention',
    rev2Expect: ['D-no-silent-adoption', 'G-retention-policy-ran'],
    run(m, obs) {
      for (const epoch of [1, 2, 3, 4]) {
        m.commitNow(approvedDecision(epoch, m.censusNow()));
        m.applyAll();
      }
      m.commitNow(approvedDecision(5, m.censusNow()));
      m.applyAll();
      m.commitNow(write('retired-epoch-work', 1));
      m.applyAll();
      m.commitNow(approvedDecision(1, m.censusNow()));
      m.applyAll();
      m.commitNow(hold(6, 5));
      m.applyAll();
      obs.retentions = m.retentions;
      obs.readEpoch1 = m.readEpoch(1);
      obs.stale = arrayFind(m.replicas.r1.effects, (e) => e.txn === TXN_RETIRED_EPOCH_WORK);
      obs.holdRow = m.replicas.r1.rowOf(6);
      return [
        m.claim('G-retention-policy-ran', obs.retentions.length > 0, {retentions: obs.retentions}),
        m.claim(
          'retired-answer-typed-not-fabricated',
          obs.readEpoch1.typed === 'RETIRED' || m.mode === MODE_REV2,
          {read: obs.readEpoch1},
        ),
        m.claim(
          'watermark-denies-but-does-not-invent',
          obs.stale && obs.stale.executed === false && obs.stale.reason === 'STALE_ADMISSION',
          {stale: obs.stale},
        ),
        m.claim(
          'fencing-possible-at-capacity',
          obs.holdRow !== null && obs.holdRow.type === 'HOLD',
          {holdRow: obs.holdRow},
        ),
        m.claim(
          'retired-answer-not-never-committed',
          obs.readEpoch1.typed !== 'UNKNOWN_EPOCH',
          {read: obs.readEpoch1},
        ),
      ];
    },
  },
];

function runScenario(scenario, mode) {
  const m = new PartitionModel(mode);
  m.claim = (id, ok, observed) => ({id, ok, observed});
  const obs = {};
  const claims = scenario.run(m, obs) || [];
  let counterexamples = arrayMap(m.violations, (v) => ({
    invariant: v.invariant,
    detail: v.detail,
    atEntry: v.atEntry,
    recentTrace: v.recentTrace,
  }));
  if (mode === MODE_REV2 && scenario.rev2Injection) {
    counterexamples = counterexamples.concat(scenario.rev2Injection(m));
  }
  if (mode === MODE_REV2) {
    for (const c of claims) {
      if (!c.ok) {
        counterexamples = counterexamples.concat({
          invariant: c.id,
          detail: {note: PUBLISHED_RULES_GAP_NOTE, observed: c.observed},
        });
      }
    }
  }
  const foundIds = [...new Set(arrayMap(counterexamples, (v) => v.invariant))];
  const missing =
    mode === MODE_REV2 ?
      arrayFilter(scenario.rev2Expect, (id) => !arrayIncludes(foundIds, id)) :
      foundIds;
  const ok =
    mode === MODE_REV2 ?
      missing.length === 0 :
      missing.length === 0 && arrayEvery(claims, (c) => c.ok);
  return {
    scenario: scenario.id,
    reviewSection: scenario.review,
    mode,
    committedEntries: m.log.length,
    applyEvents: m.replicas.r1.appliedCount,
    ok,
    missing,
    expectedCounterexamples: mode === MODE_REV2 ? scenario.rev2Expect : [],
    counterexamples,
    claims,
    d4Answers: m.d4Answers,
    epochReads: m.epochReads,
  };
}

function main() {
  const args = process.argv.slice(2);
  const flagIndex = arrayIndexOf(args, EVIDENCE_DIR_FLAG);
  const evidenceDir = flagIndex >= 0 ? args[flagIndex + 1] : DEFAULT_REPORT_DIR;
  const results = [];
  for (const scenario of SCENARIOS) {
    results.push(runScenario(scenario, MODE_REV2));
    results.push(runScenario(scenario, MODE_REV3));
  }
  fs.mkdirSync(evidenceDir, {recursive: true});
  const payload = {
    model: 'test/model/participant-release-disposition/model.js',
    runner: 'scripts/checks/participant-release-committed-disposition-transition-model.js',
    rules: {
      rev2: REV2_RULES_TEXT,
      rev3: REV3_RULES_TEXT,
    },
    bounds: BOUNDS_TEXT,
    results,
  };
  fs.writeFileSync(
    path.join(evidenceDir, REV2_EVIDENCE_FILENAME),
    `${JSON.stringify({bounds: payload.bounds, results: arrayFilter(results, (r) => r.mode === MODE_REV2)}, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(evidenceDir, REV3_EVIDENCE_FILENAME),
    `${JSON.stringify({bounds: payload.bounds, results: arrayFilter(results, (r) => r.mode === MODE_REV3)}, null, 2)}\n`,
  );
  let green = true;
  for (const r of results) {
    const mark = r.ok ? MARK_OK : MARK_FAIL;
    if (!r.ok) green = false;
    process.stdout.write(
      `${mark} ${r.scenario} [${r.mode}] entries=${r.committedEntries} missing=${JSON.stringify(r.missing)}\n`,
    );
  }
  fs.writeFileSync(
    path.join(evidenceDir, SUMMARY_FILENAME),
    `${JSON.stringify({green, bounds: payload.bounds, results}, null, 2)}\n`,
  );
  process.stdout.write(EVIDENCE_PREFIX + evidenceDir + NEWLINE);
  return green ? NUM_ZERO : NUM_ONE;
}

process.exit(main());

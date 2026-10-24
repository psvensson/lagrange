import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';

const SOURCE = Object.freeze({
  COORDINATOR:
    'src/query/distributed/distributed-transaction-coordinator.js',
  PROTOCOL:
    'src/query/distributed/distributed-transaction-protocol.js',
  RECOVERY:
    'src/query/distributed/distributed-transaction-recovery.js',
  // The re-drive's authoritative read: the recovered state it restores.
  RECOVERY_AUTHORITY:
    'src/query/distributed/distributed-transaction-recovery-authority.js',
  // The freeze owner: it selects the mode and persists it with the frozen set.
  PARTICIPANT_SET:
    'src/query/distributed/distributed-transaction-participant-set.js',
  // Recovery's row validation, extracted from the recovery owner (TX1
  // increment: it would otherwise exceed the source size ceiling).
  RECOVERY_VALIDATION:
    'src/query/distributed/distributed-transaction-recovery-validation.js',
  SQL_WRITE: 'src/query/sql-query-engine-write-execution.js',
  TRANSITION:
    'src/rebalancer/operation-workflow-transition-orchestration.js',
  TRANSITION_OPTIONS:
    'src/rebalancer/operation-workflow-owner-execution-lane.js',
  CDC: 'src/cdc/cdc-routed-mutation-readiness.js',
});

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('transaction commit mode remains owned after the final participant plan',
  (t) => {
    const coordinator = read(SOURCE.COORDINATOR);
    const protocol = read(SOURCE.PROTOCOL);
    const recovery = read(SOURCE.RECOVERY);
    const recoveryValidation = read(SOURCE.RECOVERY_VALIDATION);
    const recoveryAuthority = read(SOURCE.RECOVERY_AUTHORITY);
    const participantSet = read(SOURCE.PARTICIPANT_SET);
    const sqlWrite = read(SOURCE.SQL_WRITE);
    const transition = read(SOURCE.TRANSITION);
    const transitionOptions = read(SOURCE.TRANSITION_OPTIONS);
    const cdc = read(SOURCE.CDC);
    const ownerPath = [
      coordinator,
      protocol,
      recovery,
      recoveryValidation,
      recoveryAuthority,
      participantSet,
      sqlWrite,
      transition,
      transitionOptions,
      cdc,
    ].join('\n');

    t.notMatch(ownerPath, /bypassSingleParticipantSystemWrite/u);
    t.notMatch(transition, /transactionCoordinator/u,
      'rebalancer transition persistence is an independent mutation');
    t.match(transitionOptions, /disableSystemWriteSession: true/u);
    t.match(sqlWrite, /addTransitionMirrorParticipants[\s\S]*openWriteTransaction/u,
      'SQL classifies only after adding the transition mirror');
    t.match(coordinator, /runTransactionOperation/u,
      'session operations use FIFO serialization, not single-flight sharing');
    t.match(participantSet, /buildFrozenTransactionDecision/u);
    t.match(participantSet,
      /persistAdmittedParticipantSet\(tx, \{\.\.\.tx, \.\.\.frozen\}\);\s*Object\.assign\(tx, frozen\)/u,
      'mode selection persists with the frozen set before it is adopted');
    t.match(coordinator,
      /await this\.freezeParticipantSet\(tx\);[\s\S]*this\.runCommitProtocol\(tx\)/u,
      'freeze and mode selection persist before protocol dispatch');
    t.match(recoveryValidation,
      /frozenParticipantCount === tx\.participants\.size/u);
    t.match(recovery, /recoveryObligationStageRefusal\(tx, operation\)[\s\S]*recoveryDiscovered === true/u,
      'a restored obligation is the recovery owner\'s until its re-drive');
    t.match(coordinator,
      /recoveryObligationStageRefusal\(tx, QUERY_OPERATION\.COMMIT\);[\s\S]*freezeParticipantSet\(tx\)/u,
      'a session COMMIT never freezes or decides a restored obligation');
    t.match(recoveryAuthority,
      /validateRecoveredTransactionDecision\(candidate[\s\S]*Object\.assign\(tx, authority\.candidate\)/u,
      'a re-drive validates the authoritative decision before adopting it');
    t.match(protocol, /resolveParticipantCommitOutcome/u);
    t.notMatch(sqlWrite, /queryOptions\?\.(transactionMode|commitMode)/u,
      'caller-provided modes do not participate in owner selection');
    t.end();
  });

from pathlib import Path
import sys


def replace_once(path, before, after):
    p = Path(path)
    text = p.read_text()
    assert text.count(before) == 1, (path, 'correction anchor drift')
    p.write_text(text.replace(before, after))


module = 'src/rebalancer/replica-operation-message-group-membership-authorization.js'
if sys.argv[1] == 'tests':
    replace_once('test/integration/message-group-learner-runtime-authorization.integration.test.js',
        'assert.equal(JSON.parse(f.row().message_group_membership_permit).leaderTerm, initial.leaderTerm);',
        'assert.equal(JSON.parse(f.row().message_group_membership_permit).leaderTerm,\n        initial.leaderTerm);')
    replace_once('test/integration/message-group-membership-claim-cache.integration.test.js',
        'message_group_learner_stamp: JSON.stringify(learnerStamp)};',
        'message_group_learner_stamp: JSON.stringify(committedStampOfAnswer(learnerStamp))};')
elif sys.argv[1] == 'source':
    replace_once(module,
        'const origin = decodeCommittedLearnerAdmission(encodeCommittedLearnerAdmission(observed.receipt));',
        'const encodedOrigin = encodeCommittedLearnerAdmission(observed.receipt);\n    const origin = decodeCommittedLearnerAdmission(encodedOrigin);')
    replace_once(module,
        'function learnerOutcomeEvidence(observed, input, query) {',
        '''function originalLearnerOriginMatches(origin, input, query) {
  return origin !== INVALID_COMMITTED_LEARNER_ADMISSION &&
    origin.groupId === query.groupId &&
    JSON.stringify(origin.context) === JSON.stringify(query.action) &&
    Number(origin.term) === input.permit.leaderTerm &&
    Number(origin.index) > input.permit.leaderConfigurationStamp.membershipGenerationIndex;
}
function learnerOutcomeEvidence(observed, input, query) {''')
    replace_once(module,
        '''if (origin === INVALID_COMMITTED_LEARNER_ADMISSION || origin.groupId !== query.groupId ||
      JSON.stringify(origin.context) !== JSON.stringify(query.action) ||
      Number(origin.term) !== input.permit.leaderTerm ||
      Number(origin.index) <= input.permit.leaderConfigurationStamp.membershipGenerationIndex) {''',
        'if (!originalLearnerOriginMatches(origin, input, query)) {')
    replace_once(module,
        '/** Advance only the membership phase after actual, exact native observation.',
        '''function finishLearnerRecording(repository, row, input, evidence) {
  const refusal = recordingBasisRefusal(repository, row, input);
  if (refusal !== null) return result(refusal, row);
  if (exactRecordedLearner(row, input)) return result(OUTCOME.RECORDED, row);
  // An already-recorded observation cannot regress back into an in-flight row.
  if (evidence === null) return result(OUTCOME.CONFLICT, row);
  return recordObservedLearner(repository, row, input, evidence);
}
/** Advance only the membership phase after actual, exact native observation.''')
    replace_once(module,
        '''  const finalRefusal = recordingBasisRefusal(repository, current.row, input);
  if (finalRefusal !== null) return result(finalRefusal, current.row);
  if (exactRecordedLearner(current.row, input)) return result(OUTCOME.RECORDED, current.row);
  // An already-recorded observation cannot regress back into an in-flight row.
  if (evidence === null) return result(OUTCOME.CONFLICT, current.row);
  return recordObservedLearner(repository, current.row, input, evidence);''',
        '  return finishLearnerRecording(repository, current.row, input, evidence);')
    replace_once(module, 'function branchSettlementGuard(repository, row, spec) {',
        '''const MEMBERSHIP_SETTLEMENT_PREDICATE = Object.freeze({
  OPEN: 'completed_at IS NULL',
  EXACT_TERMINAL: 'completed_at = ?',
});
function branchSettlementGuard(repository, row, spec) {''')
    replace_once(module, "{sql: 'completed_at IS NULL', params: []}",
        '{sql: MEMBERSHIP_SETTLEMENT_PREDICATE.OPEN, params: []}')
    replace_once(module, "{sql: 'completed_at = ?', params: [row.completedAt]}",
        '{sql: MEMBERSHIP_SETTLEMENT_PREDICATE.EXACT_TERMINAL, params: [row.completedAt]}')
else:
    raise ValueError('unknown correction phase')

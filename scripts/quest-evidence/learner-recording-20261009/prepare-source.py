from pathlib import Path
p=Path('src/rebalancer/replica-operation-message-group-membership-authorization.js')
s=p.read_text()
a="const result = (outcome, operation = null) => Object.freeze({outcome, operation});"
assert s.count(a)==1
s=s.replace(a,a+"\nconst MEMBERSHIP_SETTLEMENT_SQL = Object.freeze({\n  NONTERMINAL: 'completed_at IS NULL', TERMINAL: 'completed_at = ?',\n});",1)
s=s.replace("return row.completedAt === null ? {sql: 'completed_at IS NULL', params: []} : null;", "return row.completedAt === null ?\n      {sql: MEMBERSHIP_SETTLEMENT_SQL.NONTERMINAL, params: []} : null;")
s=s.replace("{sql: 'completed_at = ?', params: [row.completedAt]}","{sql: MEMBERSHIP_SETTLEMENT_SQL.TERMINAL, params: [row.completedAt]}")
a=s.index('async function acquireLearnerCommitEvidence(')
b=s.index('function learnerRecordIdentityMatches(',a)
s=s[:a]+'''function decodedLearnerCommitEvidence(answer, input) {
  if (answer?.kind !== ACTION_KIND.COMMITTED) {
    return {outcome: answer?.kind === ACTION_KIND.UNRESOLVED ?
      OUTCOME.UNKNOWN : OUTCOME.UNAVAILABLE};
  }
  const origin = decodeCommittedLearnerAdmission(encodeCommittedLearnerAdmission(answer.receipt));
  return historicalLearnerMatches(origin, input, answer.observedAppliedIndex) ?
    {outcome: OUTCOME.RECORDED, origin} : {outcome: OUTCOME.CONFLICT};
}
async function acquireLearnerCommitEvidence(input, readMembership) {
  try {
    const historical = decodedLearnerCommitEvidence(await readMembership({
      purpose: READ_PURPOSE.LEARNER_ACTION, groupId: input.decodedIdentity.groupId,
      action: learnerActionOf(input)}), input);
    if (historical.outcome !== OUTCOME.RECORDED) return historical;
    // The same bound native owner supplies historical evidence and current
    // observation. Neither this read nor its recording is a live CREATE grant.
    const stamp = committedStampOfAnswer(await readMembership({purpose: READ_PURPOSE.BOOTSTRAP}));
    if (stamp === null) return {outcome: OUTCOME.UNAVAILABLE};
    return stampSupportsLearner(stamp, historical.origin, input.decodedIdentity) ?
      {outcome: OUTCOME.RECORDED,
        permit: committedLearnerPermit(input, historical.origin.index),
        stamp: JSON.stringify(stamp)} : {outcome: OUTCOME.CONFLICT};
  } catch {
    return {outcome: OUTCOME.UNAVAILABLE};
  }
}
''' + s[b:]
p.write_text(s)

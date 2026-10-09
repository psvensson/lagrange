from pathlib import Path
import sys


def replace_once(path, before, after):
    p = Path(path)
    text = p.read_text()
    assert text.count(before) == 1, (path, 'correction anchor drift')
    p.write_text(text.replace(before, after))


if sys.argv[1] == 'tests':
    replace_once('test/integration/message-group-learner-runtime-authorization.integration.test.js',
        'assert.equal(JSON.parse(f.row().message_group_membership_permit).leaderTerm, initial.leaderTerm);',
        'assert.equal(JSON.parse(f.row().message_group_membership_permit).leaderTerm,\n        initial.leaderTerm);')
elif sys.argv[1] == 'source':
    replace_once('src/rebalancer/replica-operation-message-group-membership-authorization.js',
        'const origin = decodeCommittedLearnerAdmission(encodeCommittedLearnerAdmission(observed.receipt));',
        'const encodedOrigin = encodeCommittedLearnerAdmission(observed.receipt);\n    const origin = decodeCommittedLearnerAdmission(encodedOrigin);')
else:
    raise ValueError('unknown correction phase')

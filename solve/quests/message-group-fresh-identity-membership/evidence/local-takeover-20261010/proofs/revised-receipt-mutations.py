#!/usr/bin/env python3
"""Exact-failure controls for the existing recipient/operation owners.

Run only in an isolated checkout. Process ownership and output retention reuse
an unchanged helper from the previous canonical evidence artifact. The old strict commit-time refusal gate is retained separately. These controls
measure the explicitly superseding safety-first receipt rule; no CREATE activation.
"""
import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEST = 'test/integration/message-group-learner-recipient.integration.test.js'

def helper_module():
    spec = importlib.util.spec_from_file_location('owned_process', HERE / 'owned-process.py')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

def events_checked(helper, row, stdout, path, expected, required=None):
    assert not row['timedOut'] and row['cleanupComplete'], row
    events = helper.parse_events(stdout)
    tests = [x for x in events if x['type'] in ('test:pass', 'test:fail')]
    assert len(tests) == 37, 'the complete recipient file must execute'
    assert all(Path(x['file']).resolve() == path for x in tests)
    identities = Counter((x['name'], x.get('nesting')) for x in tests)
    if expected is not None:
        assert identities == expected, 'test selection changed under mutation'
    totals = [x for x in events if x['type'] == 'test:summary' and x.get('file') is None]
    assert len(totals) == 1
    counts = totals[0]['counts']
    assert counts['tests'] == 37
    assert counts['cancelled'] == counts['skipped'] == counts['todo'] == 0
    assert not any(x.get('skip') or x.get('todo') for x in tests)
    failed = [x for x in tests if x['type'] == 'test:fail']
    assert len(failed) == counts['failed']
    if required is None:
        assert row['exit'] == 0 and totals[0]['success'] is True and not failed
    else:
        assert row['exit'] == 1 and totals[0]['success'] is False
        leaves = [x for x in failed if x.get('failureType') != 'subtestsFailed']
        assert leaves and all(x.get('failureType') == 'testCodeFailure' and
                              x.get('assertionCode') == 'ERR_ASSERTION' for x in leaves), leaves
        name, message = required
        matching = [x for x in leaves if x['name'] == name]
        assert len(matching) == 1 and message in matching[0].get('assertionMessage', ''), leaves
    return identities

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--loader', type=Path, help='explicitly diagnostic dependency adapter')
    args = parser.parse_args()
    root = args.root.resolve(); out = args.output.resolve()
    helper = helper_module()
    helper.refuse_under_probe(root)  # before mkdir or reading/mutating source
    out.mkdir(parents=True, exist_ok=False)
    command = ['node', '--no-warnings']
    if args.loader:
        command += ['--experimental-loader=' + str(args.loader.resolve())]
    command += ['--test', '--test-reporter=' + str(HERE / 'report-diagnostic.mjs'), TEST]
    cases = [('captured-callback',
      'src/node/message-group-membership-recipient.js',
      [('const router = invocation?.router;', 'const router = handler.messageRouter;'),
       ('const registration = invocation?.callback;', 'const registration = handler.registeredRouterHandler;')],
      'a callback captured before re-registration cannot borrow its successor identity',
      'a retired captured callback must not borrow its replacement registration'),
     ('exact-unregister',
      'src/node/message-group-service-handler.js',
      [('messageRouter.unregisterExact(handlerAddress, registration);',
        'messageRouter.unregister(handlerAddress);')],
      'retiring an old handler cannot unregister the current handler',
      'retirement must leave the exact successor callback registered'),
     ('configured-budget',
      'src/rebalancer/operation-workflow-message-group-native-read.js',
      [('timeoutMs: owner.replicaOperationDispatchTimeoutMs',
        'timeoutMs: OPERATION_WORKFLOW_OWNER_SHARED.REPLICA_OPERATION_DISPATCH_TIMEOUT_MS')],
      'recipient delivery uses the workflow owner configured timeout',
      'recipient delivery must use the owner configured timeout'),
     ('recording-invocation',
      'src/rebalancer/operation-workflow-message-group-native-read.js',
      [('return record((query) => readAtRecipient(owner, selected, query, isCurrent), isCurrent);',
        'return record((query) => readAtRecipient(owner, selected, query, isCurrent));')],
      'fence-turnover after native delivery prevents a new recording submission',
      'an invalidated driver invocation cannot start a recording write'),
     ('submitted-is-unknown',
      'src/rebalancer/replica-operation-message-group-membership-authorization.js',
      [('if (!isCurrent() || !await membershipBootIsCurrent(repository)) return result(OUTCOME.UNKNOWN);',
        'if (!isCurrent() || !await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE);')],
      'an already-submitted write stays UNKNOWN after invocation retirement',
      'retirement cannot turn a submitted write into definite noncommitment'),
     ('retained-owner-lane',
      'src/rebalancer/operation-workflow-message-group-native-read.js',
      [('return owner.runRetainedOperationOwnerAction(operationId, () => {',
        'return Promise.resolve().then(() => {')],
      'recording enters the existing retained operation lane before reading',
      'the existing operation lane must be entered'),
     ('queued-input-snapshot',
      'src/rebalancer/operation-workflow-message-group-native-read.js',
      [('owner.repository.recordMessageGroupLearnerOutcome(input, read, isCurrent));',
        'owner.repository.recordMessageGroupLearnerOutcome(request, read, isCurrent));')],
      'queued recording snapshots encoded request and recipient without invoking accessors',
      'the waiting command must retain its original immutable input'),
     ('per-attempt-boot',
      'src/rebalancer/replica-operation-message-group-membership-authorization.js',
      [('const beforeAttempt = async () => submissionIsCurrent() &&\n'
        '    await membershipBootIsCurrent(repository);',
        'const beforeAttempt = async () => submissionIsCurrent();')],
      'canonical-boot-revocation during retry backoff prevents a NEW receipt submission',
      'revoked claim or boot must prevent another submission after backoff'),
     ('per-attempt-lease',
      'src/rebalancer/replica-operation-message-group-membership-authorization.js',
      [('const submissionIsCurrent = () => isCurrent() &&\n'
        '    membershipClaimIsLocalAndLive(repository, input.claim, input.identity);',
        'const submissionIsCurrent = () => isCurrent();')],
      'lease-expiry during retry backoff prevents a NEW receipt submission',
      'revoked claim or boot must prevent another submission after backoff'),
     ('post-admission-lifetime',
      'src/rebalancer/replica-operation-repository-mutation-gateway-methods.js',
      [('if (options.submissionIsCurrent !== undefined &&',
        'if (false && options.submissionIsCurrent !== undefined &&')],
      'async admission must recheck local lifetime adjacent to actual submission',
      'turnover during async admission must prevent submission'),
     ('extra-receipt-effect',
      'src/rebalancer/replica-operation-message-group-membership-authorization.js',
      [('message_group_membership_permit = ?, message_group_learner_stamp = ?\n        WHERE ${basis.where}',
        'message_group_membership_permit = ?, message_group_learner_stamp = ?,\n'
        "        message_group_membership_obligation_state = 'intent_recorded'\n"
        '        WHERE ${basis.where}')],
      'lease-expiry after submission permits only the exact late receipt',
      'late recording must change only the three historical receipt columns'),
     ('committed-input-not-supported',
      'src/rebalancer/replica-operation-message-group-membership-authorization.js',
      [('if (!identity || identity.operationId !== operationId || !permit || !claim ||\n'
        '    !initialLearnerActionMatches(permit, identity)) return null;',
        'if (!identity || identity.operationId !== operationId || !permit || !claim ||\n'
        '    permit.permitState === STATE.COMMITTED ||\n'
        '    !initialLearnerActionMatches(permit, identity)) return null;')],
      'reconstruction after SQL-answer loss consumes the committed permit without reviving it',
      'reconstruction must accept the exact already-committed receipt without an original packet')]
    results = []
    anchor = root / cases[0][1]; original = anchor.read_bytes()
    try:
        row, stdout = helper.execute(root, out, 'positive', command, anchor, original, timeout=45)
        expected = events_checked(helper, row, stdout, root / TEST, None)
        row['accepted'] = True; results.append(row)
        for name, relative, edits, leaf, assertion in cases:
            source = root / relative; original = source.read_bytes(); changed = original.decode()
            for before, after in edits:
                assert changed.count(before) == 1, (name, 'source anchor drift', before)
                changed = changed.replace(before, after)
            row, stdout = helper.execute(root, out, name, command, source, original,
                                         changed.encode(), timeout=45)
            assert source.read_bytes() == original
            events_checked(helper, row, stdout, root / TEST, expected, (leaf, assertion))
            row.update(accepted=True, requiredTest=leaf, requiredAssertion=assertion)
            results.append(row)
            (out / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
        original = anchor.read_bytes()
        row, stdout = helper.execute(root, out, 'restored-positive', command, anchor, original, timeout=45)
        events_checked(helper, row, stdout, root / TEST, expected)
        row['accepted'] = True; results.append(row)
    finally:
        (out / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps({'positiveCases': 37, 'mutationsDetected': len(cases),
                      'restoredPositive': True, 'diagnosticLoader': str(args.loader) if args.loader else None,
                      'lateReceiptPolicy': '20261009 safety-first ruling; bounded only', 'driverActivation': False}, indent=2))

if __name__ == '__main__':
    main()

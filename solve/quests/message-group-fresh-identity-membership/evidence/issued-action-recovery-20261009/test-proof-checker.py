#!/usr/bin/env python3
"""Adversarial regression of the diagnostic checker, not production acceptance.

Uses real Node failure events for attribution/omission attacks. Synthetic event
edits below test only the parser. Never use this on a shared/dirty worktree.
"""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('diagnostic', HERE / 'run-diagnostic.py')
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)
ROOT = HERE.parents[4]
# parents: evidence, quest, quests, solve, repository.
OUTPUT = None


class ProofCheckerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = ROOT / diag.SOURCE
        cls.original = cls.source.read_bytes()
        cls.command = diag.test_command(ROOT)
        cls.positive, stdout = diag.execute(ROOT, OUTPUT, 'checker-positive', cls.command,
                                            cls.source, cls.original)
        cls.events = diag.parse_events(stdout)
        diag.accept_measurement(cls.positive, cls.events, ROOT / diag.TEST)

    def test_unrelated_failure_is_not_the_named_negative(self):
        old = '    const window = durableActionWindow(record);'
        self.assertEqual(self.original.decode().count(old), 1)
        changed = self.original.decode().replace(old,
            "    if (Number(record?.hardState?.term) > 1) throw new Error('unrelated term refusal');\n" + old)
        row, stdout = diag.execute(ROOT, OUTPUT, 'wrong-attribution', self.command,
                                   self.source, self.original, changed.encode())
        events = diag.parse_events(stdout)
        target = [e for e in events if e.get('name') == diag.EXPECTED_TESTS[4] and
                  e['type'] in ('test:pass', 'test:fail')]
        self.assertEqual(len(target), 1)
        self.assertEqual(target[0]['type'], 'test:pass')
        self.assertEqual(row['exit'], 1)
        self.assertEqual(sum(e['type'] == 'test:fail' for e in events), 2)
        self.assertEqual({e['name'] for e in events if e['type'] == 'test:fail'},
                         set(diag.EXPECTED_TESTS[1:3]))
        with self.assertRaisesRegex(AssertionError, 'required test did not fail'):
            diag.accept_measurement(row, events, ROOT / diag.TEST,
                (diag.EXPECTED_TESTS[4], 'malformed durable evidence must not yield a receipt'))
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_same_test_but_wrong_assertion_is_not_credit(self):
        events = copy.deepcopy(self.events)
        event = next(e for e in events if e.get('name') == diag.EXPECTED_TESTS[4]
                     and e['type'] == 'test:pass')
        event.update(type='test:fail', failureType='testCodeFailure',
                     assertionCode='ERR_ASSERTION', assertionMessage='unrelated assertion')
        final = next(e for e in events if e['type'] == 'test:summary' and e['file'] is None)
        final['success'] = False
        final['counts'].update(passed=7, failed=1)
        with self.assertRaisesRegex(AssertionError, 'wrong assertion'):
            diag.accept_measurement({**self.positive, 'exit': 1}, events, ROOT / diag.TEST,
                (diag.EXPECTED_TESTS[4], 'malformed durable evidence must not yield a receipt'))

    def test_cancellation_or_setup_error_is_not_negative_proof(self):
        events = copy.deepcopy(self.events)
        final = next(e for e in events if e['type'] == 'test:summary' and e['file'] is None)
        final['counts']['cancelled'] = 1
        with self.assertRaises(AssertionError):
            diag.accept_measurement(self.positive, events, ROOT / diag.TEST)
        events = copy.deepcopy(self.events)
        event = next(e for e in events if e.get('name') == diag.EXPECTED_TESTS[4]
                     and e['type'] == 'test:pass')
        event.update(type='test:fail', failureType='testCodeFailure',
                     assertionCode='ERR_MODULE_NOT_FOUND', assertionMessage='required marker')
        final = next(e for e in events if e['type'] == 'test:summary' and e['file'] is None)
        final['success'] = False
        final['counts'].update(passed=7, failed=1)
        with self.assertRaises(AssertionError):
            diag.accept_measurement({**self.positive, 'exit': 1}, events, ROOT / diag.TEST,
                                    (diag.EXPECTED_TESTS[4], 'required marker'))

    def test_reconstruction_omissions_fail_real_engagement_assertions(self):
        source = ROOT / diag.TEST
        original = source.read_bytes()
        for name, old, expected in [
            ('omit-close', '  for (const id of ids) c.crash(id);',
             'reconstruction must close the old database'),
            ('omit-reopen', '  for (const id of ids) c.restart(id);',
             'reconstruction must acquire a new connection')]:
            with self.subTest(name=name):
                self.assertEqual(original.decode().count(old), 1)
                changed = original.decode().replace(old, '').encode()
                row, stdout = diag.execute(ROOT, OUTPUT, name, self.command,
                                           source, original, changed)
                diag.accept_measurement(row, diag.parse_events(stdout), ROOT / diag.TEST,
                                        (diag.EXPECTED_TESTS[0], expected))
                self.assertEqual(source.read_bytes(), original)

    def test_missing_WAL_fails_actual_configuration_assertion(self):
        source = ROOT / diag.TEST
        original = source.read_bytes()
        old = "      db.pragma('journal_mode = WAL');"
        self.assertEqual(original.decode().count(old), 1)
        row, stdout = diag.execute(ROOT, OUTPUT, 'omit-wal', self.command, source, original,
                                   original.decode().replace(old, '').encode())
        diag.accept_measurement(row, diag.parse_events(stdout), ROOT / diag.TEST,
            (diag.EXPECTED_TESTS[0], 'every opened fixture connection must actually use WAL'))
        self.assertEqual(source.read_bytes(), original)

    def test_probe_refuses_before_output_creation_and_source_mutation(self):
        with tempfile.TemporaryDirectory(prefix='issued-probe-control-') as temp:
            destination = Path(temp) / 'must-not-exist'
            result = subprocess.run([sys.executable, str(HERE / 'run-diagnostic.py'),
                                     str(ROOT), str(destination)],
                                    env={**os.environ, 'LAGRANGE_PROBE': '1'},
                                    capture_output=True, text=True, timeout=5)
            (OUTPUT / 'probe-refusal.stdout.txt').write_text(result.stdout)
            (OUTPUT / 'probe-refusal.stderr.txt').write_text(result.stderr)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('refused under LAGRANGE_PROBE=1', result.stderr)
            self.assertFalse(destination.exists())
            self.assertEqual(self.source.read_bytes(), self.original)

    def test_timeout_retains_both_streams_and_restores_source(self):
        # This child is a harness-only apparatus, not a product test with a lowered budget.
        command = ['node', '-e',
                   "process.stdout.write('partial stdout\\n'); "
                   "process.stderr.write('partial stderr\\n'); setTimeout(() => {}, 10000);"]
        changed = b'// temporary timeout test marker\n' + self.original
        row, _ = diag.execute(ROOT, OUTPUT, 'controlled-timeout', command,
                              self.source, self.original, changed, timeout=0.5)
        self.assertTrue(row['timedOut'])
        self.assertIn('partial stdout', (OUTPUT / 'controlled-timeout.stdout.txt').read_text())
        self.assertIn('partial stderr', (OUTPUT / 'controlled-timeout.stderr.txt').read_text())
        with self.assertRaisesRegex(AssertionError, 'timeout is not negative proof'):
            diag.accept_measurement(row, [], ROOT / diag.TEST,
                                    (diag.EXPECTED_TESTS[0], 'any assertion'))
        self.assertEqual(self.source.read_bytes(), self.original)


if __name__ == '__main__':
    diag.refuse_under_probe(ROOT)
    if len(sys.argv) != 2:
        raise SystemExit('usage: python test-proof-checker.py /isolated/evidence/output')
    OUTPUT = Path(sys.argv[1]).resolve()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(ProofCheckerTests))
    (OUTPUT / 'checker-summary.json').write_text(json.dumps({
        'testsRun': result.testsRun, 'failures': len(result.failures),
        'errors': len(result.errors), 'skipped': len(result.skipped),
        'successful': result.wasSuccessful()}, indent=2) + '\n')
    raise SystemExit(0 if result.wasSuccessful() else 1)

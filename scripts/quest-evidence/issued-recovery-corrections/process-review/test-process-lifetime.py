#!/usr/bin/env python3
"""Linux diagnostic-worker lifetime proof, not a database or release test.

Only our recorded child PIDs are inspected during cleanup; neither a lab process
nor the invoking process group is ever targeted. Run in an isolated checkout.
"""
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('diagnostic', HERE / 'run-diagnostic.py')
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)
OUTPUT = None

WORKER = r"""
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const [root, role, mode] = process.argv.slice(2);
const parts = fs.readFileSync('/proc/self/stat', 'utf8').split(') ')[1].trim().split(/\s+/);
fs.writeFileSync(`${root}/${role}.json`, JSON.stringify({pid: process.pid,
  start: parts[19], group: parts[2], role}));
const watchdog = setTimeout(() => process.exit(4), 10000);
if (role === 'grandchild') {
  process.on('SIGTERM', () => {});
  setInterval(() => fs.appendFileSync(`${root}/heartbeat`, 'x'), 20);
} else {
  const next = role === 'parent' ? 'child' : 'grandchild';
  spawn(process.execPath, [__filename, root, next, mode], {stdio: 'ignore'}).unref();
  const wait = setInterval(() => {
    if (!fs.existsSync(`${root}/grandchild.json`)) return;
    clearInterval(wait);
    if (role !== 'parent') return;
    process.stdout.write('all descendants engaged\n');
    process.stderr.write('parent evidence stream\n');
    if (mode === 'leader-exits') { clearTimeout(watchdog); process.exit(0); }
  }, 5);
}
"""


def process_state(record):
    try:
        fields = Path('/proc', str(record['pid']), 'stat').read_text().split(') ', 1)[1].split()
        return fields[0] if fields[19] == record['start'] else None
    except FileNotFoundError:
        return None


def live(record):
    return process_state(record) not in (None, 'Z', 'X')


class ProcessLifetimeTests(unittest.TestCase):
    def exercise(self, mode, timed_out):
        # The short bound is only for this deliberate hang, not a product test.
        with tempfile.TemporaryDirectory(prefix='issued-worker-group-') as temp:
            root = Path(temp)
            worker = root / 'worker.cjs'
            worker.write_text(WORKER)
            source = root / 'owned-source.js'
            original = b'// immutable original\n'
            source.write_bytes(original)
            out = OUTPUT / mode
            out.mkdir(parents=True, exist_ok=True)
            records = []
            try:
                row, stdout = diag.execute(root, out, 'group',
                    ['node', str(worker), str(root), 'parent', mode],
                    source, original, b'// in-flight mutation\n', timeout=1.5)
                records = [json.loads((root / (role + '.json')).read_text())
                           for role in ('parent', 'child', 'grandchild')]
                (out / 'processes.json').write_text(json.dumps(records, indent=2) + '\n')
                self.assertIn('all descendants engaged', stdout)
                self.assertIn('parent evidence stream', (out / 'group.stderr.txt').read_text())
                states = {record['role']: process_state(record) for record in records}
                (out / 'post-return-states.json').write_text(json.dumps(states, indent=2) + '\n')
                self.assertFalse(any(live(record) for record in records),
                    'owned descendants remain runnable after source restoration: ' + str(states))
                self.assertEqual(row['timedOut'], timed_out)
                self.assertTrue(row['cleanupComplete'])
                self.assertEqual(source.read_bytes(), original)
                self.assertEqual({r['group'] for r in records}, {str(row['processGroupId'])})
                self.assertNotEqual(row['processGroupId'], os.getpgrp())
                if not timed_out:
                    self.assertEqual(row['exit'], 0)
            finally:
                # Also clean up the deliberately defective baseline. Match the
                # recorded process start so PID reuse cannot target another job.
                records = [json.loads(p.read_text()) for p in root.glob('*.json')]
                for record in reversed(records):
                    if live(record):
                        try:
                            os.kill(record['pid'], signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                deadline = time.monotonic() + 2
                while any(live(r) for r in records) and time.monotonic() < deadline:
                    time.sleep(0.01)
                if any(live(r) for r in records):
                    raise RuntimeError('test apparatus could not stop its own descendants')

    def test_timeout_terminates_child_and_grandchild_before_restoration(self):
        self.exercise('timeout', True)

    def test_exited_leader_does_not_abandon_its_live_descendants(self):
        self.exercise('leader-exits', False)


if __name__ == '__main__':
    if len(sys.argv) != 2 or not sys.platform.startswith('linux'):
        raise SystemExit('usage (Linux): python test-process-lifetime.py /evidence/output')
    repository = HERE.parents[4]
    diag.refuse_under_probe(repository)
    OUTPUT = Path(sys.argv[1]).resolve()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(ProcessLifetimeTests))
    (OUTPUT / 'summary.json').write_text(json.dumps({
        'testsRun': result.testsRun, 'failures': len(result.failures),
        'errors': len(result.errors), 'skipped': len(result.skipped),
        'successful': result.wasSuccessful()}, indent=2) + '\n')
    raise SystemExit(0 if result.wasSuccessful() else 1)

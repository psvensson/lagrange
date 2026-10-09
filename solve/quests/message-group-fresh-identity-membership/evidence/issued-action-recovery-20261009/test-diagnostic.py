#!/usr/bin/env python3
"""Adversarial tests of the proof checker itself; no fabricated success receipts."""
import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
sys.dont_write_bytecode = True

parser = argparse.ArgumentParser()
parser.add_argument('root', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--sqlite-driver', choices=['canonical', 'diagnostic'], default='canonical')
args = parser.parse_args()
root, output = args.root.resolve(), args.output.resolve()
spec = importlib.util.spec_from_file_location('diagnostic', Path(__file__).with_name('run-diagnostic.py'))
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
d.refuse_probe(root)
output.mkdir(parents=True, exist_ok=True)
source = root / d.SOURCE
original = source.read_bytes()
results = []


def rejected(work, expected):
    try:
        work()
    except AssertionError as error:
        assert expected in str(error), ('wrong rejection', str(error))
    else:
        raise AssertionError('checker falsely accepted the adversary')


# Repeat the precise old false-positive attack with actual native test outcomes.
# Term-2 refusals fail the history tests; the claimed malformed-record case PASSES.
rejected(lambda: d.measure(root, output, 'unrelated-failure', args.sqlite_driver,
    (d.SOURCE, "if (window === null || typeof decodeEntry !== 'function') {",
     "if (window === null || window.term === 2n || typeof decodeEntry !== 'function') {"),
    (d.MALFORMED, 'malformed durable evidence must be unavailable')),
    'designated test did not fail')
events = [json.loads(line) for line in (output / 'unrelated-failure.events.jsonl').read_text().splitlines()]
assert any(e.get('name') == d.MALFORMED and e['type'] == 'test:pass' for e in events)
assert source.read_bytes() == original
results.append('unrelated failing test rejected while designated test passed')

# A setup exception is not a failed assertion, even under the expected name.
setup = copy.deepcopy(events)
for e in setup:
    if e['type'] == 'test:fail':
        e['error'] = {'code': 'ERR_TEST_FAILURE', 'cause': {'code': 'E_SETUP', 'message': 'missing setup'}}
rejected(lambda: d.validate_result({'exit': 1}, setup, (d.HISTORICAL, 'Expected values')), 'E_SETUP')
results.append('setup failures rejected')

cancelled = copy.deepcopy(events)
for e in cancelled:
    if e['type'] == 'test:summary':
        e['counts']['cancelled'] = 1
rejected(lambda: d.validate_result({'exit': 1}, cancelled, (d.HISTORICAL, 'Expected values')), 'cancelled')
results.append('cancelled tests rejected')

# Check the real entrypoint: refusal must precede even creating its output path.
probe_output = output / 'forbidden-probe-output'
process = subprocess.run([sys.executable, str(Path(__file__).with_name('run-diagnostic.py')),
    str(root), str(probe_output)], cwd=root, env={**os.environ, 'LAGRANGE_PROBE': '1'},
    capture_output=True, text=True, timeout=10)
(output / 'probe.stdout.txt').write_text(process.stdout)
(output / 'probe.stderr.txt').write_text(process.stderr)
assert process.returncode != 0 and 'refused under LAGRANGE_PROBE=1' in process.stderr
assert not probe_output.exists() and source.read_bytes() == original
results.append('probe refused before output creation or mutation')

# Real killed child: output written before the timeout must survive.
row = d.execute(root, output, 'timeout-output', [sys.executable, '-S', '-c',
    'import sys,time; print("before-timeout",flush=True); print("timeout-stderr",file=sys.stderr,flush=True); time.sleep(10)'], timeout=0.3)
assert row['exit'] == 124 and row['timedOut']
assert 'before-timeout' in (output / 'timeout-output.stdout.txt').read_text()
assert 'timeout-stderr' in (output / 'timeout-output.stderr.txt').read_text()
results.append('timed-out child output and explicit failure retained')

rejected(lambda: d.measure(root, output, 'mutation-timeout', args.sqlite_driver,
    (d.SOURCE, '// A retained-log observation is positive evidence only.',
     '// Temporary mutation restoration control.'), timeout=0.00001), 'wrong test count')
assert source.read_bytes() == original
assert json.loads((output / 'mutation-timeout.result.json').read_text())['timedOut']
results.append('source restored after a timed-out mutated run')
(output / 'checker-results.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps({'checks': len(results), 'passed': results}, indent=2))

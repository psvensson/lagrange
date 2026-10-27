#!/usr/bin/env python3
"""Bounded profile of the unchanged restart witness; no source/test rewrite."""
from pathlib import Path
import collections
import hashlib
import json
import os
import subprocess
import sys
import time

root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
expected = sys.argv[3]
out.mkdir(parents=True, exist_ok=True)
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip() == expected
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=root).strip()
test = 'test/raft/raft-rs-backend/evidence-o1-restart-equivalence.test.js'
paths = [test, 'test/raft/raft-rs-backend/evidence-o1-model.js',
         'test/raft/raft-rs-backend/partition-node-cluster.js',
         'test/raft/raft-rs-backend/committed-membership-oracles.js']
original = {name: (root / name).read_bytes() for name in paths}


def run(name, command):
    (out / (name + '.command.json')).write_text(json.dumps(command) + '\n')
    started = time.monotonic()
    with (out / (name + '.stdout.txt')).open('wb') as stdout, (out / (name + '.stderr.txt')).open('wb') as stderr:
        result = subprocess.run(command, cwd=root, stdout=stdout, stderr=stderr,
                                check=False, timeout=180)
    record = {'exit': result.returncode, 'wallSeconds': time.monotonic() - started}
    (out / (name + '.result.json')).write_text(json.dumps(record, indent=2) + '\n')
    return record

normal = run('unchanged', ['npm', 'run', 'test:file', '--', test])
profile = run('cpu', ['/usr/bin/time', '-v', 'node', '--cpu-prof',
                     '--cpu-prof-interval=1000', '--cpu-prof-dir=' + str(out),
                     '--cpu-prof-name=restart.cpuprofile', test])
assert profile['exit'] == 0, 'profiled witness must engage and pass its functional assertions'
data = json.loads((out / 'restart.cpuprofile').read_text())
nodes = {node['id']: node for node in data['nodes']}
parents = {child: node['id'] for node in data['nodes'] for child in node.get('children', [])}
self_cost = collections.Counter()
inclusive = collections.Counter()
for ident, delta in zip(data['samples'], data['timeDeltas']):
    self_cost[ident] += delta
    current = ident
    while current in nodes:
        inclusive[current] += delta
        if current not in parents:
            break
        current = parents[current]


def describe(costs):
    rows = []
    for ident, micros in costs.most_common(60):
        frame = nodes[ident]['callFrame']
        url = frame.get('url', '')
        rows.append({'function': frame['functionName'], 'url': url.replace(str(root), '$ROOT'),
                     'line': frame.get('lineNumber', -1) + 1, 'sampledMs': micros / 1000})
    return rows

summary = {'schema': 'restart-cost-profile/1', 'sourceSha': expected,
           'normal': normal, 'profiled': profile,
           'sourceSha256': {name: hashlib.sha256(content).hexdigest() for name, content in original.items()},
           'selfSamples': describe(self_cost), 'inclusiveSamples': describe(inclusive),
           'limits': 'Sampling profile of one unchanged file; inclusive times overlap. Native/IO stacks and startup are included. Not power-loss, speedup, statistical or distributed proof.',
           'runtimeChanged': False, 'assertionsChanged': False, 'independentApproval': False}
(out / 'cost-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
# Retain current owner/test sources for exact local inspection, never dependencies or databases.
with __import__('tarfile').open(out / 'owner-sources.tar.gz', 'w:gz') as tar:
    more = ['src/raft', 'src/rebalancer/replica-operation-message-group-learner-observation.js',
            'src/rebalancer/replica-operation-message-group-membership-owner-claim.js',
            'test/integration/message-group-learner-runtime-authorization.integration.test.js',
            'test/guidelines/harness.md', 'test/guidelines/proof-ladders.md',
            'docs/development/cloud-github-publication.md']
    for name in paths + more:
        tar.add(root / name, arcname=name)
for name, content in original.items():
    assert (root / name).read_bytes() == content, name
subprocess.run(['git', 'diff', '--exit-code', '--', 'src', 'test'], cwd=root, check=True)
print(json.dumps(summary, indent=2))

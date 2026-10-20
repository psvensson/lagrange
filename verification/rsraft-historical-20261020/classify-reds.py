#!/usr/bin/env python3
"""Classify immutable rs-raft U1 red-file observations, without claiming equal root cause."""
import collections
import json
import pathlib
import re
import sys

base = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

def rows(label):
    match = list((base / label).rglob('test-results.ndjson'))
    if len(match) != 1:
        raise SystemExit(f'{label} expected one named NDJSON, saw {match}')
    records = []
    for line in match[0].read_text().splitlines():
        if line.strip():
            records.append(json.loads(line))
    return records

candidate_rows = rows('candidate')
before_rows = rows('predecessor')
candidate = {row['file']: row for row in candidate_rows}
before = {row['file']: row for row in before_rows}
reds = sorted(p for p, row in candidate.items() if not row['ok'])
missing = sorted(set(reds) - set(before))
assert len(reds) == 119, ('candidate red count drift', len(reds))
assert not missing, ('unmeasured predecessor rows', missing)
assert all(isinstance(candidate[p].get('firstFailureLine'), str) for p in reds)
shared = [p for p in reds if not before[p]['ok']]
new = [p for p in reds if before[p]['ok']]

# Observational failure classes only. These are not assertions of equal root cause.
RULES = [
 ('source-conformance', r'No files should have core feature flags|lint|eslint|guideline|closed.quest|taxonomy|proof.cone|shard'),
 ('transport-handler', r'Replica transport handler left registered|transport.*(identity|admission)|handler.*registered'),
 ('control-wakeup', r'ready.node.retry|remote.owner|dispatch.*retry|control.*ready'),
 ('bootstrap-release', r'seed bootstrap|participant.release|bootstrap.*(fail|ready|timeout)|formation|seed.*(fail|ready)'),
 ('raft-election', r'leader.election|leader.*(timeout|unavailable|not available)|no.available.leader'),
 ('cdc-observation', r'CDC|cache.*(miss|row|update)|subscriber|publish|publication'),
 ('membership-placement', r'REMOVE_PEER|membership|REPLACE|placement|rebalance|quorum|voter'),
 ('transaction-query', r'transaction|commit|write|prepared|partition.*(cutover|split)'),
 ('time-environment', r'timed out|timeout|cancelled|async.*unresolved'),
]
def primary(text):
    for label, pattern in RULES:
        if re.search(pattern, text, re.I):
            return label
    return 'unclassified'

classed = collections.defaultdict(list)
data=[]
for p in reds:
    a=candidate[p]; b=before[p]
    first=a.get('firstFailureLine','')
    earlier=b.get('firstFailureLine','')
    eq=(first == earlier)
    group=primary(first)
    if group == 'unclassified': group=primary(earlier)
    record = {
      'file':p, 'ownerPath':p.split('/')[1] if '/' in p else 'root',
      'candidateOk':False, 'predecessorOk':bool(b['ok']),
      'candidateFirstFailure':first, 'predecessorFirstFailure':earlier,
      'firstLineEqual':eq, 'candidateAssertions':a.get('assertions'),
      'predecessorAssertions':b.get('assertions'),
      'candidateMs':a.get('durationMs'),'predecessorMs':b.get('durationMs'),
      'observationalClass':group,
      'causalClassification':'UNDETERMINED',
      'localityVerdict':'UNPROVEN'
    }
    data.append(record);classed[group].append(record)

(out/'119-observations.json').write_text(json.dumps(data,indent=2)+'\n')
print('COUNTS candidate_records',len(candidate_rows),'candidate_red',len(reds),
      'predecessor_records',len(before_rows),'shared_red',len(shared),'old_green_new_red',len(new))
print('UNIQUE_TOP_LEVEL_FAILURES candidate',len(set(d['candidateFirstFailure'] for d in data)),
      'predecessor',len(set(d['predecessorFirstFailure'] for d in data)))
print('EXACT_FIRST_FAILURE_MATCHES',sum(x['firstLineEqual'] for x in data),
      'DIFFERENT',sum(not x['firstLineEqual'] for x in data))
for category,items in sorted(classed.items(), key=lambda pair:-len(pair[1])):
    print('FAMILY',category,'count',len(items),'unchanged-first-line',sum(x['firstLineEqual'] for x in items))
    for x in items[:12]:
        print('   ',x['file'].replace('test/',''),repr(x['candidateFirstFailure'][:205]))
print('POTENTIAL_NEW',len(new))
for p in new:print('  ',p,'|',repr(candidate[p].get('firstFailureLine','')[:250]))
diff=[x for x in data if not x['firstLineEqual']]
print('CHANGED_FIRST_LINES',len(diff))
for x in diff:print('CHANGED',x['file'],'OLD',repr(x['predecessorFirstFailure'][:170]),'NEW',repr(x['candidateFirstFailure'][:170]))
print('UNCLASSIFIED_PATHS')
for x in classed['unclassified']:print('  ',x['file'],'|',repr(x['candidateFirstFailure'][:230]))

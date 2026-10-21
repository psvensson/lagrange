"""Source-bound result indexing; no test or remote execution. Run once after all jobs settle."""
import collections
import hashlib
import json
import pathlib
import re

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parents[2]
CANDIDATE = ROOT / 'solve/quests/seed-release-failure-custody/evidence/changed-candidate-393f411ca'
SUPPLEMENT = ROOT / 'solve/quests/seed-release-failure-custody/evidence/unreported-candidate-393f411ca'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def index_log(path, host):
    original = path.read_text().splitlines()
    prefix = '[' + host + '] '
    lines = [(i + 1, line[len(prefix):]) for i, line in enumerate(original) if line.startswith(prefix)]
    starts = []
    for i, (number, line) in enumerate(lines):
        match = re.match(r'^(ok|not ok) (test/\S+) \((\d+) assertions, (\d+)ms\)$', line)
        if match:
            starts.append((i, number, match))
    records = {}
    for ordinal, (start, line_number, match) in enumerate(starts):
        end = starts[ordinal + 1][0] if ordinal + 1 < len(starts) else len(lines)
        block = lines[start + 1:end]
        first = next(((n, s.strip()) for n, s in block if re.match(r'^\s*not ok \d+ -', s)), None)
        snippets = [(n, s.strip()[:1000]) for n, s in block if re.match(r'^\s*(failureType:|error:|message:|expected:|actual:|lineNumber:)', s)][:15]
        file = match.group(2)
        if file in records:
            raise ValueError('Duplicate file verdict: ' + file)
        records[file] = {'ok': match.group(1) == 'ok', 'assertions': int(match.group(3)),
                         'durationMs': int(match.group(4)), 'log': str(path.relative_to(ROOT)),
                         'preservedLog': 'solve/quests/seed-release-failure-custody/evidence/predecessor-847c36a31/' + str(path.relative_to(OUT))
                             if path.is_relative_to(OUT) else str(path.relative_to(ROOT)),
                         'verdictLine': line_number, 'firstReportedNotOk': first,
                         'diagnosticFieldExcerpts': snippets}
    env = [line for line in original if 'placement-env=' in line]
    return records, env


selection = json.loads((OUT / 'selection.json').read_text())
supplemental = json.loads((OUT / 'supplemental-selection.json').read_text())
targets = selection['failures'] + supplemental['additions']
hosts = sorted({row['host'] for row in targets})
host_summary = []
comparisons = []
for host in hosts:
    folder = OUT / host
    terminal = folder / 'execution-end.json'
    if not terminal.exists():
        raise ValueError('Host has not settled: ' + host)
    baseline, env = index_log(folder / 'controller.log', host)
    candidate, candidate_env = index_log(CANDIDATE / 'controller.log', host)
    extra, extra_env = index_log(SUPPLEMENT / 'controller.log', host)
    planned = [row for row in targets if row['host'] == host]
    expected = {row['file'] for row in planned}
    if not set(baseline).issubset(expected):
        raise ValueError('Unexpected predecessor stdout verdict on ' + host)
    if 'placement-head=' + selection['predecessor'] not in (folder / 'controller.log').read_text():
        raise ValueError('Missing exact predecessor engagement on ' + host)
    ledger_path = folder / 'test-output/reports' / ('test-results-' + host + '.ndjson')
    ledger = [json.loads(line) for line in ledger_path.read_text().splitlines()] if ledger_path.exists() else None
    ledger_counts = collections.Counter(row['file'] for row in ledger) if ledger is not None else None
    ledger_census = None if ledger is None else {
        'rows': len(ledger), 'sha256': digest(ledger_path),
        'extraFiles': sorted(set(ledger_counts) - expected),
        'duplicateFiles': {file: count for file, count in ledger_counts.items() if count > 1},
        'attemptValues': sorted({row.get('attempt', 0) for row in ledger}),
        'retriedRows': sum(row.get('retriedOnce') is True for row in ledger)}
    host_summary.append({'host': host, 'planned': len(planned), 'reported': len(baseline),
                         'passed': sum(row['ok'] for row in baseline.values()),
                         'failed': sum(not row['ok'] for row in baseline.values()),
                         'unreported': sorted(expected - set(baseline)),
                         'predecessorEnvironment': env, 'candidateEnvironment': candidate_env,
                         'candidateSupplementEnvironment': extra_env,
                         'exit': json.loads(terminal.read_text()),
                         'ledgerCensus': ledger_census,
                         'controllerSha256': digest(folder / 'controller.log')})
    for row in planned:
        file = row['file']
        original = candidate.get(file) or extra.get(file)
        if original is None or original['ok']:
            raise ValueError('Missing candidate red: ' + file)
        prior = baseline.get(file)
        def assertion(record):
            first = record['firstReportedNotOk'] if record else None
            return re.sub(r' # time=.*$', '', first[1]) if first else None
        comparisons.append({'host': host, 'file': file, 'testBlob': row['candidateBlob'],
                            'testBytesEqual': row['candidateBlob'] == row['predecessorBlob'],
                            'candidate': original, 'predecessor': prior,
                            'observation': 'predecessor-unreported' if prior is None else
                                'red-candidate-green-predecessor' if prior['ok'] else 'red-both',
                            'sameFirstReportedNotOkText': assertion(original) == assertion(prior)
                                if prior and not prior['ok'] else None})
result = {'candidate': selection['candidate'], 'predecessor': selection['predecessor'],
          'originalCandidateRun': {'reportedRed': 99, 'unreported': 3},
          'supplementCandidateRun': {'reportedRed': 3},
          'hosts': host_summary, 'counts': dict(collections.Counter(row['observation'] for row in comparisons)),
          'comparisons': comparisons,
          'limits': ['Matching file verdict or first assertion text is not independently proven identical root cause.',
                     'Canonical discovered timing factors differ on some pairs; inspect recorded environments.',
                     'Every failure remains an obligation. No production repair, acceptance or waiver is implied.']}
with (OUT / 'comparison.json').open('x') as handle:
    json.dump(result, handle, indent=2)
    handle.write('\n')
print(json.dumps({'counts': result['counts'], 'hosts': host_summary,
                  'firstAssertionDiffers': [row['file'] for row in comparisons
                      if row['sameFirstReportedNotOkText'] is False]}, indent=2))

#!/usr/bin/env python3
# Compare per-file results of lab runs: ok/fail, assertion counts and the set
# of failing TAP lines (nested "not ok" names) parsed from the run's .log.
import json, re, sys, glob, os

LAB = '/mnt/data/peter/projects/lagrange-takeover-20261121/lab'


def load(run):
    d = os.path.join(LAB, run)
    results = {}
    for line in open(os.path.join(d, 'test-results.ndjson')):
        o = json.loads(line)
        results[o['file']] = o
    logs = [p for p in glob.glob(os.path.join(d, '*.log'))]
    fails = {}
    if logs:
        text = open(logs[0], errors='replace').read().split('\n')
        current = None
        for line in text:
            m = re.match(r'^(not ok|ok) (test/\S+\.test\.js) \(', line)
            if m:
                current = m.group(2)
                fails.setdefault(current, [])
                continue
            if current is None:
                continue
            m = re.match(r'^(\s*)not ok \d+ - (.*?)(\s+#\s+time=.*)?$', line)
            if m:
                fails[current].append((len(m.group(1)), m.group(2).strip()))
    return results, fails


def main():
    base_run, mid_run, new_run = sys.argv[1:4]
    base, base_f = load(base_run)
    mid, mid_f = load(mid_run)
    new, new_f = load(new_run)
    sel = json.load(open(os.path.join(LAB, new_run, 'selection.json')))['files']
    print(f'selected {len(sel)} results {len(new)}')
    for f in sel:
        b, m, n = base.get(f), mid.get(f), new.get(f)
        st = lambda r: 'NA' if r is None else ('ok' if r['ok'] else 'FAIL')
        if st(n) == 'ok' and st(b) in ('ok', 'NA') and st(m) in ('ok', 'NA'):
            continue
        print(f"{st(b):4} {st(m):4} {st(n):4} {f} | a={b and b['assertions']}/"
              f"{m and m['assertions']}/{n and n['assertions']}")
        if n and not n['ok']:
            nb = set(x[1] for x in base_f.get(f, []))
            nn = [x for x in new_f.get(f, [])]
            for depth, name in nn:
                tag = 'same' if name in nb else 'NEW '
                print(f'      {tag} {"  " * (depth // 4)}{name[:140]}')
            gone = [x[1] for x in base_f.get(f, []) if x[1] not in set(y[1] for y in nn)]
            for name in gone:
                print(f'      gone {name[:140]}')


main()

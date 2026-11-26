"""Compare the two physical smoke receipts. One input prints a historical arm."""
import argparse
import hashlib
import json
from pathlib import Path

HARNESS_SHA = '041f00ca2ab4bdbb658d051ce5c49692999a2284'
PRODUCT_SHA = '0da07b1da92744096da419635b5184465781488d'
IMAGE = 'sha256:9fb196ec087cab3919091f3ceda628f3f68709b223f16a964dfaff92c99ad787'
IPS = ['192.168.86.34', '192.168.86.41', '192.168.86.32', '192.168.86.210']


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def read_arm(path):
    records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    require([r['recordType'] for r in records] == ['campaign-header', 'run'],
            f'{path}: expected one complete single-run receipt')
    header, run = records
    require(header['campaignId'] == run['campaignId'] and run['executionTarget'] == 'lab'
            and run['targetId'] == 'lagrange', 'wrong campaign or target')
    hosts = header['physicalHosts']
    require([h['ip'] for h in hosts] == IPS, 'host/seed order differs')
    require(header['harness']['gitCommit'] == HARNESS_SHA, 'wrong harness snapshot')
    products = [p for p in run['identity']['products'] if p['role'] == 'lagrange-node']
    require(sorted(p['host'] for p in products) == sorted(IPS[:3]) and all(
        p['imageId'] == IMAGE and p['imageRef'] == 'lagrange@' + IMAGE
        and p['imageLabels']['org.opencontainers.image.revision'] == PRODUCT_SHA
        and p['bootProvenance']['bootedSrcFingerprint'] == 'c722e613419d95e7' for p in products),
        'incomplete final-image proof')
    readiness = run['deployment']['readiness']
    evidence = readiness.get('evidence') or {}
    diag = evidence.get('diagnostic') or {}
    membership = evidence.get('membership') or (diag.get('completedStages') or {}).get('membership')
    facts = (membership or {}).get('evidence', {}).get('json', {}).get('facts', {})
    formation = facts.get('cluster', {}).get('formation', {})
    require(formation.get('state') == 'FORMED' and formation.get('declaredHostCount') == 3
            and facts.get('topology', {}).get('readyNodeCount') == 3,
            'missing completed three-host membership evidence; cadence comparison unavailable')
    cluster = evidence.get('cluster') or (diag.get('completedStages') or {}).get('systemTables')
    if cluster:
        sample = cluster['evidence']['sampling']
        elapsed = cluster['timeToReadyMs']
        attempts = cluster['attempts']
    else:
        require(diag.get('component') == 'lagrange-system-tables',
                'system-table stage unmeasured; inspect refusal')
        require(diag['deadlineMs'] == 240000, 'formation budget mismatch')
        sample = diag.get('sampling') or diag['last']['sampling']
        elapsed, attempts = diag['elapsedMs'], diag['attempts']
    metrics = dict(stageMs=elapsed, attempts=attempts, factsChecks=sample['factsChecks'],
                   factsPerMinute=60000 * sample['factsChecks'] / elapsed,
                   factsMs=sample['factsElapsedMs'],
                   factsTimePercent=100 * sample['factsElapsedMs'] / elapsed,
                   sqlBatches=sample['sqlBatches'], sqlMs=sample['sqlElapsedMs'],
                   factsDeferred=sample.get('factsDeferred', 0))
    patch = path.with_name('controller.patch')
    expected_patch = Path(__file__).with_name('controller-patch.sha256').read_text().strip()
    require(patch.is_file() and hashlib.sha256(patch.read_bytes()).hexdigest() == expected_patch,
            'missing or different sealed cadence patch')
    identity = dict(hosts=[(h['ip'], h['bootId'], h['cpus'], h['role']) for h in hosts],
                    harness=header['harness'], products=sorted((p['host'], p['imageId'],
                    p['contentIdentity'], p['bootProvenance']['bootedSrcFingerprint']) for p in products),
                    plan={k: v for k, v in run['plan'].items() if k != 'manifestDigest'},
                    patch=hashlib.sha256(patch.read_bytes()).hexdigest() if patch.exists() else None)
    return dict(campaign=run['campaignId'], formation=readiness['state'], systemTablesReady=bool(cluster),
                lastUnderReplicated=(diag.get('lastDeniedObservation') or {}).get('underReplicatedPartitionCount'),
                cleanup=run['cleanup']['status'], stride=sample.get('factsStride'), metrics=metrics), identity


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('control', type=Path)
parser.add_argument('treatment', type=Path, nargs='?')
args = parser.parse_args()
control, first = read_arm(args.control)
print(json.dumps(control, indent=2))
if args.treatment:
    treatment, second = read_arm(args.treatment)
    print(json.dumps(treatment, indent=2))
    require(first['patch'] and first == second, 'unmatched image, host, source overlay or workload')
    require((control['stride'], treatment['stride']) == (1, 4), 'missing or reversed cadence evidence')
    require(control['campaign'] != treatment['campaign'], 'same campaign')
    print(json.dumps({'treatmentMinusControl': {
        key: round(value - control['metrics'][key], 3)
        for key, value in treatment['metrics'].items()}}, indent=2))

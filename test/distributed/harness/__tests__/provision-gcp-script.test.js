// docs/benchmarks/cloud/provision-gcp.sh, EXECUTED by bash. Only `gcloud` (a
// stand-in keeping instances and firewall rules as files, recording each
// call and the startup script) and, for --place, `node` (recording its
// arguments) are replaced. Every value is named or a printed documented
// default; no probe adapts the script; no failed step is tolerated (census in
// the quest log, class repair CP-1..CP-6). Evidence ceiling: no real gcloud.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  arrayFilter,
  arrayFindIndex,
  arrayJoin,
  arrayMap,
  arraySome,
  stringIncludes,
  stringSplit,
  stringTrim,
} from '../real-product-captured-intrinsics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCRIPT = path.join(ROOT, 'docs/benchmarks/cloud/provision-gcp.sh');
const BASH = stringTrim(spawnSync('sh', ['-c', 'command -v bash'], {encoding: 'utf8'}).stdout);
const NODES = arrayMap([1, 2, 3, 4, 5, 6], (n) => `lagrange-bench-${n}`);
const WANTED_RULE = 'default;lagrange-bench-node;lagrange-bench-node;tcp:1-65535,udp:1-65535,icmp';

const GCLOUD = `#!/bin/sh
S="$GCLOUD_STATE"
echo "gcloud $*" >> "$S/log"
case "$1 $2 $3" in
  "compute instances create")
    shift 3
    for a in "$@"; do
      case "$a" in
        --metadata-from-file=startup-script=*) cp "\${a#--metadata-from-file=startup-script=}" "$S/startup-script" ;;
        --*) ;;
        *) touch "$S/instances/$a" ;;
      esac
    done
    exit 0 ;;
  "compute instances list")
    [ -e "$S/fail-list" ] && { echo "ERROR: (gcloud.compute.instances.list) unavailable" >&2; exit 1; }
    ls "$S/instances"; exit 0 ;;
  "compute instances delete")
    [ -e "$S/fail-delete-$4" ] && { echo "ERROR: could not delete $4" >&2; exit 1; }
    [ -e "$S/sticky-$4" ] || rm -f "$S/instances/$4"
    exit 0 ;;
  "compute instances describe")
    case "$*" in
      *natIP*) [ -e "$S/no-external-$4" ] || echo "34.0.0.\${4##*-}" ;;
      *) echo "10.128.0.\${4##*-}" ;;
    esac
    exit 0 ;;
  "compute firewall-rules list")
    [ -e "$S/fail-firewall-list" ] && { echo "ERROR: firewall list unavailable" >&2; exit 1; }
    ls "$S/firewall"; exit 0 ;;
  "compute firewall-rules describe")
    cat "$S/firewall/$4"; exit 0 ;;
  "compute firewall-rules create")
    name="$4"; shift 4; net=""; src=""; dst=""; allow=""
    for a in "$@"; do
      case "$a" in
        --network=*) net="\${a#--network=}" ;;
        --source-tags=*) src="\${a#--source-tags=}" ;;
        --target-tags=*) dst="\${a#--target-tags=}" ;;
        --allow=*) allow="\${a#--allow=}" ;;
      esac
    done
    printf '%s;%s;%s;%s' "$net" "$src" "$dst" "$allow" > "$S/firewall/$name"; exit 0 ;;
  "compute firewall-rules delete")
    [ -e "$S/fail-firewall-delete" ] && { echo "ERROR: could not delete firewall rule" >&2; exit 1; }
    rm -f "$S/firewall/$4"; exit 0 ;;
esac
echo "gcloud stand-in: unscripted: $*" >&2
exit 3
`;

/**
 * Run the script once. `state` sets up the stand-in's cloud before the run:
 * instances present, firewall rules (name -> rule text) and flag files.
 */
function runScript({args = [], env = {}, instances = [], firewall = {}, flags = []} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provision-gcp-'));
  const bin = path.join(dir, 'bin');
  const state = path.join(dir, 'state');
  for (const sub of [bin, state, path.join(state, 'instances'), path.join(state, 'firewall')]) {
    fs.mkdirSync(sub, {recursive: true});
  }
  fs.writeFileSync(path.join(bin, 'gcloud'), GCLOUD, {mode: 0o755});
  const nodeArgv = path.join(dir, 'node-argv.json');
  fs.writeFileSync(path.join(bin, 'node'), `#!${process.execPath}\n` +
    `require('fs').writeFileSync(${JSON.stringify(nodeArgv)}, ` +
    'JSON.stringify(process.argv.slice(2)));\n', {mode: 0o755});
  for (const name of instances) fs.writeFileSync(path.join(state, 'instances', name), '');
  for (const [name, rule] of Object.entries(firewall)) {
    fs.writeFileSync(path.join(state, 'firewall', name), rule);
  }
  for (const flag of flags) fs.writeFileSync(path.join(state, flag), '');
  const key = path.join(dir, 'bench.pub');
  fs.writeFileSync(key, 'ssh-ed25519 AAAAC3Nza bench@controller\n');
  const out = path.join(dir, 'out');
  const result = spawnSync(BASH, ['-c', `"$0" "$@" >> ${JSON.stringify(path.join(state, 'log'))} ` +
    `2>> ${JSON.stringify(out)}`, SCRIPT, ...args], {encoding: 'utf8',
    env: {PATH: `${bin}:${process.env.PATH}`, HOME: dir, GCLOUD_STATE: state,
      PROJECT_ID: 'bench-project', SSH_USER: 'bench', SSH_PUBLIC_KEY_FILE: key, ...env}});
  const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  const lines = arrayFilter(stringSplit(read(path.join(state, 'log')), '\n'), Boolean);
  return {status: result.status, lines, stderr: read(out),
    calls: arrayFilter(lines, (line) => /^gcloud /u.test(line)),
    instances: fs.readdirSync(path.join(state, 'instances')).sort(),
    firewall: fs.readdirSync(path.join(state, 'firewall')),
    startup: read(path.join(state, 'startup-script')),
    nodeArgv: fs.existsSync(nodeArgv) ? JSON.parse(read(nodeArgv)) : null, key};
}

function called(run, pattern) {
  return arrayFilter(run.calls, (line) => pattern.test(line));
}

function refusedBeforeGcloud(run, message) {
  assert.equal(run.status, 2, run.stderr);
  assert.ok(stringIncludes(run.stderr, message), run.stderr);
  assert.deepEqual(run.calls, [], 'refused before any gcloud call');
  assert.deepEqual(run.instances, []);
}

function created(run) {
  const lines = called(run, /^gcloud compute instances create /u);
  assert.equal(lines.length, 1, arrayJoin(run.lines, '\n'));
  return lines[0];
}

test('create: the documented defaults are printed before anything is created and used', () => {
  const run = runScript();
  assert.equal(run.status, 0, run.stderr);
  const printed = arrayFindIndex(run.lines, (line) => line === '[gcp] project bench-project, ' +
    'zone us-central1-a, machine type e2-standard-4, prefix lagrange-bench, network default');
  const image = arrayFindIndex(run.lines, (line) =>
    line === '[gcp] VM image: family ubuntu-2404-lts-amd64 in project ubuntu-os-cloud');
  const firstCreate = arrayFindIndex(run.lines, (line) => / create /u.test(line));
  assert.ok(printed >= 0 && image >= 0 && printed < firstCreate && image < firstCreate,
    arrayJoin(run.lines, '\n'));
  const create = created(run);
  for (const part of ['--zone=us-central1-a', '--machine-type=e2-standard-4', '--network=default',
    '--image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud', ...NODES]) {
    assert.ok(stringIncludes(create, part), part);
  }
  assert.deepEqual(run.instances, NODES);
  assert.ok(arraySome(run.lines, (line) => line === 'export IMAGE_FAMILY="ubuntu-2404-lts-amd64"'));
  assert.ok(arraySome(run.lines, (line) => line === 'export IMAGE_PROJECT="ubuntu-os-cloud"'));
});

test('create: exactly the named image; never a probed family; half a name refused', () => {
  const named = runScript({env: {IMAGE_FAMILY: 'lagrange-distributed-harness',
    IMAGE_PROJECT: 'bench-project'}});
  assert.equal(named.status, 0, named.stderr);
  assert.ok(stringIncludes(created(named),
    '--image-family=lagrange-distributed-harness --image-project=bench-project'));
  assert.deepEqual(called(named, /describe-from-family/u), []);
  for (const half of [{IMAGE_FAMILY: 'lagrange-distributed-harness'},
    {IMAGE_PROJECT: 'bench-project'}]) {
    refusedBeforeGcloud(runScript({env: half}),
      'IMAGE_FAMILY and IMAGE_PROJECT name one image together; set both or neither.');
  }
});

test('create: PROJECT_ID, SSH_USER and the SSH public key file are named; none is looked up; ' +
  'VMs are never created without the key', () => {
  refusedBeforeGcloud(runScript({env: {PROJECT_ID: ''}}), 'PROJECT_ID is not set');
  refusedBeforeGcloud(runScript({env: {SSH_USER: ''}}), 'SSH_USER is not set');
  refusedBeforeGcloud(runScript({env: {SSH_PUBLIC_KEY_FILE: ''}}),
    'SSH_PUBLIC_KEY_FILE is not set');
  refusedBeforeGcloud(runScript({env: {SSH_PUBLIC_KEY_FILE: '/nonexistent/key.pub'}}),
    'SSH_PUBLIC_KEY_FILE /nonexistent/key.pub does not exist, is not readable or is empty');
  const run = runScript();
  assert.ok(stringIncludes(created(run),
    '--metadata=ssh-keys=bench:ssh-ed25519 AAAAC3Nza bench@controller'));
  assert.ok(arraySome(run.lines, (line) => line === `[gcp] ssh user bench, key ${run.key}`));
});

test('create: an existing firewall rule is used only when its rules match; otherwise refused ' +
  'saying what differs; an unanswerable question is a failure', () => {
  const fresh = runScript();
  assert.equal(called(fresh, /^gcloud compute firewall-rules create lagrange-bench-internal /u)
    .length, 1);
  assert.ok(stringIncludes(called(fresh, /firewall-rules create/u)[0], '--network=default'));
  const same = runScript({firewall: {'lagrange-bench-internal': WANTED_RULE}});
  assert.equal(same.status, 0, same.stderr);
  assert.deepEqual(called(same, /firewall-rules create/u), []);
  assert.equal(created(same).length > 0, true);
  const other = 'default;lagrange-bench-node;lagrange-bench-node;tcp:22';
  const differs = runScript({firewall: {'lagrange-bench-internal': other}});
  assert.equal(differs.status, 1);
  assert.ok(stringIncludes(differs.stderr, 'firewall rule lagrange-bench-internal exists with ' +
    `network;source tags;target tags;allowed = '${other}', not '${WANTED_RULE}'`), differs.stderr);
  assert.deepEqual(called(differs, /instances create/u), []);
  const unknown = runScript({flags: ['fail-firewall-list']});
  assert.equal(unknown.status, 1);
  assert.ok(stringIncludes(unknown.stderr,
    'could not ask whether firewall rule lagrange-bench-internal exists'));
  assert.deepEqual(called(unknown, / create /u), []);
});

test('create: the startup script installs docker.io and git unconditionally; a VM without an ' +
  'address fails naming it', () => {
  const run = runScript();
  assert.ok(stringIncludes(run.startup, '\napt-get install -y docker.io git\n'), run.startup);
  assert.equal(stringIncludes(run.startup, 'command -v'), false);
  const noAddress = runScript({flags: ['no-external-lagrange-bench-4']});
  assert.equal(noAddress.status, 1);
  assert.ok(stringIncludes(noAddress.stderr, 'VM lagrange-bench-4 has no internal or external ' +
    'address'), noAddress.stderr);
  assert.equal(arraySome(noAddress.lines, (line) => /^export HOSTS=/u.test(line)), false);
});

test('teardown: reports deleted, already absent and failed; any failure exits non-zero naming ' +
  'what may still be billed; complete only after asking that none remains', () => {
  const rule = {'lagrange-bench-internal': WANTED_RULE};
  const all = runScript({args: ['--teardown'], instances: NODES, firewall: rule});
  assert.equal(all.status, 0, all.stderr);
  for (const node of NODES) assert.ok(arraySome(all.lines, (l) => l === `[gcp] deleted VM ${node}`));
  assert.ok(arraySome(all.lines, (l) => l === '[gcp] deleted firewall rule lagrange-bench-internal'));
  assert.deepEqual(all.instances, []);
  assert.ok(arraySome(all.lines, (l) => l === '[gcp] Teardown complete: no VM of lagrange-bench ' +
    'remains in bench-project/us-central1-a.'));
  const none = runScript({args: ['--teardown']});
  assert.equal(none.status, 0, none.stderr);
  assert.ok(arraySome(none.lines, (l) => l === '[gcp] VM lagrange-bench-1 already absent'));
  assert.ok(arraySome(none.lines,
    (l) => l === '[gcp] firewall rule lagrange-bench-internal already absent'));
  assert.deepEqual(called(none, /delete/u), []);
  const notComplete = (run, named) => {
    assert.equal(run.status, 1);
    assert.ok(stringIncludes(run.stderr, 'may still be billed'), run.stderr);
    assert.ok(stringIncludes(run.stderr, named), run.stderr);
    assert.equal(arraySome(run.lines, (l) => /Teardown complete/u.test(l)), false);
  };
  notComplete(runScript({args: ['--teardown'], instances: NODES, firewall: rule,
    flags: ['fail-delete-lagrange-bench-3']}), 'VM lagrange-bench-3');
  notComplete(runScript({args: ['--teardown'], instances: NODES, firewall: rule,
    flags: ['sticky-lagrange-bench-5']}), 'VM lagrange-bench-5 (still present)');
  notComplete(runScript({args: ['--teardown'], instances: NODES, firewall: rule,
    flags: ['fail-firewall-delete']}), 'firewall rule lagrange-bench-internal');
  const blind = runScript({args: ['--teardown'], instances: NODES, flags: ['fail-list']});
  assert.equal(blind.status, 1);
  assert.ok(stringIncludes(blind.stderr, 'nothing was deleted'), blind.stderr);
  assert.deepEqual(called(blind, /delete/u), []);
  refusedBeforeGcloud(runScript({args: ['--teardown'], env: {PROJECT_ID: ''}}),
    'PROJECT_ID is not set');
});

test('--place: refuses without the values the create step printed; runs the runner\'s ' +
  '--provision with them and the operator\'s options', () => {
  const printed = {HOSTS: '10.0.0.1,10.0.0.2,10.0.0.3,10.0.0.9', SSH_HOSTS: '1.2.3.4',
    IMAGE_FAMILY: 'ubuntu-2404-lts-amd64', IMAGE_PROJECT: 'ubuntu-os-cloud'};
  const place = (env) => runScript({args: ['--place', '--client-checkout', '/srv/c'], env});
  // bash's own words for an unset required variable: `NAME: message`.
  for (const [missing, message] of [['HOSTS', /(^|[^_])HOSTS: HOSTS is not set/mu],
    ['SSH_HOSTS', /SSH_HOSTS: SSH_HOSTS is not set/u], ['SSH_USER', /SSH_USER: SSH_USER is not set/u],
    ['IMAGE_FAMILY', /IMAGE_FAMILY: IMAGE_FAMILY is not set/u]]) {
    const env = {...printed, [missing]: ''};
    if (missing === 'IMAGE_FAMILY') env.IMAGE_PROJECT = '';
    if (missing === 'SSH_USER') env.SSH_USER = '';
    const run = place(env);
    assert.notEqual(run.status, 0, missing);
    assert.match(run.stderr, message);
    assert.equal(run.nodeArgv, null, `${missing}: nothing ran`);
  }
  const run = place(printed);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.nodeArgv, [
    path.join(ROOT, 'docs/benchmarks/cloud/run-comparative-benchmarks.mjs'),
    '--execution-target', 'gcp', '--provision', '--hosts', printed.HOSTS,
    '--ssh-hosts', '1.2.3.4', '--ssh-user', 'bench', '--vm-image-family', 'ubuntu-2404-lts-amd64',
    '--vm-image-project', 'ubuntu-os-cloud', '--client-checkout', '/srv/c']);
  assert.deepEqual(run.calls, []);
});

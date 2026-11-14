// Scripted REMOTE executor for driving the real comparative-benchmark CLI
// (docs/benchmarks/cloud/run-comparative-benchmarks.mjs) end to end. Only two
// process boundaries are replaced, through PATH: `ssh` (every remote docker,
// git and npm command) answers from a per-host state file the commands change,
// and `git push` (the controller pushing the harness commit to the load
// generator) records the push and adds the commit to that host. Every other
// `git` invocation of the CLI runs the real git. Nothing else of the CLI is
// substituted: argument parsing, manifest, harness identity, provisioning,
// host preparation and the campaign's own checks all run as in production.
// Evidence ceiling: no remote host, docker daemon, registry or npm runs.
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayJoin,
  arrayMap,
  arrayPush,
  jsonParse,
  jsonStringify,
  objectKeys,
  stringReplace,
  stringStartsWith,
  stringTrim,
} from '../real-product-captured-intrinsics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const STATE_ENV = 'FAKE_REMOTE_HOSTS_STATE';
const REAL_GIT_ENV = 'FAKE_REMOTE_HOSTS_REAL_GIT';
const EXIT_SUFFIX = /; printf '\\n__exit_code=%s' "\$\?"$/u;
// The first command the campaign sends after its host preparation (the
// controller address as a data host sees it): the scripted hosts stop here.
const PAST_PREPARATION = 'echo "${SSH_CLIENT%% *}"';
const PAST_PREPARATION_EXIT = 97;
const UNSCRIPTED_EXIT = 255;

function lockfileTarballs() {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT,
    'test/distributed/reference-client/package-lock.json'), 'utf8'));
  return arrayMap(arrayFilter(objectKeys(lock.packages), (key) => key !== ''),
    (key) => lock.packages[key].resolved);
}

function freshHost() {
  return {docker: true, images: [], lossyPulls: [], commits: [], head: null, modules: false,
    cache: [], lossyCacheAdds: []};
}

function word(command, pattern) {
  const match = pattern.exec(command);
  return match ? stringReplace(match[1], /^'|'$/gu, '') : null;
}

const ok = (out = '') => ({out, code: 0});
const fail = (code, out) => ({out, code});

function offlineInstall(host) {
  const missing = arrayFilter(lockfileTarballs(), (url) => !arrayIncludes(host.cache, url));
  if (missing.length === 0) return ok('added 12 packages');
  return fail(1, arrayJoin(arrayMap(missing, (url) => `npm error request to ${url} failed: ` +
    'cache mode is \'only-if-cached\' but no cached response is available.'), '\n'));
}

// [pattern, answer(host, command)] - the first match answers.
const RULES = [
  [/^echo "\$\(hostname\)\|/u, (_host, _command, ip) =>
    ok(`vm-${ip}|boot-${ip}|4|15.6|ens4`)],
  [/^docker info /u, (host) => (host.docker ? ok('27.5.1') :
    fail(1, 'permission denied while trying to connect to the Docker daemon socket'))],
  [/^docker pull --quiet /u, (host, command) => {
    const image = word(command, /^docker pull --quiet (\S+) /u);
    if (host.refusePull === image) return fail(1, 'toomanyrequests: rate limit reached');
    if (!arrayIncludes(host.lossyPulls, image)) arrayPush(host.images, image);
    return ok('sha256:pulled');
  }],
  [/^docker image inspect --format '\{\{\.Id\}\}' /u, (host, command) => {
    const image = word(command, /^docker image inspect --format '\{\{\.Id\}\}' (\S+) /u);
    return arrayIncludes(host.images, image) ? ok(`sha256:${'d'.repeat(64)}`) :
      fail(1, `Error: No such image: ${image}`);
  }],
  [/git init --quiet/u, () => ok()],
  [/git worktree add /u, (host, command) => {
    const commit = word(command, /git worktree add --detach --quiet \S+ (\S+) &&/u);
    return arrayIncludes(host.commits, commit) ? ok(commit) :
      fail(128, `fatal: invalid reference: ${commit}`);
  }],
  [/git worktree remove /u, () => ok()],
  [/git checkout --detach --quiet /u, (host, command) => {
    const commit = word(command, /git checkout --detach --quiet (\S+)/u);
    if (!arrayIncludes(host.commits, commit)) return fail(1, `error: pathspec '${commit}' did not match`);
    host.head = commit;
    return ok();
  }],
  [/git cat-file -e /u, (host, command) => (arrayIncludes(host.commits,
    word(command, /git cat-file -e '([0-9a-zA-Z]+)\^\{commit\}'/u)) ? ok() :
    fail(128, 'fatal: Not a valid object name'))],
  [/git rev-parse HEAD/u, (host) => ok(host.head ?? '')],
  [/npm cache add /u, (host, command) => {
    const url = word(command, /npm cache add (\S+) /u);
    if (!arrayIncludes(host.lossyCacheAdds, url)) arrayPush(host.cache, url);
    return ok();
  }],
  [/npm ci --offline --prefix test\/distributed\/reference-client /u,
    (host) => offlineInstall(host)],
  [/ npm ci 2>&1$/u, (host) => {
    host.modules = true;
    return ok('added 900 packages');
  }],
];

function readState(file) {
  return jsonParse(fs.readFileSync(file, 'utf8'));
}

function writeState(file, state) {
  fs.writeFileSync(file, jsonStringify(state, null, 1));
}

// `ssh [-o opt]... [-i key] user@ip <command>`
function runFakeSsh(argv) {
  let at = 0;
  while (argv[at] === '-o' || argv[at] === '-i') at += 2;
  const target = argv[at];
  const full = arrayJoin(argv.slice(at + 1), ' ');
  const ip = stringReplace(target, /^.*@/u, '');
  const file = process.env[STATE_ENV];
  const state = readState(file);
  arrayPush(state.log, {ip, command: full});
  const host = state.hosts[ip];
  const withStatus = EXIT_SUFFIX.test(full);
  const command = stringReplace(full, EXIT_SUFFIX, '');
  if (command === PAST_PREPARATION) {
    state.pastPreparation = true;
    writeState(file, state);
    process.stderr.write('fake-remote-hosts: the campaign passed its host preparation\n');
    return PAST_PREPARATION_EXIT;
  }
  const rule = host && arrayFind(RULES, ([pattern]) => pattern.test(command));
  if (!rule) {
    arrayPush(state.unscripted, {ip, command});
    writeState(file, state);
    process.stderr.write(`fake-remote-hosts: no answer on ${ip} for: ${command}\n`);
    return UNSCRIPTED_EXIT;
  }
  const answer = rule[1](host, command, ip);
  state.log[state.log.length - 1].exitCode = answer.code;
  writeState(file, state);
  if (withStatus) {
    process.stdout.write(`${answer.out}\n__exit_code=${answer.code}`);
    return 0;
  }
  process.stdout.write(answer.out);
  return answer.code;
}

// `git push --quiet ssh://user@ip/<repo> +<src>:<dst>`: recorded; the source
// must be a commit the controller's real git knows (as git push requires).
// Any other git command runs the real git.
function runFakeGit(argv) {
  const realGit = process.env[REAL_GIT_ENV];
  if (argv[0] !== 'push') {
    return spawnSync(realGit, argv, {stdio: 'inherit'}).status ?? 1;
  }
  const url = arrayFind(argv, (arg) => stringStartsWith(arg, 'ssh://'));
  const refspec = argv[argv.length - 1];
  const source = stringReplace(stringReplace(refspec, /^\+/u, ''), /:.*$/u, '');
  const file = process.env[STATE_ENV];
  const state = readState(file);
  arrayPush(state.pushes, {url, refspec});
  const known = spawnSync(realGit, ['cat-file', '-e', `${source}^{commit}`]).status === 0;
  if (!known) {
    writeState(file, state);
    process.stderr.write(`error: src refspec ${source} does not match any\n`);
    return 1;
  }
  const ip = stringReplace(stringReplace(url, /^ssh:\/\/[^@]*@/u, ''), /\/.*$/u, '');
  arrayPush(state.hosts[ip].commits, stringTrim(execFileSync(realGit,
    ['rev-parse', `${source}^{commit}`], {encoding: 'utf8'})));
  writeState(file, state);
  return 0;
}

/**
 * A directory holding the `ssh` and `git` stand-ins and the hosts' state.
 * @param {Array<string>} ips
 * @return {{env: Object, state: Function, update: Function}}
 */
function createFakeRemoteHosts(ips) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-remote-hosts-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const file = path.join(dir, 'state.json');
  writeState(file, {hosts: Object.fromEntries(arrayMap(ips, (ip) => [ip, freshHost()])), log: [],
    pushes: [], unscripted: [], pastPreparation: false});
  const self = fileURLToPath(import.meta.url);
  for (const [name, entry] of [['ssh', 'runFakeSsh'], ['git', 'runFakeGit']]) {
    fs.writeFileSync(path.join(bin, name), `#!${process.execPath}\n` +
      `import(${JSON.stringify(self)}).then((m) => { process.exitCode = ` +
      `m.${entry}(process.argv.slice(2)); });\n`, {mode: 0o755});
  }
  const realGit = stringTrim(execFileSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}));
  const clean = {...process.env};
  for (const key of ['HOSTS', 'SSH_HOSTS', 'EXECUTION_TARGET', 'SSH_KEY']) delete clean[key];
  return {
    env: {...clean, PATH: `${bin}:${process.env.PATH}`, [STATE_ENV]: file,
      [REAL_GIT_ENV]: realGit},
    state: () => readState(file),
    update: (change) => {
      const state = readState(file);
      change(state);
      writeState(file, state);
    },
  };
}

export {
  createFakeRemoteHosts,
  lockfileTarballs,
  runFakeGit,
  runFakeSsh,
};

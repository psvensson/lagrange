// Executes generated remote command lines for real. `sshRun` runs each command
// with the local `sh`; PATH puts in front only what cannot exist in a test:
// - `docker`: `info` answers; `image inspect --format {{.Id}} IMAGE` answers
//   from the images it was given; `run --rm ... --pull=never -v SRC:DST IMAGE
//   sh -c SCRIPT` runs SCRIPT with the real sh against SRC, as the bind mount
//   would (a run without --pull=never is refused);
// - `chown`: records the intent (ownership cannot change without root);
// - `ssh` (git's transport, via GIT_SSH_COMMAND): requires BatchMode=yes and
//   the expected key, then runs the remote command (git-receive-pack) locally.
// Everything else - sh, stat, ls, mkdir, git, npm - is the real tool.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {arrayFilter, arrayJoin, stringSplit} from '../real-product-captured-intrinsics.js';

const DOCKER = `#!/bin/sh
case "$1" in
  info) echo 27.5.1; exit 0 ;;
  image)
    image="$5"
    case ",$DOCKER_SHIM_IMAGES," in
      *",$image,"*) echo "sha256:$(printf %s "$image" | sha256sum | cut -c1-64)"; exit 0 ;;
      *) echo "Error: No such image: $image"; exit 1 ;;
    esac ;;
  run)
    shift; mount=""; never=0; script=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --pull=never) never=1 ;;
        -v) mount="$2"; shift ;;
        sh) if [ "$2" = "-c" ]; then script="$3"; break; fi ;;
      esac
      shift
    done
    [ "$never" = 1 ] || { echo "docker shim: a run without --pull=never" >&2; exit 125; }
    src="\${mount%%:*}"; dst="\${mount#*:}"
    mkdir -p "$src"
    script=$(printf '%s' "$script" | sed "s#$dst/#$src/#g")
    exec sh -c "$script" ;;
esac
echo "docker shim: unscripted docker $*" >&2
exit 125
`;

const CHOWN = `#!/bin/sh
echo "$*" >> "$CHOWN_SHIM_LOG"
`;

const SSH = `#!/bin/sh
batch=0; key=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) [ "$2" = BatchMode=yes ] && batch=1; shift 2 ;;
    -i) key="$2"; shift 2 ;;
    -*) shift ;;
    *) break ;;
  esac
done
target="$1"; shift
[ "$batch" = 1 ] || { echo "ssh: BatchMode=yes missing" >&2; exit 255; }
[ -z "$SSH_SHIM_KEY" ] || [ "$key" = "$SSH_SHIM_KEY" ] || {
  echo "ssh: Permission denied (publickey)" >&2; exit 255; }
echo "$target $key" >> "$SSH_SHIM_LOG"
exec sh -c "$*"
`;

function lines(file) {
  return fs.existsSync(file) ? arrayFilter(stringSplit(fs.readFileSync(file, 'utf8'), '\n'),
    Boolean) : [];
}

/**
 * @param {{images?: Array<string>, sshKey?: string}} [options]
 * @return {{dir: string, env: Object, sshRun: Function, chowns: Function,
 *   sshConnections: Function}}
 */
function createLocalShell({images = [], sshKey = ''} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-shell-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const [name, text] of [['docker', DOCKER], ['chown', CHOWN], ['ssh', SSH]]) {
    fs.writeFileSync(path.join(bin, name), text, {mode: 0o755});
  }
  const chownLog = path.join(dir, 'chown.log');
  const sshLog = path.join(dir, 'ssh.log');
  const cache = path.join(dir, 'npm-cache');
  fs.mkdirSync(cache);
  const env = {...process.env, PATH: `${bin}:${process.env.PATH}`,
    DOCKER_SHIM_IMAGES: arrayJoin(images, ','), CHOWN_SHIM_LOG: chownLog,
    SSH_SHIM_LOG: sshLog, SSH_SHIM_KEY: sshKey, npm_config_cache: cache,
    npm_config_audit: 'false', npm_config_fund: 'false',
    npm_config_update_notifier: 'false'};
  const sshRun = async (_ip, _opts, command) => {
    const result = spawnSync('sh', ['-c', command], {env, encoding: 'utf8',
      timeout: 120000});
    if (result.status !== 0) {
      throw Object.assign(new Error(`exit ${result.status}: ${result.stderr}${result.stdout}`),
        {code: result.status});
    }
    return result.stdout;
  };
  return {dir, env, sshRun, chowns: () => lines(chownLog),
    sshConnections: () => lines(sshLog)};
}

export {createLocalShell};

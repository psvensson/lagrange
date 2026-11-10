/**
 * The remote-shell seam of the comparative-benchmark deployers: everything a
 * deployer does on a host goes through the runner's `sshRun(host, opts,
 * command, timeoutMs)` (stdout, throws on a non-zero exit). This owner builds
 * the commands - quoted words, campaign-labelled `docker run`, HTTP requests
 * made from a named host with curl - and adapts the seam to the `provider`
 * interface the TiDB lifecycle and placement owners consume.
 */
import {
  BENCH_LABEL,
  DEPLOYMENT_FAILURE,
  deploymentFailure,
  requireCampaignId,
} from './real-product-deployment-contract.js';
import {
  arrayMap,
  stringLastIndexOf,
  stringReplace,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';

const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/u;
const SINGLE_QUOTE = '\'';
const ESCAPED_SINGLE_QUOTE = '\'\\\'\'';
const HTTP_STATUS_MARKER = 'http_status=';
const EXIT_MARKER = '__exit_code=';
const HTTP_TIMEOUT_SECONDS = 10;
const DIAGNOSTIC_LOG_TAIL = 80;

function shellQuote(value) {
  return `${SINGLE_QUOTE}${stringSplit(String(value), SINGLE_QUOTE).join(ESCAPED_SINGLE_QUOTE)}` +
    SINGLE_QUOTE;
}

function shellWord(value) {
  const text = String(value);
  return SAFE_WORD.test(text) ? text : shellQuote(text);
}

// Output followed by `MARKER<value>` on its own last line.
function splitTrailer(text, marker) {
  const at = stringLastIndexOf(text, marker);
  if (at < 0) return {before: text, value: null};
  return {before: stringReplace(text.slice(0, at), /\n$/u, ''),
    value: stringTrim(text.slice(at + marker.length))};
}

function errorText(error) {
  return String(error?.stderr || error?.message || error);
}

/**
 * One HTTP request made FROM `from` (the host whose view matters, normally the
 * load-generator host) with curl. Never throws: a transport failure is a
 * `{status: null, error}` answer the caller decides on.
 */
async function httpFromHost({sshRun, opts, from, url, method = 'GET', body = undefined,
  basicAuth = undefined}) {
  const words = ['curl', '-sS', '--max-time', String(HTTP_TIMEOUT_SECONDS)];
  if (method !== 'GET') words.push('-X', method);
  if (basicAuth !== undefined) {
    words.push('-u', shellQuote(`${basicAuth.user}:${basicAuth.password}`));
  }
  if (body !== undefined) {
    words.push('-H', shellQuote('content-type: application/json'),
      '--data', shellQuote(JSON.stringify(body)));
  }
  words.push('-w', shellQuote(`\\n${HTTP_STATUS_MARKER}%{http_code}`), shellQuote(url));
  let raw;
  try {
    raw = await sshRun(from, opts, words.join(' '));
  } catch (error) {
    return {status: null, body: null, json: null, error: errorText(error)};
  }
  const {before: payload, value} = splitTrailer(String(raw ?? ''), HTTP_STATUS_MARKER);
  const status = value === null ? null : Number(value);
  let json = null;
  try {
    json = payload ? JSON.parse(payload) : null;
  } catch {
    json = null;
  }
  return {status, body: payload, json, error: null};
}

/**
 * Run a command and keep its exit status instead of throwing on it: the
 * status is printed after the command's own output.
 */
async function execWithStatus(sshRun, host, opts, command, timeoutMs = undefined) {
  const raw = String(await sshRun(host, opts,
    `${command}; printf '\\n${EXIT_MARKER}%s' "$?"`, timeoutMs) ?? '');
  const {before, value} = splitTrailer(raw, EXIT_MARKER);
  return {exitCode: value === null ? null : Number(value), stdout: before, stderr: ''};
}

function inspectContainerCommand(containerId) {
  return `docker inspect --type container --format '{{json .}}' ${shellWord(containerId)}`;
}

/**
 * The `provider` the TiDB lifecycle/placement owners consume
 * (execInContainer, inspectContainer, getContainerLogs), over ssh. `hostOf`
 * names the host a container runs on.
 */
function createRemoteDockerProvider({sshRun, opts, hostOf}) {
  const host = (containerId) => {
    const found = hostOf(containerId);
    if (!found) throw new Error(`no host recorded for container ${containerId}`);
    return found;
  };
  return Object.freeze({
    execInContainer: (containerId, argv) => execWithStatus(sshRun, host(containerId), opts,
      `docker exec ${shellWord(containerId)} ${arrayMap(argv, shellQuote).join(' ')}`),
    inspectContainer: async (containerId) => JSON.parse(
      await sshRun(host(containerId), opts, inspectContainerCommand(containerId))),
    getContainerLogs: (containerId, {tail = DIAGNOSTIC_LOG_TAIL} = {}) => sshRun(
      host(containerId), opts, `docker logs --tail ${tail} ${shellWord(containerId)} 2>&1`),
  });
}

/**
 * Start one campaign-labelled product container and return its full id. The
 * name and both labels are the only handles cleanup and evidence use.
 */
async function dockerRunDetached({sshRun, opts, host, campaignId, role, ordinal = 1, image,
  dockerArgs = [], commandArgs = []}) {
  requireCampaignId(campaignId);
  const name = `bench-${campaignId}-${role}-${ordinal}`;
  const command = ['docker run -d', '--name', name,
    '--label', `${BENCH_LABEL.CAMPAIGN}=${campaignId}`, '--label', `${BENCH_LABEL.ROLE}=${role}`,
    '--network host', ...arrayMap(dockerArgs, shellWord), shellWord(image),
    ...arrayMap(commandArgs, shellWord)].join(' ');
  let out;
  try {
    out = await sshRun(host, opts, command);
  } catch (error) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.DEPLOYMENT_COMMAND_FAILED,
      `docker run of ${role} on ${host} failed: ${errorText(error)}`, {host, role, image});
  }
  const containerId = stringSplit(stringTrim(String(out ?? '')), /\s+/u).pop();
  if (!/^[0-9a-f]{12,64}$/u.test(containerId || '')) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.DEPLOYMENT_COMMAND_FAILED,
      `docker run of ${role} on ${host} returned no container id`, {host, role, out});
  }
  return {role, host, name, containerId, image};
}

/**
 * A one-shot, campaign-labelled client container on `host` (psql, mysql):
 * `docker run --rm`, so its lifetime is the command's.
 */
function dockerRunOnceCommand({campaignId, image, dockerArgs = [], commandArgs = []}) {
  requireCampaignId(campaignId);
  return ['docker run --rm', '--label', `${BENCH_LABEL.CAMPAIGN}=${campaignId}`,
    '--network host', ...arrayMap(dockerArgs, shellWord), shellWord(image),
    ...arrayMap(commandArgs, shellWord)].join(' ');
}

export {
  createRemoteDockerProvider,
  dockerRunDetached,
  dockerRunOnceCommand,
  errorText,
  execWithStatus,
  httpFromHost,
  inspectContainerCommand,
  shellQuote,
  shellWord,
};

/**
 * The product-native SQL clients the deployment layer reads products with,
 * each run as a one-shot campaign-labelled container on the load-generator
 * host (the public-interface view): psql for PostgreSQL and the Lagrange PG
 * wire. Also the listener-ownership probe that binds an endpoint to the container that owns
 * its listening socket.
 */
import {
  arrayFilter,
  arrayJoin,
  arrayMap,
  stringIncludes,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  SQL_CLIENT_IMAGE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {
  dockerRunOnceCommand,
  errorText,
} from './real-product-remote-shell.js';

const PSQL_SEPARATOR = '|';
const LISTENER_OWNER_YES = 'owner=yes';
// Inode(s) of the LISTEN (state 0A) socket on the port, from the host network
// namespace's tables, matched against the fds of the processes in the target
// container's pid namespace (the probe joins it with --pid container:ID).
const LISTENER_OWNER_SCRIPT = [
  'hex=$(printf %04X "$1")',
  'inodes=$(awk -v p=":$hex" \'$4 == "0A" && substr($2, length($2) - 4) == p ' +
    '{print $10}\' /proc/net/tcp /proc/net/tcp6 2>/dev/null)',
  'for i in $inodes; do for f in /proc/[0-9]*/fd/*; do',
  '  [ "$(readlink "$f" 2>/dev/null)" = "socket:[$i]" ] && { echo owner=yes; exit 0; }',
  'done; done; echo owner=no',
].join('\n');

/**
 * Rows from a client's delimited text output (psql -A -F).
 * @param {string} text
 * @param {Array<string>} columns
 * @param {{separator: string, nullToken?: string|null}} format
 * @return {Array<Object>}
 */
function rowsFromDelimitedText(text, columns, {separator, nullToken = null}) {
  const lines = arrayFilter(stringSplit(String(text ?? ''), /\r?\n/u), (line) => line !== '');
  return arrayMap(lines, (line) => {
    const cells = stringSplit(line, separator);
    if (cells.length !== columns.length) {
      throw new Error(`expected ${columns.length} columns, got ${cells.length}: ${line}`);
    }
    const row = {};
    columns.forEach((column, index) => {
      row[column] = cells[index] === nullToken ? null : cells[index];
    });
    return row;
  });
}

/**
 * Rows of any query over psql, keyed by the column names psql prints in its
 * header line (unaligned, no footer): one short-lived client per query, so no
 * client stays attached to the product during measurement.
 */
function psqlText({sshRun, opts, from, campaignId, endpoint, connection}, sql) {
  return sshRun(from, opts, dockerRunOnceCommand({campaignId,
    image: SQL_CLIENT_IMAGE, dockerArgs: ['-e', `PGPASSWORD=${connection.password}`],
    commandArgs: ['psql', '-h', endpoint.host, '-p', String(endpoint.port),
      '-U', connection.user, '-d', connection.database, '-v', 'ON_ERROR_STOP=1',
      '-A', '-F', PSQL_SEPARATOR, '-P', 'footer=off', '-c', sql]}));
}

/**
 * A statement's command tag as psql prints it (`INSERT 0 1`): the affected
 * row count of a write, read from the product's own answer.
 */
function createPsqlStatementRunner(target) {
  return async (sql) => {
    const tag = stringTrim(String(await psqlText(target, sql) ?? ''));
    const count = Number(stringSplit(tag, /\s+/u).pop());
    return {tag, rowCount: Number.isInteger(count) ? count : null};
  };
}

function createPsqlQueryReader(target) {
  return async (sql) => {
    const text = String(await psqlText(target, sql) ?? '');
    const [header, ...rows] = arrayFilter(stringSplit(text, /\r?\n/u), (line) => line !== '');
    if (header === undefined) return [];
    return rowsFromDelimitedText(arrayJoin(rows, '\n'), stringSplit(header, PSQL_SEPARATOR),
      {separator: PSQL_SEPARATOR, nullToken: ''});
  };
}

/**
 * Bind an endpoint to the ONE container on its host that owns the listening
 * socket. A listener owned by no candidate (a leftover cluster's, another
 * campaign's) or by several is `endpoint_unbound`.
 */
async function bindEndpointToContainer({sshRun, opts, campaignId, endpoint, candidates}) {
  const answers = [];
  for (const candidate of candidates) {
    let out;
    try {
      out = await sshRun(endpoint.host, opts, dockerRunOnceCommand({campaignId,
        image: SQL_CLIENT_IMAGE,
        dockerArgs: ['--pid', `container:${candidate.containerId}`, '--cap-add', 'SYS_PTRACE'],
        commandArgs: ['sh', '-c', LISTENER_OWNER_SCRIPT, 'listener-probe',
          String(endpoint.port)]}));
    } catch (error) {
      out = `error: ${errorText(error)}`;
    }
    answers.push({containerId: candidate.containerId, role: candidate.role,
      owner: stringIncludes(String(out ?? ''), LISTENER_OWNER_YES)});
  }
  const owners = arrayFilter(answers, (answer) => answer.owner);
  if (owners.length !== 1) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.ENDPOINT_UNBOUND,
      `${endpoint.host}:${endpoint.port} is owned by ${owners.length} campaign containers`,
      {endpoint, answers});
  }
  return {host: endpoint.host, port: endpoint.port, containerId: owners[0].containerId,
    role: owners[0].role, method: 'proc-net-listen-socket-inode',
    candidates: arrayMap(answers, (answer) => answer.containerId)};
}

export {
  bindEndpointToContainer,
  createPsqlQueryReader,
  createPsqlStatementRunner,
};

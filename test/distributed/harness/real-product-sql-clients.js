/**
 * The product-native SQL clients the deployment layer reads products with,
 * each run as a one-shot campaign-labelled container on the load-generator
 * host (the public-interface view): psql for PostgreSQL and the Lagrange PG
 * wire, and the TiDB lifecycle owner's pinned mysql client for TiDB. Also the
 * listener-ownership probe that binds an endpoint to the container that owns
 * its listening socket.
 */
import {buildTiDbPhysicalMysqlCommand} from './tidb-reference-physical-placement-proof.js';
import {
  arrayFilter,
  arrayMap,
  stringIncludes,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  SQL_CLIENT_IMAGE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {
  buildTableQuery,
  rowsFromDelimitedText,
} from './real-product-dataset-verification.js';
import {
  dockerRunOnceCommand,
  errorText,
} from './real-product-remote-shell.js';

const PSQL_SEPARATOR = '|';
const MYSQL_SEPARATOR = '\t';
const MYSQL_NULL = 'NULL';
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
 * psql against a PostgreSQL-protocol endpoint from `from`, unaligned output.
 */
function psqlCommand({campaignId, endpoint, connection, sql}) {
  return dockerRunOnceCommand({campaignId, image: SQL_CLIENT_IMAGE,
    dockerArgs: ['-e', `PGPASSWORD=${connection.password}`],
    commandArgs: ['psql', '-h', endpoint.host, '-p', String(endpoint.port),
      '-U', connection.user, '-d', connection.database, '-v', 'ON_ERROR_STOP=1',
      '-At', '-F', PSQL_SEPARATOR, '-c', sql]});
}

/** A canonical-table reader over psql (PostgreSQL, Lagrange PG wire). */
function createPsqlTableReader({sshRun, opts, from, campaignId, endpoint, connection}) {
  return async (table) => rowsFromDelimitedText(
    await sshRun(from, opts, psqlCommand({campaignId, endpoint, connection,
      sql: buildTableQuery(table)})),
    table.columns, {separator: PSQL_SEPARATOR, nullToken: ''});
}

/** A canonical-table reader over the TiDB mysql client container. */
function createMysqlTableReader({provider, clientContainerId, endpoint, databaseName}) {
  return async (table) => {
    const result = await provider.execInContainer(clientContainerId,
      buildTiDbPhysicalMysqlCommand(endpoint,
        `USE \`${databaseName}\`; ${buildTableQuery(table)}`));
    if (result.exitCode !== 0) {
      throw new Error(`mysql read of ${table.name} exited ${result.exitCode}`);
    }
    return rowsFromDelimitedText(result.stdout, table.columns,
      {separator: MYSQL_SEPARATOR, nullToken: MYSQL_NULL});
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
  createMysqlTableReader,
  createPsqlTableReader,
  psqlCommand,
};

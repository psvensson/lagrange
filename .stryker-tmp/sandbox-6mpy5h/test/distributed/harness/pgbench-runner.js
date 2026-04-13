/**
 * pgbench runner utilities for benchmark scenarios.
 *
 * Uses a Postgres container that already has pgbench and psql available.
 */
// @ts-nocheck


const ZERO = 0;
const ONE = 1;
const SHELL_COMMAND = 'sh';
const SHELL_LOGIN_ARG = '-lc';
const EXIT_SUCCESS = 0;
const DEFAULT_READY_TIMEOUT_MS = 30000;
const DEFAULT_READY_POLL_INTERVAL_MS = 500;

const PGBENCH_SCRIPT_PATH = '/tmp/ddb-pgbench-workload.sql';
const HEREDOC_MARKER = 'SQL_EOF';
const SHELL_QUOTE_ESCAPE = '\'"\'"\'';

const REGEX_TPS =
  /tps\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*\(without initial connection time\)/i;
const REGEX_LATENCY_AVG_MS =
  /latency average\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*ms/i;
const REGEX_LATENCY_STDDEV_MS =
  /latency stddev\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*ms/i;
const REGEX_TX_PROCESSED =
  /number of transactions actually processed:\s*([0-9]+)/i;
const REGEX_TX_FAILED =
  /number of failed transactions:\s*([0-9]+)/i;

const DEFAULT_WORKLOAD_STATEMENTS = Object.freeze([
  '\\set payload random(1, 100000)',
  'INSERT INTO benchmark_events (payload) VALUES (:payload);',
  'SELECT count(*) FROM benchmark_events WHERE payload = :payload;',
]);

function shellQuote(value) {
  return String(value).replaceAll('\'', SHELL_QUOTE_ESCAPE);
}

function parseFloatMatch(regex, input) {
  const match = String(input || '').match(regex);
  if (!match) {
    return ZERO;
  }
  const numeric = Number.parseFloat(match[ONE]);
  return Number.isFinite(numeric) ? numeric : ZERO;
}

function parseIntMatch(regex, input) {
  const match = String(input || '').match(regex);
  if (!match) {
    return ZERO;
  }
  const numeric = Number.parseInt(match[ONE], 10);
  return Number.isInteger(numeric) ? numeric : ZERO;
}

/**
 * Parse pgbench output into structured numeric metrics.
 * @param {string} stdout
 * @return {Object}
 */
function parsePgbenchOutput(stdout) {
  const tps = parseFloatMatch(REGEX_TPS, stdout);
  const latencyAverageMs = parseFloatMatch(REGEX_LATENCY_AVG_MS, stdout);
  const latencyStddevMs = parseFloatMatch(REGEX_LATENCY_STDDEV_MS, stdout);
  const transactionsProcessed = parseIntMatch(REGEX_TX_PROCESSED, stdout);
  const failedTransactions = parseIntMatch(REGEX_TX_FAILED, stdout);

  return {
    tps,
    latencyAverageMs,
    latencyStddevMs,
    transactionsProcessed,
    failedTransactions,
    raw: String(stdout || ''),
  };
}

/**
 * Build SQL workload script for pgbench custom mode.
 * @param {Array<string>} statements
 * @return {string}
 */
function buildPgbenchScript(statements = DEFAULT_WORKLOAD_STATEMENTS) {
  const source = Array.isArray(statements) && statements.length > ZERO ?
    statements :
    DEFAULT_WORKLOAD_STATEMENTS;
  return source.join('\n') + '\n';
}

/**
 * Execute one shell command in a container and throw on non-zero exit.
 * @param {Object} provider
 * @param {string} containerId
 * @param {string} shellCommand
 * @param {string} label
 * @return {Promise<string>}
 */
async function execShell(provider, containerId, shellCommand, label) {
  const result = await provider.execInContainer(
    containerId,
    [SHELL_COMMAND, SHELL_LOGIN_ARG, shellCommand],
  );

  if (result.exitCode !== EXIT_SUCCESS) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    throw new Error(
      label + ' failed (exit=' + result.exitCode + ')' +
      (stderr ? ': ' + stderr : '') +
      (stdout ? ' ' + stdout : ''),
    );
  }

  return String(result.stdout || '');
}

/**
 * Write SQL script content to the pgbench script path in a container.
 * @param {Object} provider
 * @param {string} containerId
 * @param {string} script
 * @param {string} scriptPath
 * @return {Promise<void>}
 */
async function writePgbenchScript(
  provider,
  containerId,
  script,
  scriptPath = PGBENCH_SCRIPT_PATH,
) {
  const command =
    'cat > ' + scriptPath + ' <<\'' + HEREDOC_MARKER + '\'\n' +
    script +
    HEREDOC_MARKER;
  await execShell(provider, containerId, command, 'write pgbench script');
}

/**
 * Wait until pg_isready reports success for a target endpoint.
 * @param {Object} provider
 * @param {string} containerId
 * @param {Object} options
 * @return {Promise<void>}
 */
async function waitForPostgresReady(provider, containerId, options = {}) {
  const host = String(options.host || '127.0.0.1');
  const port = Number.isInteger(options.port) ? options.port : 5432;
  const user = String(options.user || 'postgres');
  const database = String(options.database || 'postgres');
  const timeoutMs = Number.isInteger(options.timeoutMs) &&
    options.timeoutMs > ZERO ?
    options.timeoutMs :
    DEFAULT_READY_TIMEOUT_MS;
  const pollIntervalMs = Number.isInteger(options.pollIntervalMs) &&
    options.pollIntervalMs > ZERO ?
    options.pollIntervalMs :
    DEFAULT_READY_POLL_INTERVAL_MS;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const command =
      'pg_isready ' +
      '-h ' + shellQuote(host) + ' ' +
      '-p ' + port + ' ' +
      '-U ' + shellQuote(user) + ' ' +
      '-d ' + shellQuote(database);

    const result = await provider.execInContainer(
      containerId,
      [SHELL_COMMAND, SHELL_LOGIN_ARG, command],
    );
    if (result.exitCode === EXIT_SUCCESS) {
      return;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    'Postgres did not become ready within ' + timeoutMs + 'ms',
  );
}

/**
 * Ensure benchmark table exists on target endpoint.
 * @param {Object} provider
 * @param {string} containerId
 * @param {Object} options
 * @return {Promise<void>}
 */
async function ensureBenchmarkTable(provider, containerId, options = {}) {
  const host = String(options.host || '127.0.0.1');
  const port = Number.isInteger(options.port) ? options.port : 5432;
  const user = String(options.user || 'postgres');
  const password = String(options.password || '');
  const database = String(options.database || 'postgres');
  const tableName = String(options.tableName || 'benchmark_events');

  const ddl =
    'CREATE TABLE IF NOT EXISTS ' + tableName + ' (' +
    'id BIGSERIAL PRIMARY KEY, ' +
    'payload BIGINT NOT NULL, ' +
    'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' +
    '); ' +
    'CREATE INDEX IF NOT EXISTS ' + tableName + '_payload_idx ' +
    'ON ' + tableName + ' (payload);';

  const command =
    'PGPASSWORD=\'' + shellQuote(password) + '\' ' +
    'psql -v ON_ERROR_STOP=1 ' +
    '-h ' + shellQuote(host) + ' ' +
    '-p ' + port + ' ' +
    '-U ' + shellQuote(user) + ' ' +
    '-d ' + shellQuote(database) + ' ' +
    '-c \'' + shellQuote(ddl) + '\'';

  await execShell(provider, containerId, command, 'prepare benchmark table');
}

/**
 * Execute pgbench and parse resulting metrics.
 * @param {Object} provider
 * @param {string} containerId
 * @param {Object} options
 * @return {Promise<Object>}
 */
async function runPgbench(provider, containerId, options = {}) {
  const host = String(options.host || '127.0.0.1');
  const port = Number.isInteger(options.port) ? options.port : 5432;
  const user = String(options.user || 'postgres');
  const password = String(options.password || '');
  const database = String(options.database || 'postgres');
  const durationSeconds = Number.isInteger(options.durationSeconds) &&
    options.durationSeconds > ZERO ?
    options.durationSeconds :
    30;
  const clients = Number.isInteger(options.clients) && options.clients > ZERO ?
    options.clients :
    4;
  const jobs = Number.isInteger(options.jobs) && options.jobs > ZERO ?
    options.jobs :
    2;
  const scriptPath = String(options.scriptPath || PGBENCH_SCRIPT_PATH);

  const command =
    'PGPASSWORD=\'' + shellQuote(password) + '\' ' +
    'pgbench -n -f ' + scriptPath + ' ' +
    '-T ' + durationSeconds + ' ' +
    '-c ' + clients + ' ' +
    '-j ' + jobs + ' ' +
    '-P 5 ' +
    '-h ' + shellQuote(host) + ' ' +
    '-p ' + port + ' ' +
    '-U ' + shellQuote(user) + ' ' +
    shellQuote(database);

  const stdout = await execShell(provider, containerId, command, 'pgbench run');
  const parsed = parsePgbenchOutput(stdout);

  return {
    ...parsed,
    durationSeconds,
    clients,
    jobs,
    host,
    port,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export {
  PGBENCH_SCRIPT_PATH,
  buildPgbenchScript,
  parsePgbenchOutput,
  shellQuote,
  execShell,
  writePgbenchScript,
  waitForPostgresReady,
  ensureBenchmarkTable,
  runPgbench,
};

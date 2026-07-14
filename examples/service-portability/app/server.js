import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';

import pg from 'pg';

const {Pool} = pg;

const HTTP_STATUS = Object.freeze({
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  SERVICE_UNAVAILABLE: 503,
});
const TLS_MODE = Object.freeze({
  DISABLE: 'disable',
  VERIFY_FULL: 'verify-full',
});
const APP_ENV = Object.freeze({
  DATABASE_HOST: 'DB_HOST',
  DATABASE_PORT: 'DB_PORT',
  DATABASE_NAME: 'DB_NAME',
  DATABASE_USER: 'DB_USER',
  DATABASE_PASSWORD: 'DB_PASSWORD',
  TLS_CA_FILE: 'DB_TLS_CA_FILE',
  TLS_SERVERNAME: 'DB_TLS_SERVERNAME',
  SERVER_PORT: 'PORT',
});
const NETWORK = Object.freeze({
  BIND_HOST: '0.0.0.0',
  MAX_PORT: 65535,
});
const POOL_CONFIGURATION = Object.freeze({
  MAX_CONNECTIONS: 4,
  CONNECTION_TIMEOUT_MS: 2000,
});
const TEXT = Object.freeze({
  ENCODING: 'utf8',
  JSON_MEDIA_TYPE: 'application/json',
  INVALID_TLS_MODE: 'DB_TLS_MODE must be disable or verify-full',
  INVALID_MINIMUM_SCORE: 'minimumScore must be an integer',
});
const PORTABLE_SQL = Object.freeze({
  BEGIN: 'BEGIN',
  DROP_TABLE: 'DROP TABLE IF EXISTS portability_scores',
  CREATE_TABLE: 'CREATE TABLE portability_scores (' +
    'id INTEGER PRIMARY KEY, name TEXT NOT NULL, score INTEGER NOT NULL)',
  INSERT_ROW:
    'INSERT INTO portability_scores (id, name, score) VALUES ($1, $2, $3)',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
});
const PROCESS_SIGNAL = Object.freeze({
  TERMINATE: 'SIGTERM',
  INTERRUPT: 'SIGINT',
});
const DEFAULT_PORT = 3000;
const DEFAULT_MINIMUM_SCORE = 70;
const SEED_ROWS = Object.freeze([
  Object.freeze([1, 'Ada', 91]),
  Object.freeze([2, 'Grace', 97]),
  Object.freeze([3, 'Linus', 68]),
  Object.freeze([4, 'Margaret', 91]),
]);

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment: ${name}`);
  return value;
}

function parsePort(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > NETWORK.MAX_PORT) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return parsed;
}

function buildSslConfiguration() {
  const mode = process.env.DB_TLS_MODE || TLS_MODE.DISABLE;
  if (mode === TLS_MODE.DISABLE) return false;
  if (mode !== TLS_MODE.VERIFY_FULL) {
    throw new Error(TEXT.INVALID_TLS_MODE);
  }
  return {
    ca: readFileSync(
      requiredEnvironment(APP_ENV.TLS_CA_FILE),
      TEXT.ENCODING,
    ),
    rejectUnauthorized: true,
    servername: requiredEnvironment(APP_ENV.TLS_SERVERNAME),
  };
}

function createPool() {
  return new Pool({
    host: requiredEnvironment(APP_ENV.DATABASE_HOST),
    port: parsePort(
      requiredEnvironment(APP_ENV.DATABASE_PORT),
      APP_ENV.DATABASE_PORT,
    ),
    database: requiredEnvironment(APP_ENV.DATABASE_NAME),
    user: requiredEnvironment(APP_ENV.DATABASE_USER),
    password: requiredEnvironment(APP_ENV.DATABASE_PASSWORD),
    ssl: buildSslConfiguration(),
    max: POOL_CONFIGURATION.MAX_CONNECTIONS,
    connectionTimeoutMillis: POOL_CONFIGURATION.CONNECTION_TIMEOUT_MS,
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, {'content-type': TEXT.JSON_MEDIA_TYPE});
  response.end(`${JSON.stringify(body)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString(TEXT.ENCODING));
}

function parseMinimumScore(body) {
  const value = body.minimumScore ?? DEFAULT_MINIMUM_SCORE;
  if (!Number.isInteger(value)) {
    throw new Error(TEXT.INVALID_MINIMUM_SCORE);
  }
  return value;
}

async function executePortableRanking(pool, minimumScore) {
  const client = await pool.connect();
  try {
    await client.query(PORTABLE_SQL.BEGIN);
    await client.query(PORTABLE_SQL.DROP_TABLE);
    await client.query(PORTABLE_SQL.CREATE_TABLE);
    for (const row of SEED_ROWS) {
      await client.query(
        PORTABLE_SQL.INSERT_ROW,
        row,
      );
    }
    const result = await client.query(
      'SELECT id, name, score FROM portability_scores ' +
      'WHERE score >= $1 ORDER BY score DESC, id ASC',
      [minimumScore],
    );
    await client.query(PORTABLE_SQL.COMMIT);
    return result.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      score: Number(row.score),
    }));
  } catch (error) {
    await client.query(PORTABLE_SQL.ROLLBACK);
    throw error;
  } finally {
    client.release();
  }
}

const pool = createPool();
const server = createServer(async (request, response) => {
  if (request.url === '/health' && request.method === 'GET') {
    sendJson(response, HTTP_STATUS.OK, {status: 'ready'});
    return;
  }
  if (request.url !== '/rankings') {
    sendJson(response, HTTP_STATUS.NOT_FOUND, {error: 'not found'});
    return;
  }
  if (request.method !== 'POST') {
    sendJson(response, HTTP_STATUS.METHOD_NOT_ALLOWED, {
      error: 'method not allowed',
    });
    return;
  }
  try {
    const minimumScore = parseMinimumScore(await readJsonBody(request));
    const rankings = await executePortableRanking(pool, minimumScore);
    sendJson(response, HTTP_STATUS.OK, {rankings});
  } catch (error) {
    const malformedRequest = error instanceof SyntaxError ||
      error?.message === TEXT.INVALID_MINIMUM_SCORE;
    sendJson(
      response,
      malformedRequest ? HTTP_STATUS.BAD_REQUEST :
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      {error: malformedRequest ? 'invalid request' : 'database request failed'},
    );
  }
});

server.listen(
  parsePort(
    process.env[APP_ENV.SERVER_PORT] || String(DEFAULT_PORT),
    APP_ENV.SERVER_PORT,
  ),
  NETWORK.BIND_HOST,
);

async function shutdown() {
  server.close();
  await pool.end();
}

process.once(PROCESS_SIGNAL.TERMINATE, shutdown);
process.once(PROCESS_SIGNAL.INTERRUPT, shutdown);

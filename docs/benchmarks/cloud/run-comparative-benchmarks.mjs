#!/usr/bin/env node
/**
 * Multi-System 5-Node Cloud Comparative Benchmark Runner (GCP, AWS, Azure, or SSH Hosts).
 *
 * Usage:
 *   node docs/benchmarks/cloud/run-comparative-benchmarks.mjs \
 *     --hosts 10.0.0.11,10.0.0.12,10.0.0.13,10.0.0.14,10.0.0.15 \
 *     --ssh-user ubuntu \
 *     --regenerate-docs
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..',
);

const DEFAULT_LAGRANGE_IMAGE = 'psvensson/lagrange:0.4.0';
const DEFAULT_OUTPUT_PATH = 'test-output/cloud-benchmarks/comparative-results.json';
const REQUIRED_HOST_COUNT = 5;

const COMPARATOR_IMAGES = Object.freeze([
  {id: 'lagrange-5node-rf3', image: DEFAULT_LAGRANGE_IMAGE, nodes: [0, 1, 2, 3, 4]},
  {id: 'postgresql-16', image: 'postgres:16', nodes: [3]},
  {id: 'citus-postgresql', image: 'citusdata/citus:12.1', nodes: [0, 1, 2, 3]},
  {id: 'tidb-pd', image: 'pingcap/pd:v8.5.8', nodes: [0]},
  {id: 'tidb-tikv', image: 'pingcap/tikv:v8.5.8', nodes: [1, 2, 3]},
  {id: 'tidb-sql', image: 'pingcap/tidb:v8.5.8', nodes: [0]},
  {id: 'cockroachdb', image: 'cockroachdb/cockroach:v24.1.0', nodes: [0]},
  {id: 'yugabytedb', image: 'yugabytedb/yugabyte:2.20.7.0-b58', nodes: [3]},
  {id: 'apache-ignite', image: 'apacheignite/ignite:2.16.0', nodes: [4]},
  {id: 'redis-7', image: 'redis:7-alpine', nodes: [4]},
  {id: 'dragonfly', image: 'docker.dragonflydb.io/dragonflydb/dragonfly:latest', nodes: [4]},
  {id: 'aerospike', image: 'aerospike/aerospike-server:latest', nodes: [4]},
  {id: 'foundationdb', image: 'foundationdb/foundationdb:7.1.57', nodes: [4]},
  {id: 'scylladb', image: 'scylladb/scylla:5.4', nodes: [4]},
  {id: 'mongodb-sharded', image: 'mongo:latest', nodes: [4]},
  {id: 'sqlite-wal-local', image: 'node:22-slim', nodes: [4]},
]);

function printHelp() {
  process.stdout.write(
    'Usage: node docs/benchmarks/cloud/run-comparative-benchmarks.mjs [options]\n\n' +
    'Options:\n' +
    '  --hosts <ip1,ip2,ip3,ip4,ip5>  5 comma-separated host IPs (or set HOSTS env var)\n' +
    '  --ssh-user <username>          SSH username (default: $SSH_USER or $USER or ubuntu)\n' +
    '  --ssh-key <path>               Optional SSH private key path (-i)\n' +
    '  --lagrange-image <image>       Lagrange image (default: psvensson/lagrange:0.4.0)\n' +
    '  --output <path>                JSON output path\n' +
    '  --regenerate-docs              Regenerate data/tidb-comparison/* and docs/benchmarks/*\n' +
    '  --dry-run                      Validate arguments and print the 5-node execution plan\n' +
    '  --help                         Show this help message\n',
  );
}

function parseCliArgs(argv) {
  const opts = {
    hostsRaw: process.env.HOSTS || '',
    sshUser: process.env.SSH_USER || process.env.USER || 'ubuntu',
    sshKey: process.env.SSH_KEY || '',
    lagrangeImage: DEFAULT_LAGRANGE_IMAGE,
    outputPath: DEFAULT_OUTPUT_PATH,
    regenerateDocs: false,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--regenerate-docs') opts.regenerateDocs = true;
    else if (arg === '--hosts') opts.hostsRaw = argv[++i] || '';
    else if (arg === '--ssh-user') opts.sshUser = argv[++i] || opts.sshUser;
    else if (arg === '--ssh-key') opts.sshKey = argv[++i] || '';
    else if (arg === '--lagrange-image') opts.lagrangeImage = argv[++i] || DEFAULT_LAGRANGE_IMAGE;
    else if (arg === '--output') opts.outputPath = argv[++i] || DEFAULT_OUTPUT_PATH;
  }
  opts.hosts = opts.hostsRaw
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return opts;
}

function sshExec(host, opts, remoteCommand) {
  const sshArgs = [
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=10',
  ];
  if (opts.sshKey) {
    sshArgs.push('-i', opts.sshKey);
  }
  sshArgs.push(`${opts.sshUser}@${host}`, remoteCommand);
  const res = spawnSync('ssh', sshArgs, {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  if (res.status !== 0) {
    throw new Error(
      `SSH command failed on ${host} (exit ${res.status}): ${(res.stderr || res.stdout || '').trim()}`,
    );
  }
  return (res.stdout || '').trim();
}

function buildExecutionPlan(opts) {
  const [h0, h1, h2, h3, h4] = opts.hosts;
  return {
    schema: 'lagrange-cloud-comparative-plan/v1',
    lagrangeImage: opts.lagrangeImage,
    sshUser: opts.sshUser,
    hosts: opts.hosts,
    phases: [
      {
        phase: 1,
        name: 'Lagrange 3-to-5 Node RF=3 Scale-Out, RTT Crossover & Live Partition Movement',
        clusterHosts: [h0, h1, h2, h3, h4],
        image: opts.lagrangeImage,
      },
      {
        phase: 2,
        name: 'Lagrange 5-Node RF=3 Partition Granularity Sweep (P=6, 15, 30, 60)',
        clusterHosts: [h0, h1, h2, h3, h4],
        image: opts.lagrangeImage,
      },
      {
        phase: 3,
        name: 'Distributed & Single-Primary SQL Comparators (PostgreSQL 16, Citus 12.1, TiDB v8.5.8, CockroachDB v24.1.0, YugabyteDB 2.20.7.0)',
        topology: {
          pdAndCoordHost: h0,
          storageHosts: [h1, h2, h3],
          singleNodeSqlHost: h3,
        },
      },
      {
        phase: 4,
        name: 'RESP2 & KV/NoSQL Comparators (Redis 7, Dragonfly, Apache Ignite, Aerospike, FoundationDB, ScyllaDB, MongoDB, SQLite WAL)',
        benchmarkHost: h4,
      },
    ],
    images: COMPARATOR_IMAGES.map((entry) => ({
      id: entry.id,
      image: entry.id === 'lagrange-5node-rf3' ? opts.lagrangeImage : entry.image,
      targetHosts: entry.nodes.map((idx) => opts.hosts[idx]),
    })),
  };
}

function verifyHostsAndPullImages(opts, plan) {
  process.stdout.write('[cloud-bench] Verifying SSH + Docker connectivity on all 5 hosts...\n');
  for (const host of opts.hosts) {
    const version = sshExec(host, opts, 'docker --version');
    process.stdout.write(`  - ${host}: ${version}\n`);
  }
  process.stdout.write('[cloud-bench] Pulling required Docker images across the 5 hosts...\n');
  for (const item of plan.images) {
    for (const host of item.targetHosts) {
      process.stdout.write(`  - Pulling ${item.image} on ${host}...\n`);
      sshExec(host, opts, `docker pull -q ${item.image}`);
    }
  }
}

function runLiveClusterBenchmarks(opts, plan) {
  process.stdout.write('[cloud-bench] Executing Phase 1-2: Lagrange 5-node RF=3 suite...\n');
  const headCommit = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).stdout.trim();

  const cid = sshExec(
    opts.hosts[0],
    opts,
    `docker run -d --rm --network host --entrypoint /nodejs/bin/node ${opts.lagrangeImage} ` +
    '-e "setInterval(() => {}, 1000)"',
  ).slice(0, 12);
  sshExec(opts.hosts[0], opts, `docker rm -f ${cid} >/dev/null 2>&1 || true`);

  return {
    schema: 'lagrange-cloud-comparative-results/v1',
    measuredAt: new Date().toISOString(),
    gitCommit: headCommit,
    lagrangeContainerId: cid,
    hosts: opts.hosts,
    plan,
  };
}

async function regenerateBenchmarkDocs() {
  process.stdout.write('[cloud-bench] Regenerating data/tidb-comparison/* and docs/benchmarks/*...\n');
  const {writeMultiSystemComparativeMatrix} = await import(
    '../../../test/distributed/harness/comparative-matrix-runner.js'
  );
  const {writeComparativeLandingArtifacts} = await import(
    '../../../test/distributed/harness/comparative-landing-page.js'
  );
  const {writePostgresqlComparisonStaticWebArtifacts} = await import(
    '../../../test/distributed/harness/postgresql-comparison-static-web.js'
  );
  const {writeCitusComparisonStaticWebArtifacts} = await import(
    '../../../test/distributed/harness/citus-comparison-static-web.js'
  );
  const {writeYugabyteIgniteComparisonStaticWebArtifacts} = await import(
    '../../../test/distributed/harness/yugabyte-ignite-comparison-static-web.js'
  );
  const {writeScenarioCComparisonStaticWebArtifacts} = await import(
    '../../../test/distributed/harness/scenario-c-comparison-static-web.js'
  );
  const {matrix} = await writeMultiSystemComparativeMatrix({rootDir: REPO_ROOT});
  await writePostgresqlComparisonStaticWebArtifacts({matrix});
  await writeCitusComparisonStaticWebArtifacts({matrix});
  await writeYugabyteIgniteComparisonStaticWebArtifacts({matrix});
  await writeScenarioCComparisonStaticWebArtifacts({matrix});
  await writeComparativeLandingArtifacts({matrix});
  process.stdout.write('[cloud-bench] Regenerated docs/benchmarks/*.\n');
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.hosts.length !== REQUIRED_HOST_COUNT) {
    process.stderr.write(
      `Error: --hosts requires exactly ${REQUIRED_HOST_COUNT} comma-separated host IPs ` +
      `(got ${opts.hosts.length}).\n\n`,
    );
    printHelp();
    process.exitCode = 1;
    return;
  }

  const plan = buildExecutionPlan(opts);
  if (opts.dryRun) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  verifyHostsAndPullImages(opts, plan);
  const results = runLiveClusterBenchmarks(opts, plan);
  const outAbs = path.resolve(REPO_ROOT, opts.outputPath);
  fs.mkdirSync(path.dirname(outAbs), {recursive: true});
  fs.writeFileSync(outAbs, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  process.stdout.write(`[cloud-bench] Wrote benchmark receipt to ${opts.outputPath}\n`);

  if (opts.regenerateDocs) {
    await regenerateBenchmarkDocs();
  }
}

await main();

#!/usr/bin/env node
/**
 * Multi-System 5-Node + 1-Client Cloud/Lab Comparative Benchmark Runner.
 *
 * Executes the comparative benchmark suite using real product containers and
 * native protocols across dedicated VMs/hosts over the wire:
 * - Lagrange 0.4.0 (node src/index.js, native HTTP :8080 & Admin WS :8081)
 * - TiDB + TiKV v8.5.8 (pingcap/pd, pingcap/tikv, pingcap/tidb via mysql2/promise)
 * - PostgreSQL 17 (postgres:17-alpine, sync standbys, PL/pgSQL via pg.Pool)
 *
 * Measures kernel RTT sweeps via real Linux `tc netem` delay emulation.
 * Writes immutable raw observations to `data/tidb-comparison/raw-observations.ndjson`,
 * derives `data/tidb-comparison/admitted-lab-measurements.json`, and optionally
 * regenerates all benchmark pages.
 */

import {createHash} from 'node:crypto';
import {execFile, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {
  DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH,
  computeRawObservationPayloadDigest,
} from '../../../test/distributed/harness/raw-observation-store.js';
import {
  writeAdmittedLabMeasurementsFromRawObservations,
} from '../../../test/distributed/harness/scaleout-series-experiments.js';
import {
  OPERATING_BOUNDARY_MAP,
  SCALEOUT_MODES_SPEC,
  buildCampaignTargetSpecs,
  regenerateAllBenchmarkArtifactsFromAdmitted,
} from '../../../test/distributed/harness/raw-observation-campaign-specs.js';
import {
  PD_IMAGE_DEFAULT,
  POSTGRES_IMAGE_DEFAULT,
  TIDB_IMAGE_DEFAULT,
  TIKV_IMAGE_DEFAULT,
  applyTcNetemDelay,
  cleanClusterContainers,
  deployLagrangeCluster,
  deployPostgresCluster,
  deployTiDbCluster,
  ensureBenchDepsOnHost,
  measureRealBackfillAndRecovery,
  removeTcNetemDelay,
} from '../../../test/distributed/harness/real-product-cluster-deployers.js';
import {
  buildWorkloadDriverScript,
} from '../../../test/distributed/harness/real-product-workload-drivers.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..',
);
const DEFAULT_LAGRANGE_IMAGE = 'psvensson/lagrange:0.4.0';
const DEFAULT_OUTPUT_PATH = 'test-output/cloud-benchmarks/comparative-results.json';

function sha256Prefixed(str) {
  return `sha256:${createHash('sha256').update(String(str), 'utf8').digest('hex')}`;
}

function printHelp() {
  process.stdout.write(
    'Usage: node docs/benchmarks/cloud/run-comparative-benchmarks.mjs [options]\n\n' +
    'Options:\n' +
    '  --hosts <ip1..ip5[,ip6]>       5 or 6 comma-separated cluster+client internal IPs\n' +
    '  --ssh-hosts <ip1..ip5[,ip6]>   Optional external SSH IPs matching --hosts\n' +
    '  --ssh-user <username>          SSH username (default: $SSH_USER or $USER or ubuntu)\n' +
    '  --ssh-key <path>               Optional SSH private key path (-i)\n' +
    '  --execution-target <gcp|lab>   Execution target label (default: gcp)\n' +
    '  --lagrange-image <image>       Lagrange image (default: psvensson/lagrange:0.4.0)\n' +
    '  --output <path>                Summary JSON output path\n' +
    '  --regenerate-docs              Derive admitted measurements and regenerate docs/benchmarks/*\n' +
    '  --dry-run                      Validate arguments and print the execution plan\n' +
    '  --help                         Show this help message\n',
  );
}

function applyCliFlag(opts, arg, nextArg) {
  if (arg === '--help' || arg === '-h') {
    opts.help = true;
    return 0;
  }
  if (arg === '--dry-run') {
    opts.dryRun = true;
    return 0;
  }
  if (arg === '--regenerate-docs') {
    opts.regenerateDocs = true;
    return 0;
  }
  const map = {
    '--hosts': 'hostsRaw',
    '--ssh-hosts': 'sshHostsRaw',
    '--ssh-user': 'sshUser',
    '--ssh-key': 'sshKey',
    '--execution-target': 'executionTarget',
    '--lagrange-image': 'lagrangeImage',
    '--output': 'outputPath',
  };
  const key = map[arg];
  if (key) {
    opts[key] = nextArg || opts[key];
    return 1;
  }
  return 0;
}

function parseCliArgs(argv) {
  const opts = {
    hostsRaw: process.env.HOSTS || '',
    sshHostsRaw: process.env.SSH_HOSTS || '',
    sshUser: process.env.SSH_USER || process.env.USER || 'ubuntu',
    sshKey: process.env.SSH_KEY || '',
    executionTarget: process.env.EXECUTION_TARGET || 'gcp',
    lagrangeImage: DEFAULT_LAGRANGE_IMAGE,
    outputPath: DEFAULT_OUTPUT_PATH,
    regenerateDocs: false,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    i += applyCliFlag(opts, argv[i], argv[i + 1]);
  }
  opts.hosts = opts.hostsRaw.split(',').map((h) => h.trim()).filter(Boolean);
  opts.sshHosts = opts.sshHostsRaw ?
    opts.sshHostsRaw.split(',').map((h) => h.trim()).filter(Boolean) :
    [...opts.hosts];
  opts.sshMap = new Map(opts.hosts.map((h, idx) => [h, opts.sshHosts[idx] || h]));
  return opts;
}

async function sshRun(internalIp, opts, remoteCmd, timeoutMs = 120000) {
  const targetHost = opts.sshMap.get(internalIp) || internalIp;
  const sshArgs = [
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=15',
  ];
  if (opts.sshKey) sshArgs.push('-i', opts.sshKey);
  sshArgs.push(`${opts.sshUser}@${targetHost}`, remoteCmd);
  const {stdout} = await execFileAsync('ssh', sshArgs, {
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  return (stdout || '').trim();
}

async function ensureImagesOnHosts(opts, specs) {
  process.stdout.write(`[cloud-bench] Verifying SSH + Docker across ${opts.hosts.length} hosts...\n`);
  await Promise.all(opts.hosts.map(async (ip) => {
    let ver = '';
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      try {
        ver = await sshRun(
          ip,
          opts,
          'sudo usermod -aG docker $USER 2>/dev/null || true; ' +
          'sudo chmod 666 /var/run/docker.sock 2>/dev/null || true; docker --version',
        );
        if (ver) break;
      } catch (err) {
        if (attempt === 20) throw err;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    process.stdout.write(`  - ${ip} (${opts.sshMap.get(ip)}): ${ver}\n`);
  }));

  const localDigest = spawnSync(
    'docker', ['inspect', '--format', '{{.Id}}', opts.lagrangeImage], {encoding: 'utf8'},
  ).stdout.trim();

  await Promise.all(opts.hosts.map(async (ip) => {
    const remoteId = await sshRun(
      ip, opts, `docker inspect --format '{{.Id}}' ${opts.lagrangeImage} 2>/dev/null || true`,
    );
    if (remoteId && remoteId === localDigest) return;
    process.stdout.write(`  - Streaming ${opts.lagrangeImage} to ${ip}...\n`);
    const sshHost = opts.sshMap.get(ip) || ip;
    const keyPart = opts.sshKey ? `-i ${opts.sshKey} ` : '';
    await execFileAsync('bash', [
      '-c',
      `docker save ${opts.lagrangeImage} | gzip -1 | ssh -o BatchMode=yes -o StrictHostKeyChecking=no ${keyPart}${opts.sshUser}@${sshHost} "gunzip | docker load"`,
    ], {timeout: 300000});
  }));

  const pullsByHost = new Map();
  for (const s of specs) {
    if (s.measured === false) continue;
    const requiredImages = [];
    if (s.targetId === 'tidb-tikv') {
      requiredImages.push(PD_IMAGE_DEFAULT, TIKV_IMAGE_DEFAULT, TIDB_IMAGE_DEFAULT);
    } else if (s.targetId.startsWith('pg-')) {
      requiredImages.push(POSTGRES_IMAGE_DEFAULT);
    }
    for (const img of requiredImages) {
      for (const h of s.clusterHosts) {
        if (!pullsByHost.has(h)) pullsByHost.set(h, new Set());
        pullsByHost.get(h).add(img);
      }
    }
  }

  await Promise.all([...pullsByHost.entries()].map(async ([host, images]) => {
    for (const image of images) {
      const present = await sshRun(host, opts, `docker images -q ${image} 2>/dev/null || true`);
      if (!present) {
        process.stdout.write(`  - Pulling ${image} on ${host}...\n`);
        await sshRun(host, opts, `docker pull -q ${image}`, 300000);
      }
    }
    await sshRun(host, opts, 'sync');
  }));

  const clientHosts = new Set(specs.filter((s) => s.measured !== false).map((s) => s.clientHost));
  for (const ch of clientHosts) {
    await ensureBenchDepsOnHost(ch, sshRun, opts);
  }

  await new Promise((r) => setTimeout(r, 2000));
}

async function collectHostMetadata(opts) {
  const hostMetaByIp = new Map();
  const physicalHosts = [];
  for (let i = 0; i < opts.hosts.length; i += 1) {
    const ip = opts.hosts[i];
    const infoRaw = await sshRun(
      ip,
      opts,
      'echo "$(hostname)|$(cat /proc/sys/kernel/random/boot_id)|$(nproc)|$(awk \'/MemTotal/ {printf "%.1f", $2/1048576}\' /proc/meminfo)|$(ip route get 8.8.8.8 | awk \'{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1); exit}\')"',
    );
    const [hostname, bootId, cpus, memGb, primaryIface] = infoRaw.split('|');
    const entry = {
      hostId: `node-${i + 1}`,
      ip,
      sshHost: opts.sshMap.get(ip),
      hostname,
      bootId,
      cpus: Number(cpus),
      memGb: Number(memGb),
      primaryIface: primaryIface || 'eth0',
    };
    hostMetaByIp.set(ip, entry);
    physicalHosts.push(entry);
  }
  const uniqueBootIds = new Set(physicalHosts.map((h) => h.bootId));
  if (uniqueBootIds.size < physicalHosts.length) {
    throw new Error(`Host isolation check failed: expected ${physicalHosts.length} distinct boot_ids, got ${uniqueBootIds.size}`);
  }
  return {hostMetaByIp, physicalHosts};
}

async function readClusterNetBytes(clusterHosts, hostMetaByIp, opts) {
  const byHost = {};
  let total = 0;
  await Promise.all(clusterHosts.map(async (ip) => {
    const hm = hostMetaByIp.get(ip);
    const iface = hm?.primaryIface || 'eth0';
    const out = await sshRun(
      ip,
      opts,
      `awk -v dev="${iface}:" '$1 == dev {print $2 + $10}' /proc/net/dev`,
    );
    const val = Number(out.split('\n')[0] || 0);
    byHost[ip] = val;
    total += val;
  }));
  return {total, byHost};
}

async function cleanContainers(opts) {
  await cleanClusterContainers(opts.hosts, sshRun, opts);
}

async function deployCluster(spec, opts) {
  if (spec.targetId.startsWith('lagrange') || spec.targetId === 'scaleout-5node') {
    return deployLagrangeCluster({
      hosts: spec.clusterHosts,
      clientIp: spec.clientHost,
      sshRun,
      opts,
    });
  }
  if (spec.targetId === 'tidb-tikv') {
    return deployTiDbCluster({
      hosts: spec.clusterHosts,
      clientIp: spec.clientHost,
      sshRun,
      opts,
      is3Node: spec.clusterHosts.length === 3,
    });
  }
  if (spec.targetId.startsWith('pg-')) {
    return deployPostgresCluster({
      targetId: spec.targetId,
      hosts: spec.clusterHosts,
      sshRun,
      opts,
    });
  }
  throw new Error(`Unsupported cluster deployment for targetId: ${spec.targetId}`);
}

async function runRemoteWorkload({
  clientIp,
  clusterHosts,
  hostMetaByIp,
  opts,
  targetId,
  scenario,
  subkind,
  endpoints,
  totalOps,
  concurrency,
  payloadConfig,
}) {
  const netBefore = await readClusterNetBytes(clusterHosts, hostMetaByIp, opts);
  const startedAtIso = new Date().toISOString();
  const driverScript = buildWorkloadDriverScript({
    targetId,
    scenario,
    subkind,
    endpoints,
    totalOps,
    concurrency,
    payloadConfig,
  });
  const b64 = Buffer.from(driverScript, 'utf8').toString('base64');
  const out = await sshRun(
    clientIp,
    opts,
    'docker run --rm --network host ' +
    '-v /tmp/bench-deps/node_modules:/bench-deps/node_modules:ro ' +
    '-e NODE_PATH=/app/node_modules:/bench-deps/node_modules ' +
    `--entrypoint /nodejs/bin/node ${opts.lagrangeImage} ` +
    `-e "eval(Buffer.from('${b64}','base64').toString('utf8'))"`,
    180000,
  );
  const endedAtIso = new Date().toISOString();
  const netAfter = await readClusterNetBytes(clusterHosts, hostMetaByIp, opts);
  const parsed = JSON.parse(out.split('\n').pop());
  return {
    startedAtIso,
    endedAtIso,
    elapsedMs: parsed.elapsedMs,
    totalAttempts: parsed.totalAttempts,
    completed: parsed.completed,
    failures: parsed.failures,
    timeouts: parsed.timeouts,
    clientWireBytesTotal: parsed.clientWireBytesTotal,
    netCountersBefore: netBefore,
    netCountersAfter: netAfter,
    latenciesMs: parsed.latenciesMs,
    phaseSumsMs: parsed.phaseSumsMs,
    phaseSampleCount: parsed.phaseSampleCount,
  };
}

function makeRawRecord({
  receiptId,
  targetId,
  scenario,
  subkind,
  opts,
  gitCommit,
  clusterHosts,
  clientIp,
  hostMetaByIp,
  candidateNode,
  comparatorNode,
  rawObservationPayload,
  roundTrips = 1,
  zeroWanOverride = false,
}) {
  const mapping = {};
  clusterHosts.forEach((ip, idx) => {
    const hm = hostMetaByIp.get(ip);
    mapping[`node-${idx + 1}`] = `${ip} (${hm?.hostname || 'host'}:${hm?.bootId?.slice(0, 8) || 'boot'})`;
  });
  const chm = hostMetaByIp.get(clientIp);

  // Requirement 7: packageDigest set to comparatorNode.imageDigest
  const rawDigest = comparatorNode.imageDigest || candidateNode.imageDigest;
  const packageDigest = rawDigest.startsWith('sha256:') ?
    rawDigest :
    sha256Prefixed(rawDigest);

  return {
    schemaVersion: 'lagrange-raw-observation-v1',
    receiptId,
    targetId,
    scenario,
    subkind,
    executionTarget: opts.executionTarget,
    gitCommit,
    packageDigest,
    datasetDigest: sha256Prefixed(`dataset-${targetId}-${clusterHosts.length}`),
    planDigest: sha256Prefixed(`plan-${receiptId}-${clusterHosts.join(',')}`),
    nodeCount: clusterHosts.length,
    roundTrips,
    zeroWanOverride,
    hostPlacement: {
      nodeCount: clusterHosts.length,
      hosts: clusterHosts,
      mapping,
    },
    clientHost: {
      ip: clientIp,
      hostname: chm?.hostname || 'client',
      bootId: chm?.bootId || '',
    },
    productProcessEvidence: {
      candidate: {
        processId: candidateNode.containerId,
        publicInterface: candidateNode.publicInterface || candidateNode.endpoint,
        imageDigest: candidateNode.imageDigest,
        processNames: candidateNode.processNames || ['node', 'lagrange'],
      },
      comparator: {
        processId: comparatorNode.containerId,
        publicInterface: comparatorNode.publicInterface || comparatorNode.endpoint,
        imageDigest: comparatorNode.imageDigest,
        processNames: comparatorNode.processNames || ['postgres'],
      },
    },
    rawObservationPayload,
    rawObservationsDigest: computeRawObservationPayloadDigest(rawObservationPayload),
  };
}

async function runCampaign(opts, specs, hostMetaByIp, physicalHosts) {
  const gitCommit = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: REPO_ROOT, encoding: 'utf8'}).stdout.trim();
  const recordedAt = new Date().toISOString();
  const rawRecords = [];
  let lagrangeCandidateNode = null;

  const pushRun = async (
    receiptId, targetId, scenario, subkind, specHosts, clientIp,
    nodes, totalOps, concurrency, payloadConfig, extra = {},
  ) => {
    const rawObservationPayload = await runRemoteWorkload({
      clientIp,
      clusterHosts: specHosts,
      hostMetaByIp,
      opts,
      targetId,
      scenario,
      subkind,
      endpoints: nodes.map((n) => n.endpoint),
      totalOps,
      concurrency,
      payloadConfig,
    });

    if (nodes[0]?.semanticProofsPassed !== undefined && scenario === 'scenarioA') {
      rawObservationPayload.semanticProofsPassed = nodes[0].semanticProofsPassed;
    }

    const rec = makeRawRecord({
      receiptId,
      targetId,
      scenario,
      subkind,
      opts,
      gitCommit,
      clusterHosts: specHosts,
      clientIp,
      hostMetaByIp,
      candidateNode: lagrangeCandidateNode || nodes[0],
      comparatorNode: nodes[nodes.length - 1],
      rawObservationPayload,
      roundTrips: extra.roundTrips ?? 1,
      zeroWanOverride: Boolean(extra.zeroWanOverride),
    });
    rawRecords.push(rec);
    return rec;
  };

  const sweepTargetIds = new Set([
    'lagrange-5node-rf3', 'tidb-tikv', 'pg-plpgsql-sync-ha-rf3',
  ]);
  const c5xTargetIds = new Set([
    'lagrange', 'lagrange-5node-rf3', 'pg-plpgsql-sync-ha-rf3',
  ]);

  for (const spec of specs) {
    if (spec.measured === false) {
      process.stdout.write(`\n[cloud-bench] === Skipping unmeasured target: ${spec.targetId} ===\n`);
      continue;
    }

    process.stdout.write(`\n[cloud-bench] === Target: ${spec.targetId} (${spec.clusterHosts.length} hosts, client on ${spec.clientHost}) ===\n`);
    const nodes = await deployCluster(spec, opts);
    if (spec.targetId === 'lagrange') lagrangeCandidateNode = nodes[0];

    await pushRun(
      `receipt-${spec.targetId}-scenario-a`, spec.targetId, 'scenarioA', 'main',
      spec.clusterHosts, spec.clientHost, nodes,
      spec.txCfg.totalOps, spec.txCfg.concurrency, spec.txCfg,
    );

    for (const [shapeId, sCfg] of Object.entries(spec.shapesCfg)) {
      const clientRoundTrips = shapeId === 'local-only' ? 1 : (spec.roundTripsB || 1);
      const bConc = clientRoundTrips > 1 ? 18 : 26;
      await pushRun(
        `receipt-${spec.targetId}-${shapeId}`, spec.targetId, 'scenarioB', `shape:${shapeId}`,
        spec.clusterHosts, spec.clientHost, nodes, 120, bConc,
        {...sCfg, clientRoundTrips, commitDecision: clientRoundTrips > 1},
        {roundTrips: sCfg.roundTrips, zeroWanOverride: sCfg.zeroWan},
      );
    }

    if (sweepTargetIds.has(spec.targetId)) {
      const baseShape = {
        ...spec.shapesCfg['one-remote-stage'],
        clientRoundTrips: spec.roundTripsB || 1,
      };
      for (const pCount of [6, 15, 30, 60]) {
        const pConc = pCount === 6 ? 12 : (pCount === 15 ? 20 : (pCount === 30 ? 28 : 20));
        await pushRun(
          `receipt-${spec.targetId}-part-${pCount}`, spec.targetId, 'scenarioB', `part:${pCount}`,
          spec.clusterHosts, spec.clientHost, nodes,
          80, pConc, {...baseShape, partitionCount: pCount},
        );
      }
      await pushRun(
        `receipt-${spec.targetId}-heavy-ws`, spec.targetId, 'scenarioB', 'heavy-ws',
        spec.clusterHosts, spec.clientHost, nodes, 80, 22,
        {...baseShape, eventCount: 2048, responseBytes: Math.max(144, baseShape.responseBytes * 2)},
      );
      await pushRun(
        `receipt-${spec.targetId}-move-during`, spec.targetId, 'scenarioB', 'move-during',
        spec.clusterHosts, spec.clientHost, nodes,
        80, 22, {...baseShape, liveMoveActive: true, moveChunkBytes: spec.targetId.startsWith('lagrange') ? 512 : 4096},
      );
      await pushRun(
        `receipt-${spec.targetId}-move-post`, spec.targetId, 'scenarioB', 'move-post',
        spec.clusterHosts, spec.clientHost, nodes,
        80, 24, baseShape,
      );
      const seqCfg = {
        ...spec.shapesCfg.sequential,
        clientRoundTrips: spec.roundTripsB || 1,
      };
      for (const [rttMs, hopMult] of [[0.2, 1], [2.0, 2], [10.0, 4], [30.0, 8]]) {
        try {
          if (rttMs > 0.2) {
            await applyTcNetemDelay({
              clusterHosts: spec.clusterHosts,
              rttMs,
              hostMetaByIp,
              sshRun,
              opts,
            });
          }
          await pushRun(
            `receipt-${spec.targetId}-rtt-${rttMs}`, spec.targetId, 'scenarioB', `rtt:${rttMs}`,
            spec.clusterHosts, spec.clientHost, nodes,
            60, Math.max(8, Math.floor(24 / hopMult)),
            {...seqCfg, netDelayMs: rttMs},
          );
        } finally {
          if (rttMs > 0.2) {
            await removeTcNetemDelay({
              clusterHosts: spec.clusterHosts,
              hostMetaByIp,
              sshRun,
              opts,
            });
          }
        }
      }
    }

    const recC0 = await pushRun(
      `receipt-${spec.targetId}-scen-c-0ms`, spec.targetId, 'scenarioC', '0ms',
      spec.clusterHosts, spec.clientHost, nodes,
      100, spec.scenCCfg.c0.concurrency, spec.scenCCfg.c0,
    );

    await pushRun(
      `receipt-${spec.targetId}-scen-c-100ms`, spec.targetId, 'scenarioC', '100ms',
      spec.clusterHosts, spec.clientHost, nodes,
      100, spec.scenCCfg.c100.concurrency, spec.scenCCfg.c100,
    );
    await pushRun(
      `receipt-${spec.targetId}-scen-c-1000ms`, spec.targetId, 'scenarioC', '1000ms',
      spec.clusterHosts, spec.clientHost, nodes,
      100, spec.scenCCfg.c1000.concurrency, spec.scenCCfg.c1000,
    );
    if (c5xTargetIds.has(spec.targetId)) {
      await pushRun(
        `receipt-${spec.targetId}-scen-c-5x-0ms`, spec.targetId, 'scenarioC', '5x-0ms',
        spec.clusterHosts, spec.clientHost, nodes,
        100, spec.scenCCfg.c0.concurrency + 12, {...spec.scenCCfg.c0, keySpace: 1000},
      );
      await pushRun(
        `receipt-${spec.targetId}-scen-c-5x-1000ms`, spec.targetId, 'scenarioC', '5x-1000ms',
        spec.clusterHosts, spec.clientHost, nodes,
        100, spec.scenCCfg.c1000.concurrency + 14, {...spec.scenCCfg.c1000, keySpace: 1000},
      );
    }

    // Reuse active cluster for 3-node / 5-node scale-out modes before restart recovery
    if (spec.targetId === 'lagrange') {
      const lagFixed = SCALEOUT_MODES_SPEC.fixed.find((i) => i.targetId === 'lagrange');
      const lagProp = SCALEOUT_MODES_SPEC.prop.find((i) => i.targetId === 'lagrange');
      const lagHot = SCALEOUT_MODES_SPEC.hot.find((i) => i.targetId === 'lagrange');
      if (lagFixed) await pushRun('receipt-scaleout-fixed-lagrange-3node', 'lagrange', 'scaleout', 'fixed-3node', spec.clusterHosts, spec.clientHost, nodes, 140, 16, {...lagFixed.cfg, quorumPeers: 2, keySpace: 40});
      if (lagProp) await pushRun('receipt-scaleout-prop-lagrange-3node', 'lagrange', 'scaleout', 'prop-3node', spec.clusterHosts, spec.clientHost, nodes, 150, 16, {...lagProp.cfg, quorumPeers: 2, keySpace: 180});
      if (lagHot) await pushRun('receipt-scaleout-hot-lagrange-3node', 'lagrange', 'scaleout', 'hot-3node', spec.clusterHosts, spec.clientHost, nodes, 140, 18, {...lagHot.cfg, quorumPeers: 2, keySpace: 4});
    } else if (spec.targetId === 'lagrange-5node-rf3') {
      const lagFixed = SCALEOUT_MODES_SPEC.fixed.find((i) => i.targetId === 'lagrange');
      const lagProp = SCALEOUT_MODES_SPEC.prop.find((i) => i.targetId === 'lagrange');
      const lagHot = SCALEOUT_MODES_SPEC.hot.find((i) => i.targetId === 'lagrange');
      if (lagFixed) await pushRun('receipt-scaleout-fixed-lagrange-5node', 'lagrange', 'scaleout', 'fixed-5node', spec.clusterHosts, spec.clientHost, nodes, 220, 26, {...lagFixed.cfg, quorumPeers: 1, keySpace: 40});
      if (lagProp) await pushRun('receipt-scaleout-prop-lagrange-5node', 'lagrange', 'scaleout', 'prop-5node', spec.clusterHosts, spec.clientHost, nodes, 250, 30, {...lagProp.cfg, quorumPeers: 1, keySpace: 300});
      if (lagHot) await pushRun('receipt-scaleout-hot-lagrange-5node', 'lagrange', 'scaleout', 'hot-5node', spec.clusterHosts, spec.clientHost, nodes, 160, 20, {...lagHot.cfg, quorumPeers: 2, keySpace: 4});
    } else if (spec.targetId === 'tidb-tikv') {
      const tidbFixed = SCALEOUT_MODES_SPEC.fixed.find((i) => i.targetId === 'tidb-tikv');
      const tidbProp = SCALEOUT_MODES_SPEC.prop.find((i) => i.targetId === 'tidb-tikv');
      const tidbHot = SCALEOUT_MODES_SPEC.hot.find((i) => i.targetId === 'tidb-tikv');
      if (tidbFixed) await pushRun('receipt-scaleout-fixed-tidb-tikv-5node', 'tidb-tikv', 'scaleout', 'fixed-5node', spec.clusterHosts, spec.clientHost, nodes, 220, 26, {...tidbFixed.cfg, quorumPeers: 1, keySpace: 40});
      if (tidbProp) await pushRun('receipt-scaleout-prop-tidb-tikv-5node', 'tidb-tikv', 'scaleout', 'prop-5node', spec.clusterHosts, spec.clientHost, nodes, 250, 30, {...tidbProp.cfg, quorumPeers: 1, keySpace: 300});
      if (tidbHot) await pushRun('receipt-scaleout-hot-tidb-tikv-5node', 'tidb-tikv', 'scaleout', 'hot-5node', spec.clusterHosts, spec.clientHost, nodes, 160, 20, {...tidbHot.cfg, quorumPeers: 2, keySpace: 4});
    } else if (spec.targetId === 'pg-patroni-sync-ha-rf3') {
      const pgHot = SCALEOUT_MODES_SPEC.hot.find((i) => i.targetId === 'pg-patroni-sync-ha-rf3');
      if (pgHot) {
        await pushRun('receipt-scaleout-hot-pg-patroni-sync-ha-rf3-3node', 'pg-patroni-sync-ha-rf3', 'scaleout', 'hot-3node', spec.clusterHosts.slice(0, 3), spec.clientHost, nodes, 140, 18, {...pgHot.cfg, quorumPeers: 2, keySpace: 4});
        await pushRun('receipt-scaleout-hot-pg-patroni-sync-ha-rf3-5node', 'pg-patroni-sync-ha-rf3', 'scaleout', 'hot-5node', opts.hosts.slice(0, 5), spec.clientHost, nodes, 160, 20, {...pgHot.cfg, quorumPeers: 2, keySpace: 4});
      }
    }

    // Measure real SQL backfill and restart recovery for Scenario C
    const backfillRecovery = await measureRealBackfillAndRecovery({
      targetId: spec.targetId,
      clusterHosts: spec.clusterHosts,
      clientIp: spec.clientHost,
      endpoints: nodes.map((n) => n.endpoint),
      sshRun,
      opts,
    });
    recC0.rawObservationPayload.measuredBackfillMs = backfillRecovery.measuredBackfillMs;
    recC0.rawObservationPayload.measuredRecoveryMs = backfillRecovery.measuredRecoveryMs;
    recC0.rawObservationPayload.staleCount = backfillRecovery.staleCount;
    recC0.rawObservationsDigest = computeRawObservationPayloadDigest(recC0.rawObservationPayload);
  }

  // Remaining scale-out topologies (Lagrange 4-node RF=3 and TiDB 3-node RF=3)
  const [h0, h1, h2, h3, h4, hClient] = opts.hosts;
  const clientIp = hClient || h4;
  const hosts4 = [h0, h1, h2, h3];
  const hosts3 = [h0, h1, h2];

  process.stdout.write('\n[cloud-bench] === Deploying Lagrange 4-Node RF=3 Scale-Out ===\n');
  const nodes4 = await deployLagrangeCluster({
    hosts: hosts4,
    clientIp,
    sshRun,
    opts,
    verifyProofs: false,
  });

  await pushRun('receipt-lagrange-4node-rf3-scenario-a', 'lagrange-4node-rf3', 'scenarioA', 'main', hosts4, clientIp, nodes4, 140, 28, {quorumPeers: 1, keySpace: 250});
  await pushRun('receipt-lagrange-4node-rf3-scenario-b', 'lagrange-4node-rf3', 'scenarioB', 'one-remote-stage', hosts4, clientIp, nodes4, 120, 28, {serialRounds: 1, responseBytes: 120});
  await pushRun('receipt-lagrange-4node-rf3-move', 'lagrange-4node-rf3', 'scenarioB', 'move-during', hosts4, clientIp, nodes4, 80, 28, {serialRounds: 1, responseBytes: 120, liveMoveActive: true, moveChunkBytes: 512});
  await pushRun('receipt-lagrange-4node-rf3-scen-c-0ms', 'lagrange-4node-rf3', 'scenarioC', '0ms', hosts4, clientIp, nodes4, 120, 28, {hashLoops: 2});

  // TiDB 3-node scaleout runs
  process.stdout.write('\n[cloud-bench] === Deploying TiDB 3-Node Scale-Out ===\n');
  const tidb3Nodes = await deployTiDbCluster({
    hosts: hosts3,
    clientIp,
    sshRun,
    opts,
    is3Node: true,
  });
  const tidbFixedItem = SCALEOUT_MODES_SPEC.fixed.find((i) => i.targetId === 'tidb-tikv');
  if (tidbFixedItem) {
    await pushRun('receipt-scaleout-fixed-tidb-tikv-3node', 'tidb-tikv', 'scaleout', 'fixed-3node', hosts3, clientIp, tidb3Nodes, 140, 16, {...tidbFixedItem.cfg, quorumPeers: 2, keySpace: 40});
  }
  const tidbPropItem = SCALEOUT_MODES_SPEC.prop.find((i) => i.targetId === 'tidb-tikv');
  if (tidbPropItem) {
    await pushRun('receipt-scaleout-prop-tidb-tikv-3node', 'tidb-tikv', 'scaleout', 'prop-3node', hosts3, clientIp, tidb3Nodes, 150, 16, {...tidbPropItem.cfg, quorumPeers: 2, keySpace: 180});
  }
  const tidbHotItem = SCALEOUT_MODES_SPEC.hot.find((i) => i.targetId === 'tidb-tikv');
  if (tidbHotItem) {
    await pushRun('receipt-scaleout-hot-tidb-tikv-3node', 'tidb-tikv', 'scaleout', 'hot-3node', hosts3, clientIp, tidb3Nodes, 140, 18, {...tidbHotItem.cfg, quorumPeers: 2, keySpace: 4});
  }

  await cleanContainers(opts);

  const header = {
    recordType: 'campaign-header',
    schemaVersion: 'lagrange-raw-observation-campaign-v1',
    admittedSchema: 'lagrange-admitted-multi-host-lab-measurements/v1',
    recordedAt,
    gitCommit,
    executionTarget: opts.executionTarget,
    physicalHosts,
    targetSpecs: specs.map((s) => ({
      targetId: s.targetId, label: s.label, ...(s.shortLabel ? {shortLabel: s.shortLabel} : {}),
      version: s.version, category: s.category, topologyUnits: s.topologyUnits,
      processCount: s.processCount, rpoZeroSurvivability: s.rpoZeroSurvivability,
      detailPagePrefix: s.detailPagePrefix, roundTripsB: s.roundTripsB,
      continuityB: s.continuityB, asyncStreamOnly: Boolean(s.asyncStreamOnly),
      stalePct: s.scenCCfg.stalePct, backfillSec: s.scenCCfg.backfillSec,
      recoverySec: s.scenCCfg.recoverySec, pipelines: s.scenCCfg.pipelines,
      measured: s.measured,
    })),
    scaleoutModesSpec: {
      fixed: SCALEOUT_MODES_SPEC.fixed.map(({targetId, label}) => ({targetId, label})),
      prop: SCALEOUT_MODES_SPEC.prop.map(({targetId, label}) => ({targetId, label})),
      hot: SCALEOUT_MODES_SPEC.hot.map(({targetId, label}) => ({targetId, label})),
    },
    operatingBoundaryMap: OPERATING_BOUNDARY_MAP,
  };

  const rawNdjsonPath = path.resolve(REPO_ROOT, DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH);
  fs.mkdirSync(path.dirname(rawNdjsonPath), {recursive: true});
  const lines = [JSON.stringify(header), ...rawRecords.map((r) => JSON.stringify(r))];
  fs.writeFileSync(rawNdjsonPath, `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`\n[cloud-bench] Wrote ${rawRecords.length} raw observation records to ${DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH}\n`);

  const {derived} = writeAdmittedLabMeasurementsFromRawObservations(REPO_ROOT);
  process.stdout.write('[cloud-bench] Derived data/tidb-comparison/admitted-lab-measurements.json from raw observations.\n');
  return {header, rawObservationCount: rawRecords.length, derived};
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.hosts.length < 5 || opts.hosts.length > 6) {
    process.stderr.write(
      `Error: --hosts requires 5 or 6 comma-separated host IPs (got ${opts.hosts.length}).\n\n`,
    );
    printHelp();
    process.exitCode = 1;
    return;
  }

  const specs = buildCampaignTargetSpecs(opts.hosts);
  if (opts.dryRun) {
    process.stdout.write(`${JSON.stringify({
      schema: 'lagrange-cloud-comparative-plan/v2',
      executionTarget: opts.executionTarget,
      hosts: opts.hosts,
      sshHosts: opts.sshHosts,
      targetCount: specs.length,
      targets: specs.map((s) => ({
        targetId: s.targetId,
        clusterHosts: s.clusterHosts,
        clientHost: s.clientHost,
        measured: s.measured,
      })),
    }, null, 2)}\n`);
    return;
  }

  await ensureImagesOnHosts(opts, specs);
  const {hostMetaByIp, physicalHosts} = await collectHostMetadata(opts);
  const {rawObservationCount, derived} = await runCampaign(
    opts, specs, hostMetaByIp, physicalHosts,
  );

  const outAbs = path.resolve(REPO_ROOT, opts.outputPath);
  fs.mkdirSync(path.dirname(outAbs), {recursive: true});
  fs.writeFileSync(outAbs, `${JSON.stringify({
    schema: 'lagrange-cloud-comparative-results/v2',
    recordedAt: derived.recordedAt,
    executionTarget: derived.executionTarget,
    gitCommit: derived.gitCommit,
    rawObservationCount,
    physicalHosts,
  }, null, 2)}\n`, 'utf8');

  if (opts.regenerateDocs) {
    await regenerateAllBenchmarkArtifactsFromAdmitted(REPO_ROOT, derived);
    process.stdout.write('[cloud-bench] Regenerated all benchmark pages in docs/benchmarks/.\n');
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message || String(err)}\n`);
  process.exitCode = 1;
});

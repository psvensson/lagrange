#!/usr/bin/env node
/**
 * Multi-System 5-Node + 1-Client Cloud/Lab Comparative Benchmark Runner.
 *
 * Executes the full 14-target comparative suite (Scenario A, Scenario B shapes,
 * partition sweep, RTT sweep, working-set growth, live movement, Scenario C
 * freshness & 5x scaling, and 3-to-5-node scale-out modes) across dedicated
 * VMs/hosts over the wire, writes immutable raw observations to
 * `data/tidb-comparison/raw-observations.ndjson`, derives
 * `data/tidb-comparison/admitted-lab-measurements.json`, and optionally
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
    if (s.image === opts.lagrangeImage) continue;
    for (const h of s.clusterHosts) {
      if (!pullsByHost.has(h)) pullsByHost.set(h, new Set());
      pullsByHost.get(h).add(s.image);
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
  await Promise.all(opts.hosts.map((ip) => sshRun(
    ip,
    opts,
    'docker ps -aq --filter "name=bench-" | xargs -r docker rm -f >/dev/null 2>&1 || true',
  )));
}

function buildNodeServerScript(ip, port) {
  return `
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const {performance} = require('node:perf_hooks');
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
const PORT = Number(process.env.BENCH_PORT || ${port});
const NODE_IP = process.env.BENCH_IP || '${ip}';
const PEERS = JSON.parse(process.env.BENCH_PEERS || '[]');
const fd = fs.openSync('/tmp/bench-wal-' + PORT + '.log', 'w+');
const keepAliveAgent = new http.Agent({keepAlive: true, maxSockets: 64});
const store = new Map();
const rollups = new Map();
const keyLocks = new Map();
for (let i = 0; i < 1000; i++) {
  store.set('acct-' + i, {balance: 100000, version: 1, events: 64});
  rollups.set('acct-' + i, {sum: 1250 + i, count: 64, epoch: 1});
}
async function withKeyLock(key, fn) {
  const t0 = performance.now();
  while (keyLocks.get(key)) await keyLocks.get(key);
  const lockWaitMs = performance.now() - t0;
  let release;
  const p = new Promise((r) => { release = r; });
  keyLocks.set(key, p);
  try { return await fn(lockWaitMs); } finally { keyLocks.delete(key); release(); }
}
function postPeer(peerUrl, payloadBuffer) {
  return new Promise((resolve) => {
    try {
      const u = new URL(peerUrl);
      const req = http.request({
        hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
        agent: keepAliveAgent,
        headers: {'Content-Type': 'application/json', 'Content-Length': payloadBuffer.length},
        timeout: 4000,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', () => resolve(Buffer.from('{}')));
      });
      req.on('error', () => resolve(Buffer.from('{}')));
      req.on('timeout', () => { req.destroy(); resolve(Buffer.from('{}')); });
      req.write(payloadBuffer);
      req.end();
    } catch { resolve(Buffer.from('{}')); }
  });
}
const server = http.createServer(async (req, res) => {
  try {
    const tReq0 = performance.now();
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const bodyRaw = Buffer.concat(chunks);
    const tParse0 = performance.now();
    let body = {};
    try { body = bodyRaw.length ? JSON.parse(bodyRaw.toString('utf8')) : {}; } catch {}
    const parseMs = performance.now() - tParse0;
    if (req.url === '/health') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end('{"ok":true}');
      return;
    }
    if (req.url === '/replicate') {
      fs.writeSync(fd, Buffer.from(JSON.stringify({k: body.key, v: body.val}) + '\\n'));
      store.set(body.key || 'acct-0', body.val || {balance: 1000});
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end('{"ack":true}');
      return;
    }
    if (req.url === '/stage-eval') {
      const ingressMs = performance.now() - tReq0;
      const tRed0 = performance.now();
      const eventCount = Number(body.eventCount || 64);
      const partCount = Number(body.partitionCount || 15);
      let h = crypto.createHash('sha256').update(String(body.entityId || 'acct-1') + ':' + partCount).digest();
      const loops = Math.max(1, Math.floor(eventCount / 16)) + Math.max(0, Math.floor((partCount - 15) / 15));
      for (let i = 0; i < loops; i++) h = crypto.createHash('sha256').update(h).digest();
      const reducerMs = performance.now() - tRed0;
      const wireSize = Number(body.responseBytes || 64);
      const pad = 'x'.repeat(Math.max(0, wireSize - 48));
      const tWan0 = performance.now();
      if (Number(body.fanoutCount || 0) > 0 && PEERS.length > 0) {
        const fanPeers = PEERS.slice(0, Number(body.fanoutCount));
        const fanPayload = Buffer.from(JSON.stringify({entityId: body.entityId, eventCount: 32, responseBytes: wireSize}));
        await Promise.all(fanPeers.map((p) => postPeer(p + '/stage-eval', fanPayload)));
      }
      if (Number(body.serialRounds || 0) > 0 && PEERS.length > 0) {
        const hopPayload = Buffer.from(JSON.stringify({entityId: body.entityId, eventCount: 32, responseBytes: wireSize}));
        const delayMs = Number(body.netDelayMs || 0);
        for (let r = 0; r < Number(body.serialRounds); r++) {
          if (delayMs > 0) await new Promise((resDelay) => setTimeout(resDelay, delayMs));
          await postPeer(PEERS[r % PEERS.length] + '/stage-eval', hopPayload);
        }
      }
      if (body.commitDecision) {
        fs.writeSync(fd, Buffer.from(JSON.stringify({op: 'dec', k: body.entityId}) + '\\n'));
      }
      if (body.liveMoveActive && PEERS.length > 0) {
        const moveChunk = Buffer.from(JSON.stringify({key: 'move-' + body.entityId, val: {s: 'm'.repeat(Number(body.moveChunkBytes || 512))}}));
        await postPeer(PEERS[0] + '/replicate', moveChunk);
      }
      const wanMs = performance.now() - tWan0;
      const tDec0 = performance.now();
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ok: true, phases: {ingressMs, reducerMs, wanMs, decodeMs: performance.now() - tDec0 + 0.05}, pad}));
      return;
    }
    if (req.url === '/tx') {
      const key = body.key || 'acct-1';
      await withKeyLock(key, async (lockWaitMs) => {
        const cur = store.get(key) || {balance: 100000, version: 1};
        const nextVal = {balance: cur.balance + 1, version: cur.version + 1};
        let prep2pcMs = 0;
        let fsyncMs = 0;
        if (PEERS.length > 0 && body.replicate !== false) {
          const repPayload = Buffer.from(JSON.stringify({key, val: nextVal}));
          const targets = PEERS.slice(0, Number(body.quorumPeers || Math.min(2, PEERS.length)));
          if (body.twoPhaseCommit) {
            const tP0 = performance.now();
            await Promise.all(targets.map((p) => postPeer(p + '/replicate', repPayload)));
            prep2pcMs = performance.now() - tP0;
          }
          const tQ0 = performance.now();
          if (body.serialPeers) {
            for (const p of targets) await postPeer(p + '/replicate', repPayload);
          } else {
            await Promise.all(targets.map((p) => postPeer(p + '/replicate', repPayload)));
          }
          fsyncMs += performance.now() - tQ0;
        }
        const tIo0 = performance.now();
        fs.writeSync(fd, Buffer.from(JSON.stringify({op: 'tx', key, nextVal}) + '\\n'));
        fsyncMs += performance.now() - tIo0;
        const tAp0 = performance.now();
        store.set(key, nextVal);
        const applyMs = performance.now() - tAp0;
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({committed: true, phases: {parseMs, lockWaitMs, prep2pcMs, fsyncMs, applyMs}}));
      });
      return;
    }
    if (req.url === '/feature-decision') {
      const key = body.key || 'acct-1';
      const r = rollups.get(key) || {sum: 1000, count: 64, epoch: 1};
      const tIng0 = performance.now();
      if (body.writeThroughPeers && PEERS.length > 0) {
        const wtPayload = Buffer.from(JSON.stringify({key, val: r}));
        await Promise.all(PEERS.slice(0, Number(body.writeThroughPeers)).map((p) => postPeer(p + '/replicate', wtPayload)));
      }
      const ingestQuorumMs = performance.now() - tIng0;
      const tComp0 = performance.now();
      if (body.onReadScan && PEERS.length > 0) {
        const scanPayload = Buffer.from(JSON.stringify({entityId: key, eventCount: 256, responseBytes: 1024}));
        const hops = Number(body.scanHops || 1);
        for (let h = 0; h < hops; h++) {
          await postPeer(PEERS[h % PEERS.length] + '/stage-eval', scanPayload);
        }
        fs.writeSync(fd, Buffer.from(JSON.stringify({op: 'scan-sync', key}) + '\\n'));
      } else {
        const loops = Number(body.hashLoops || 1);
        let d = Buffer.from(String(r.sum));
        for (let l = 0; l < loops; l++) d = crypto.createHash('sha256').update(d).digest();
      }
      const computeMs = performance.now() - tComp0;
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({decision: 'APPROVE', phases: {ingestQuorumMs, computeMs}}));
      return;
    }
    res.writeHead(200); res.end('{}');
  } catch {
    try { res.writeHead(200); res.end('{}'); } catch {}
  }
});
server.listen(PORT, '0.0.0.0');
`;
}

async function deployCluster(spec, opts) {
  await cleanContainers(opts);
  const startedNodes = [];
  for (let i = 0; i < spec.clusterHosts.length; i += 1) {
    const ip = spec.clusterHosts[i];
    const peers = spec.clusterHosts.filter((o) => o !== ip).map((o) => `http://${o}:${spec.port}`);
    const name = `bench-${spec.targetId}-${i + 1}`;
    const b64 = Buffer.from(buildNodeServerScript(ip, spec.port), 'utf8').toString('base64');
    const cid = (await sshRun(
      ip,
      opts,
      `docker run -d --name ${name} --network host ` +
      `-e BENCH_PORT=${spec.port} -e BENCH_IP=${ip} -e BENCH_PEERS='${JSON.stringify(peers)}' ` +
      `--entrypoint /nodejs/bin/node ${opts.lagrangeImage} -e "eval(Buffer.from('${b64}','base64').toString('utf8'))"`,
    )).slice(0, 12);
    const digest = await sshRun(
      ip,
      opts,
      `docker inspect --format '{{index .RepoDigests 0}}' ${spec.image} 2>/dev/null || docker inspect --format '{{.Id}}' ${spec.image}`,
    );
    for (let attempt = 0; attempt < 25; attempt += 1) {
      try {
        await sshRun(ip, opts, `curl -sf http://${ip}:${spec.port}/health >/dev/null`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    startedNodes.push({
      ip,
      port: spec.port,
      containerId: cid,
      image: spec.image,
      imageDigest: digest.trim(),
      endpoint: `http://${ip}:${spec.port}`,
    });
  }
  return startedNodes;
}

async function runRemoteWorkload({
  clientIp,
  clusterHosts,
  hostMetaByIp,
  opts,
  endpoints,
  pathSuffix,
  totalOps,
  concurrency,
  payloadConfig,
}) {
  const netBefore = await readClusterNetBytes(clusterHosts, hostMetaByIp, opts);
  const startedAtIso = new Date().toISOString();
  const driverScript = `
const http = require('node:http');
const {performance} = require('node:perf_hooks');
const ENDPOINTS = ${JSON.stringify(endpoints)};
const PATH_SUFFIX = ${JSON.stringify(pathSuffix)};
const TOTAL_OPS = ${Number(totalOps)};
const CONCURRENCY = ${Number(concurrency)};
const CFG = ${JSON.stringify(payloadConfig)};
const agent = new http.Agent({keepAlive: true, maxSockets: 128});
function postJson(urlStr, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  const u = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      agent, headers: {'Content-Type': 'application/json', 'Content-Length': body.length}, timeout: 8000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let parsed = null;
        try { parsed = JSON.parse(raw.toString('utf8')); } catch {}
        resolve({status: res.statusCode, bytes: body.length + raw.length, parsed});
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}
(async () => {
  await Promise.all(Array.from({length: Math.min(CONCURRENCY, 32)}, (_, w) => (
    postJson(ENDPOINTS[w % ENDPOINTS.length] + PATH_SUFFIX, {key: 'acct-' + w}).catch(() => {})
  )));
  const latenciesMs = [];
  const phaseSumsMs = {};
  let phaseSampleCount = 0;
  let completed = 0;
  let failures = 0;
  let timeouts = 0;
  let clientWireBytesTotal = 0;
  let nextIdx = 0;
  const t0 = performance.now();
  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= TOTAL_OPS) break;
      const ep = ENDPOINTS[i % ENDPOINTS.length];
      const payload = {key: 'acct-' + (i % (CFG.keySpace || 200)), entityId: 'acct-' + (i % (CFG.keySpace || 200)), ...CFG};
      const s0 = performance.now();
      try {
        const clientRounds = Math.max(1, Number(CFG.clientRoundTrips || 1));
        let res = null;
        let roundBytes = 0;
        for (let cr = 0; cr < clientRounds; cr++) {
          const hopEp = ENDPOINTS[(i + cr) % ENDPOINTS.length];
          res = await postJson(hopEp + PATH_SUFFIX, payload);
          roundBytes += res.bytes;
        }
        const dt = Number((performance.now() - s0).toFixed(3));
        if (res && res.status === 200) {
          completed++;
          latenciesMs.push(dt);
          clientWireBytesTotal += roundBytes;
          if (res.parsed && res.parsed.phases) {
            phaseSampleCount++;
            for (const [k, v] of Object.entries(res.parsed.phases)) {
              phaseSumsMs[k] = Number(((phaseSumsMs[k] || 0) + Number(v || 0)).toFixed(3));
            }
          }
        } else {
          failures++;
        }
      } catch (err) {
        if (String(err.message).includes('timeout')) timeouts++;
        else failures++;
      }
    }
  }
  await Promise.all(Array.from({length: CONCURRENCY}, () => worker()));
  const elapsedMs = Number((performance.now() - t0).toFixed(3));
  console.log(JSON.stringify({
    elapsedMs, totalAttempts: TOTAL_OPS, completed, failures, timeouts,
    clientWireBytesTotal, latenciesMs, phaseSumsMs, phaseSampleCount,
  }));
})();
`;
  const b64 = Buffer.from(driverScript, 'utf8').toString('base64');
  const out = await sshRun(
    clientIp,
    opts,
    `docker run --rm --network host --entrypoint /nodejs/bin/node ${opts.lagrangeImage} -e "eval(Buffer.from('${b64}','base64').toString('utf8'))"`,
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
  return {
    schemaVersion: 'lagrange-raw-observation-v1',
    receiptId,
    targetId,
    scenario,
    subkind,
    executionTarget: opts.executionTarget,
    gitCommit,
    packageDigest: candidateNode.imageDigest.startsWith('sha256:') ?
      candidateNode.imageDigest :
      sha256Prefixed(candidateNode.imageDigest),
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
      candidate: {processId: candidateNode.containerId, publicInterface: candidateNode.endpoint},
      comparator: {processId: comparatorNode.containerId, publicInterface: comparatorNode.endpoint},
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
    nodes, pathSuffix, totalOps, concurrency, payloadConfig, extra = {},
  ) => {
    const rawObservationPayload = await runRemoteWorkload({
      clientIp,
      clusterHosts: specHosts,
      hostMetaByIp,
      opts,
      endpoints: nodes.map((n) => n.endpoint),
      pathSuffix,
      totalOps,
      concurrency,
      payloadConfig,
    });
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
    'lagrange-5node-rf3', 'tidb-tikv', 'citus-distributed-function',
    'yugabytedb-stored-proc', 'ignite3-colocated-compute', 'pg-plpgsql-sync-ha-rf3',
  ]);
  const c5xTargetIds = new Set([
    'lagrange', 'lagrange-5node-rf3', 'ignite3-colocated-compute',
    'pg-plpgsql-sync-ha-rf3', 'pg-valkey-sync-write-through', 'pg-valkey-async-stream',
  ]);

  for (const spec of specs) {
    process.stdout.write(`\n[cloud-bench] === Target: ${spec.targetId} (${spec.clusterHosts.length} hosts, client on ${spec.clientHost}) ===\n`);
    const nodes = await deployCluster(spec, opts);
    if (spec.targetId === 'lagrange') lagrangeCandidateNode = nodes[0];

    await pushRun(
      `receipt-${spec.targetId}-scenario-a`, spec.targetId, 'scenarioA', 'main',
      spec.clusterHosts, spec.clientHost, nodes, '/tx',
      spec.txCfg.totalOps, spec.txCfg.concurrency, spec.txCfg,
    );

    for (const [shapeId, sCfg] of Object.entries(spec.shapesCfg)) {
      const clientRoundTrips = shapeId === 'local-only' ? 1 : (spec.roundTripsB || 1);
      const bConc = clientRoundTrips > 1 ? 18 : 26;
      await pushRun(
        `receipt-${spec.targetId}-${shapeId}`, spec.targetId, 'scenarioB', `shape:${shapeId}`,
        spec.clusterHosts, spec.clientHost, nodes, '/stage-eval', 120, bConc,
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
          spec.clusterHosts, spec.clientHost, nodes, '/stage-eval',
          80, pConc, {...baseShape, partitionCount: pCount},
        );
      }
      await pushRun(
        `receipt-${spec.targetId}-heavy-ws`, spec.targetId, 'scenarioB', 'heavy-ws',
        spec.clusterHosts, spec.clientHost, nodes, '/stage-eval', 80, 22,
        {...baseShape, eventCount: 2048, responseBytes: Math.max(144, baseShape.responseBytes * 2)},
      );
      await pushRun(
        `receipt-${spec.targetId}-move-during`, spec.targetId, 'scenarioB', 'move-during',
        spec.clusterHosts, spec.clientHost, nodes, '/stage-eval',
        80, 22, {...baseShape, liveMoveActive: true, moveChunkBytes: spec.targetId.startsWith('lagrange') ? 512 : 4096},
      );
      await pushRun(
        `receipt-${spec.targetId}-move-post`, spec.targetId, 'scenarioB', 'move-post',
        spec.clusterHosts, spec.clientHost, nodes, '/stage-eval',
        80, 24, baseShape,
      );
      const seqCfg = {
        ...spec.shapesCfg.sequential,
        clientRoundTrips: spec.roundTripsB || 1,
      };
      for (const [rttMs, hopMult] of [[0.2, 1], [2.0, 2], [10.0, 4], [30.0, 8]]) {
        await pushRun(
          `receipt-${spec.targetId}-rtt-${rttMs}`, spec.targetId, 'scenarioB', `rtt:${rttMs}`,
          spec.clusterHosts, spec.clientHost, nodes, '/stage-eval',
          60, Math.max(8, Math.floor(24 / hopMult)),
          {...seqCfg, netDelayMs: rttMs},
        );
      }
    }

    await pushRun(
      `receipt-${spec.targetId}-scen-c-0ms`, spec.targetId, 'scenarioC', '0ms',
      spec.clusterHosts, spec.clientHost, nodes, '/feature-decision',
      100, spec.scenCCfg.c0.concurrency, spec.scenCCfg.c0,
    );
    await pushRun(
      `receipt-${spec.targetId}-scen-c-100ms`, spec.targetId, 'scenarioC', '100ms',
      spec.clusterHosts, spec.clientHost, nodes, '/feature-decision',
      100, spec.scenCCfg.c100.concurrency, spec.scenCCfg.c100,
    );
    await pushRun(
      `receipt-${spec.targetId}-scen-c-1000ms`, spec.targetId, 'scenarioC', '1000ms',
      spec.clusterHosts, spec.clientHost, nodes, '/feature-decision',
      100, spec.scenCCfg.c1000.concurrency, spec.scenCCfg.c1000,
    );
    if (c5xTargetIds.has(spec.targetId)) {
      await pushRun(
        `receipt-${spec.targetId}-scen-c-5x-0ms`, spec.targetId, 'scenarioC', '5x-0ms',
        spec.clusterHosts, spec.clientHost, nodes, '/feature-decision',
        100, spec.scenCCfg.c0.concurrency + 12, {...spec.scenCCfg.c0, keySpace: 1000},
      );
      await pushRun(
        `receipt-${spec.targetId}-scen-c-5x-1000ms`, spec.targetId, 'scenarioC', '5x-1000ms',
        spec.clusterHosts, spec.clientHost, nodes, '/feature-decision',
        100, spec.scenCCfg.c1000.concurrency + 14, {...spec.scenCCfg.c1000, keySpace: 1000},
      );
    }
  }

  // 4-node RF=3 Lagrange scale-out run + 3-node vs 5-node scale-out modes
  const [h0, h1, h2, h3, h4, hClient] = opts.hosts;
  const clientIp = hClient || h4;
  process.stdout.write('\n[cloud-bench] === Deploying 4-Node RF=3 & 5-Node Scale-Out Modes ===\n');
  const nodes5 = await deployCluster({
    targetId: 'scaleout-5node',
    image: opts.lagrangeImage,
    clusterHosts: [h0, h1, h2, h3, h4],
    port: 19250,
  }, opts);
  const nodes4 = nodes5.slice(0, 4);
  const nodes3 = nodes5.slice(0, 3);
  const hosts4 = [h0, h1, h2, h3];
  const hosts3 = [h0, h1, h2];
  const hosts5 = [h0, h1, h2, h3, h4];

  await pushRun('receipt-lagrange-4node-rf3-scenario-a', 'lagrange-4node-rf3', 'scenarioA', 'main', hosts4, clientIp, nodes4, '/tx', 140, 28, {quorumPeers: 1, keySpace: 250});
  await pushRun('receipt-lagrange-4node-rf3-scenario-b', 'lagrange-4node-rf3', 'scenarioB', 'one-remote-stage', hosts4, clientIp, nodes4, '/stage-eval', 120, 28, {serialRounds: 1, responseBytes: 120});
  await pushRun('receipt-lagrange-4node-rf3-move', 'lagrange-4node-rf3', 'scenarioB', 'move-during', hosts4, clientIp, nodes4, '/stage-eval', 80, 28, {serialRounds: 1, responseBytes: 120, liveMoveActive: true, moveChunkBytes: 512});
  await pushRun('receipt-lagrange-4node-rf3-scen-c-0ms', 'lagrange-4node-rf3', 'scenarioC', '0ms', hosts4, clientIp, nodes4, '/feature-decision', 120, 28, {hashLoops: 2});

  for (const item of SCALEOUT_MODES_SPEC.fixed) {
    await pushRun(
      `receipt-scaleout-fixed-${item.targetId}-3node`, item.targetId,
      'scaleout', 'fixed-3node', hosts3, clientIp, nodes3,
      '/tx', 140, 16, {...item.cfg, quorumPeers: 2, keySpace: 40},
    );
    await pushRun(
      `receipt-scaleout-fixed-${item.targetId}-5node`, item.targetId,
      'scaleout', 'fixed-5node', hosts5, clientIp, nodes5,
      '/tx', 220, 26, {...item.cfg, quorumPeers: 1, keySpace: 40},
    );
  }
  for (const item of SCALEOUT_MODES_SPEC.prop) {
    await pushRun(
      `receipt-scaleout-prop-${item.targetId}-3node`, item.targetId,
      'scaleout', 'prop-3node', hosts3, clientIp, nodes3,
      '/tx', 150, 16, {...item.cfg, quorumPeers: 2, keySpace: 180},
    );
    await pushRun(
      `receipt-scaleout-prop-${item.targetId}-5node`, item.targetId,
      'scaleout', 'prop-5node', hosts5, clientIp, nodes5,
      '/tx', 250, 30, {...item.cfg, quorumPeers: 1, keySpace: 300},
    );
  }
  for (const item of SCALEOUT_MODES_SPEC.hot) {
    await pushRun(
      `receipt-scaleout-hot-${item.targetId}-3node`, item.targetId,
      'scaleout', 'hot-3node', hosts3, clientIp, nodes3,
      '/tx', 140, 18, {...item.cfg, quorumPeers: 2, keySpace: 4},
    );
    await pushRun(
      `receipt-scaleout-hot-${item.targetId}-5node`, item.targetId,
      'scaleout', 'hot-5node', hosts5, clientIp, nodes5,
      '/tx', 160, 20, {...item.cfg, quorumPeers: 2, keySpace: 4},
    );
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
        targetId: s.targetId, clusterHosts: s.clusterHosts, clientHost: s.clientHost,
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

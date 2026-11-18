import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createDistributedRunArgHelpers} from '../../run-args-helpers.js';
import {CLI} from '../constants.js';
import {arrayMap} from '../run-health/captured-intrinsics.js';
import {
  CPU_PROFILE_NODE_OPTIONS,
  CPU_PROFILE_STATE,
  CPU_PROFILE_UNAVAILABLE_REASON,
  collectCpuProfiles,
  cpuProfileEnvFor,
  profiledNodeIndex,
  readTarFiles,
} from '../run-health/node-cpu-profile.js';

const TAR_BLOCK = 512;

// One ustar entry: header block, then the data padded to whole blocks.
function tarEntry(name, data, type = '0') {
  const header = Buffer.alloc(TAR_BLOCK);
  header.write(name, 0, 'latin1');
  header.write(('00000000000' + data.length.toString(8)).slice(-11) + '\0', 124, 'latin1');
  header.write(type, 156, 'latin1');
  header.write('ustar\0', 257, 'latin1');
  const padded = Buffer.alloc(Math.ceil(data.length / TAR_BLOCK) * TAR_BLOCK);
  data.copy(padded);
  return Buffer.concat([header, padded]);
}

function tarArchive(entries) {
  return Buffer.concat([...entries, Buffer.alloc(2 * TAR_BLOCK)]);
}

function clusterFor(cpuProfileNode, outputDir = '/unused') {
  return {_config: {cpuProfileNode, outputDir}, _scenarioName: 'some-scenario'};
}

describe('opt-in node CPU profile', () => {
  it('is off unless the run names a node, and the option parses', () => {
    const {parseArgs} = createDistributedRunArgHelpers({CLI});
    assert.equal(parseArgs(['--scenario', 'x']).profileNode, null);
    assert.equal(parseArgs(['--scenario', 'x', '--profile-node', 'seed']).profileNode, 'seed');
    assert.equal(profiledNodeIndex(null), null);
    assert.equal(profiledNodeIndex(undefined), null);
    assert.equal(profiledNodeIndex('seed'), 0);
    assert.equal(profiledNodeIndex('2'), 2);
    assert.throws(() => profiledNodeIndex('all'), /takes `seed` or a node index/u);
    assert.throws(() => profiledNodeIndex('-1'), /takes `seed` or a node index/u);
  });

  it('starts only the named node under the profiler', () => {
    const off = clusterFor(undefined);
    assert.deepEqual(cpuProfileEnvFor(off, 'node-seed', 0, {}), {});
    assert.equal(off._cpuProfiledNodeIds, undefined);

    const cluster = clusterFor('seed');
    assert.deepEqual(cpuProfileEnvFor(cluster, 'node-seed', 0, {}),
      {NODE_OPTIONS: CPU_PROFILE_NODE_OPTIONS});
    assert.deepEqual(cpuProfileEnvFor(cluster, 'node-joiner', 1, {}), {});
    assert.deepEqual([...cluster._cpuProfiledNodeIds], ['node-seed']);
    assert.match(CPU_PROFILE_NODE_OPTIONS,
      /^--cpu-prof --cpu-prof-dir=\/tmp\/lagrange-cpu-profile --cpu-prof-interval=10000$/u);
    // Options the node already has are kept.
    assert.equal(cpuProfileEnvFor(clusterFor('1'), 'node-joiner', 1,
      {NODE_OPTIONS: '--trace-gc'}).NODE_OPTIONS, `--trace-gc ${CPU_PROFILE_NODE_OPTIONS}`);
  });

  it('reads the regular files of a tar archive', () => {
    const big = Buffer.alloc(1300, 'x');
    const files = readTarFiles(tarArchive([
      tarEntry('lagrange-cpu-profile/', Buffer.alloc(0), '5'),
      tarEntry('lagrange-cpu-profile/CPU.1.cpuprofile', Buffer.from('{"nodes":[]}')),
      tarEntry('lagrange-cpu-profile/big.bin', big),
    ]));
    assert.deepEqual(arrayMap(files, (file) => [file.name, file.data.length]), [
      ['lagrange-cpu-profile/CPU.1.cpuprofile', 12], ['lagrange-cpu-profile/big.bin', 1300]]);
    assert.equal(files[0].data.toString(), '{"nodes":[]}');
    assert.deepEqual(readTarFiles(Buffer.alloc(0)), []);
  });

  it('collects the profiled node\'s profiles into the run artefacts', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'node-cpu-profile-'));
    try {
      const cluster = clusterFor('seed', outputDir);
      cpuProfileEnvFor(cluster, 'node-seed', 0, {});
      const asked = [];
      const provider = {getContainerArchive: async (containerId, path) => {
        asked.push([containerId, path]);
        return Readable.from([tarArchive([
          tarEntry('lagrange-cpu-profile/CPU.a.cpuprofile', Buffer.from('{"a":1}')),
          tarEntry('lagrange-cpu-profile/CPU.b.cpuprofile', Buffer.from('{"b":2}')),
          tarEntry('lagrange-cpu-profile/other.txt', Buffer.from('no')),
        ])]);
      }};
      const lines = [];
      const outcomes = await collectCpuProfiles(cluster, [
        ['node-seed', {containerId: 'c-seed', _dockerProvider: provider}],
        ['node-joiner', {containerId: 'c-joiner', _dockerProvider: provider}],
      ], (text) => lines.push(text));
      assert.deepEqual(asked, [['c-seed', '/tmp/lagrange-cpu-profile']]);
      const directory = join(outputDir, '.cpu-profiles', 'some-scenario');
      assert.deepEqual(outcomes, [{nodeId: 'node-seed', state: CPU_PROFILE_STATE.COLLECTED,
        paths: [join(directory, 'node-seed.CPU.a.cpuprofile'),
          join(directory, 'node-seed.CPU.b.cpuprofile')]}]);
      assert.deepEqual((await readdir(directory)).sort(),
        ['node-seed.CPU.a.cpuprofile', 'node-seed.CPU.b.cpuprofile']);
      assert.equal(await readFile(outcomes[0].paths[1], 'utf8'), '{"b":2}');
      assert.match(lines[0], /CPU profile of node node-seed: .*analyze:cpu-profile/u);
    } finally {
      await rm(outputDir, {recursive: true, force: true});
    }
  });

  it('names the absence when the node wrote no profile', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'node-cpu-profile-absent-'));
    try {
      const cluster = clusterFor('seed', outputDir);
      cpuProfileEnvFor(cluster, 'node-seed', 0, {});
      const notFound = {getContainerArchive: async () => {
        throw Object.assign(new Error('no such file'), {statusCode: 404});
      }};
      const broken = {getContainerArchive: async () => {
        throw new Error('socket hang up');
      }};
      const empty = {getContainerArchive: async () => Readable.from([tarArchive([])])};
      const reasonWith = async (provider) => (await collectCpuProfiles(cluster,
        [['node-seed', {containerId: 'c', _dockerProvider: provider}]], () => {}))[0];
      assert.equal((await reasonWith(notFound)).reason,
        CPU_PROFILE_UNAVAILABLE_REASON.NO_PROFILE_IN_CONTAINER);
      assert.equal((await reasonWith(empty)).reason,
        CPU_PROFILE_UNAVAILABLE_REASON.NO_PROFILE_IN_CONTAINER);
      assert.equal((await reasonWith(broken)).reason,
        CPU_PROFILE_UNAVAILABLE_REASON.ARCHIVE_FAILED);
      // Nothing is collected when no node was profiled.
      assert.deepEqual(await collectCpuProfiles(clusterFor(undefined), [], () => {}), []);
    } finally {
      await rm(outputDir, {recursive: true, force: true});
    }
  });
});

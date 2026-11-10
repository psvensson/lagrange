// Serialized into a fresh child so builtin interception cannot affect another
// test. Local spawning and Git history observations are intercepted; no command
// executes. The public owner assembles its actual default and opted-in scripts.
export async function capturePlacementScripts() {
  const assert = (await import('node:assert/strict')).default;
  const childProcess = (await import('node:child_process')).default;
  const fs = (await import('node:fs')).default;
  const {EventEmitter} = await import('node:events');
  const {syncBuiltinESMExports} = await import('node:module');
  const {tmpdir, hostname} = await import('node:os');
  const {join} = await import('node:path');
  const root = fs.mkdtempSync(join(tmpdir(), 'placement-script-characterization-'));
  const sha = 'a'.repeat(40);
  const base = 'b'.repeat(40);
  const scripts = {};
  const wrappers = [];
  let spawns = 0;
  childProcess.spawn = (command, args, options) => {
    assert.equal(command, 'sh');
    assert.equal(args[0], '-c');
    assert.equal(options.detached, true);
    wrappers.push({
      command, args: args.map((arg) => arg.replaceAll(root, '<ROOT>')
        .replaceAll(`"agent":"lagrange:${hostname()}:${process.pid}"`, '"agent":"<DEFAULT_AGENT>"')
        .replaceAll(`"controller":"${hostname()}"`, '"controller":"<CONTROLLER>"')),
      env: options.env, detached: options.detached,
      stdio: [options.stdio[0], typeof options.stdio[1], typeof options.stdio[2]],
    });
    spawns += 1;
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    setImmediate(() => {
      child.exitCode = 0;
      child.emit('exit', 0);
      child.emit('close', 0);
    });
    return child;
  };
  childProcess.spawnSync = (command, args) => {
    assert.equal(command, 'git');
    assert.ok(['cat-file', 'merge-base'].includes(args[0]));
    return {status: 0, signal: null, stdout: '', stderr: ''};
  };
  syncBuiltinESMExports();
  const {startRemoteShard} = await import(`${process.cwd()}/scripts/lab/probe.js`);
  const machine = {name: 'fixture', repoHead: sha, repoPath: '/unused', factor: 1};
  try {
    for (const name of ['default', 'artifacts']) {
      const artifacts = name === 'default' ? null :
        [{path: 'record.ndjson', required: true, maxBytes: 128}];
      const running = startRemoteShard({machine, files: ['test/fixture.test.js']},
        {root, sha, runId: name, deadlineMs: 10000, env: {}, artifacts,
          forward: {checkBase: base, retry: '0'},
          holder: {purpose: 'shell characterization', expectedMs: 10000}});
      scripts[name] = fs.readFileSync(
        join(root, `test-output/placement/${name}-fixture.sh`), 'utf8');
      assert.equal((await running.done).status, 0);
    }
    assert.equal(spawns, 2);
    return {...scripts, wrappers};
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

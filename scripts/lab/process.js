import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

export function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hasInput = options.stdin !== undefined;
    const stdio = options.stdio || (hasInput ? ['pipe', 'inherit', 'inherit'] : 'inherit');
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio,
      shell: false,
    });
    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (code === 0) return resolvePromise({code, signal});
      const suffix = signal ? ` signal=${signal}` : ` exit=${code}`;
      rejectPromise(new Error(`${command} failed:${suffix}`));
    });
    if (hasInput && child.stdin) child.stdin.end(options.stdin);
  });
}

export function capture(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) return resolvePromise(stdout.trim());
      rejectPromise(new Error(`${command} failed (${code}): ${stderr.trim()}`));
    });
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

export async function commandExists(command) {
  const probe = process.platform === 'win32' ?
    ['where', command] :
    ['sh', '-lc', `command -v ${command}`];
  try {
    await capture(probe[0], probe.slice(1));
    return true;
  } catch {
    return false;
  }
}

export function reserveLocalPort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.unref();
    server.on('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) return rejectPromise(error);
        if (!port) return rejectPromise(new Error('Could not reserve a local port'));
        resolvePromise(port);
      });
    });
  });
}

export async function waitForDockerPing(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/_ping`);
      if (response.ok && (await response.text()).trim() === 'OK') return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }
  throw new Error(`Docker tunnel on port ${port} did not become ready: ${lastError || 'timeout'}`);
}

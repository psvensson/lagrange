import {Worker} from 'node:worker_threads';
const w = new Worker(new URL('./transpile-once.mjs',
  import.meta.url),
{workerData: process.env.COMPONENT_WASM});
const t = Date.now();
w.on('message', async (m) => {
  const u = await w.cpuUsage();
  console.log(JSON.stringify({wallMs: Date.now()-t,
    transpileWallMs: m,
    cpuMs: Math.round((u.user+u.system)/1000)}));
  await w.terminate();
});

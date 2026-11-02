import fs from 'node:fs';
import {buildServiceComponent} from '../src/service/service-component-build.js';
const t0 = Date.now();
const b = await buildServiceComponent({entryPath: process.env.ENTRY_PATH,
  worldName: process.argv[2]});
fs.writeFileSync(process.env.COMPONENT_WASM, b.component);
console.log(JSON.stringify({buildMs: Date.now()-t0, bytes: b.component.byteLength}));

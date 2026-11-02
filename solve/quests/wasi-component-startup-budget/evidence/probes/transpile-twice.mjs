import fs from 'node:fs';
const t0=Date.now();
const {transpileBytes} = await import('@bytecodealliance/jco-transpile');
const t1=Date.now();
const bytes = new Uint8Array(fs.readFileSync(process.env.COMPONENT_WASM));
for (let i=0; i<3; i++) {
  const t=Date.now();
  await transpileBytes(bytes,
    {emitTypescriptDeclarations: false,
      instantiation: 'async',
      name: 'request-cell'});
  console.log('transpile#'+i+' ms='+(Date.now()-t));
}
console.log('import ms='+(t1-t0));

import {writeFileSync} from 'node:fs';
import {reserveCdcCoverageListenerBase as reserve,
  enterCdcCoverageListenerTerminalCheck as enter,
  transferCdcCoverageListenerToTerminal as transfer,
  readCdcCoverageTransferDiagnostics as read,
  retireCdcCoverageTransferOwner as retire} from '/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011/src/cdc/cdc-coverage-transfer-owner.js';
function base(id) {return {listenerGenerationId: id, immediateCount: 2,
  immediateBytes: 4096, completionCount: 2, completionBytes: 8192,
  aliasSetCount: 1, aliasBytes: 4096, destroyIdCount: 2};}
const cases = [['NaN', NaN], ['positive-infinity', Infinity],
  ['negative-infinity', -Infinity], ['negative', -1],
  ['unsafe', Number.MAX_SAFE_INTEGER + 1], ['boxed', new Number(2)],
  ['numeric-string', '2'], ['negative-zero', -0]];
const results=[];
for (const [label, value] of cases) {
  const service={nodeId:'independent-boundary-'+label};
  const record={};
  const claim=reserve(service,{bootIncarnation:1,listenerGenerationId:label,
    shutdownRecord:record});
  enter(service,claim);
  const d={...base(label),immediateCount:value};
  const result=transfer(service,claim,{shutdownRecord:record,descriptor:d,
    terminalize:(r)=>r});
  results.push({label,result,bytes:read(service).retainedBytes,
    storedNegativeZero:Object.is(read(service).terminalDescriptor?.immediateCount,-0)});
  if (!result) transfer(service,claim,{shutdownRecord:record,
    descriptor:base(label),terminalize:(r)=>r});
  retire(service);
}
{
  const service={nodeId:'independent-inherited'};const record={};
  const claim=reserve(service,{bootIncarnation:1,listenerGenerationId:'inherited',shutdownRecord:record});
  enter(service,claim);
  const d=Object.create(base('inherited'));
  const result=transfer(service,claim,{shutdownRecord:record,descriptor:d,
    terminalize:(r)=>r});
  results.push({label:'inherited-descriptor',ownFieldCount:Object.keys(d).length,
    result,bytes:read(service).retainedBytes});
  retire(service);
}
writeFileSync(new URL('./descriptor-boundaries.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));

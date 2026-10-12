import {writeFileSync} from 'node:fs';
import {
  reserveCdcCoverageListenerBase as reserve,
  enterCdcCoverageListenerTerminalCheck as enter,
  transferCdcCoverageListenerToTerminal as transfer,
  retireCdcCoverageTransferOwner as retire,
  registerCdcCoverageTransferWake as wake,
  reserveCdcCoverageTransfer as reserveRow,
  releaseCdcCoverageTransferSession as releaseRow,
  readCdcCoverageTransferDiagnostics as read,
} from '/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011/src/cdc/cdc-coverage-transfer-owner.js';

const results = [];
function desc(id) {return {listenerGenerationId:id, immediateCount:2,
  immediateBytes:4096,completionCount:2,completionBytes:8192,
  aliasSetCount:1,aliasBytes:4096,destroyIdCount:2};}
function setup(id) {
  const owner={nodeId:`independent-round2-${id}`};
  const record={};
  const claim=reserve(owner,{bootIncarnation:1,listenerGenerationId:id,
    shutdownRecord:record});
  enter(owner,claim);return {owner,record,claim,id};
}
function finish(f, options={}) {
  return transfer(f.owner,f.claim,{shutdownRecord:f.record,descriptor:desc(f.id),
    terminalize:(result)=>result,...options});
}
for (const seam of ['proxy-descriptor','options-descriptor','options-terminalize','options-shutdownRecord']) {
  const f=setup(seam);let nested=null,successor=null,outerCalls=0,fired=false;
  const successorRecord={};
  function reenter() {
    if(fired)return;
    fired=true;
    nested=finish(f);
    successor=reserve(f.owner,{bootIncarnation:1,
      listenerGenerationId:seam+'-next',shutdownRecord:successorRecord});
  }
  const options={shutdownRecord:f.record,descriptor:desc(f.id),
    terminalize:(result)=>{outerCalls++;return result;}};
  if(seam==='proxy-descriptor') {
    options.descriptor=new Proxy(desc(f.id),{getOwnPropertyDescriptor(target,key){
      reenter();return Reflect.getOwnPropertyDescriptor(target,key);
    }});
  } else {
    const field=seam.slice('options-'.length);
    const value=options[field];
    Object.defineProperty(options,field,{get(){reenter();return value;}});
  }
  let result=null,thrown=null;
  try{result=transfer(f.owner,f.claim,options);}catch(e){thrown=e.message;}
  const after=read(f.owner);
  enter(f.owner,successor);
  const successorCompleted=transfer(f.owner,successor,{
    shutdownRecord:successorRecord,descriptor:desc(seam+'-next'),
    terminalize:(r)=>r});
  results.push({name:seam,contractHolds:result===false && thrown===null &&
    outerCalls===0 && nested===true && successor!==null,
    result,thrown,outerCalls,nested,successor:!!successor,after,
    successorCompleted,afterSuccessor:read(f.owner)});
  retire(f.owner);
}

// Capturing an ordinary proxy once is permitted and bounded; a throwing trap
// must still leave the original claim retryable.
{
  const f=setup('throwing-proxy');let calls=0;
  const d=new Proxy(desc(f.id),{getOwnPropertyDescriptor(){calls++;throw Error('capture');}});
  const result=finish(f,{descriptor:d});const before=read(f.owner);const retry=finish(f);
  results.push({name:'throwing-proxy-refusal-and-valid-retry',
    contractHolds:result===false&&retry===true&&calls===1,
    result,retry,calls,before,after:read(f.owner)});retire(f.owner);
}
{
  const f=setup('plain-proxy');const counts={};
  const d=new Proxy(desc(f.id),{getOwnPropertyDescriptor(target,key){
    counts[key]=(counts[key]??0)+1;return Reflect.getOwnPropertyDescriptor(target,key);
  }});
  const result=finish(f,{descriptor:d});
  results.push({name:'plain-proxy-captured-once',contractHolds:result===true&&
    Object.keys(counts).length===8&&Object.values(counts).every(n=>n===1),result,counts});
  retire(f.owner);
}

// Registered-during-dispatch callbacks wait for a later real release; they
// cannot expand the current notification population.
{
  const f=setup('fixed-snapshot');let firstCalls=0,lateCalls=0,removeLate=null;
  const removeFirst=wake(f.owner,()=>{firstCalls++;
    if(!removeLate)removeLate=wake(f.owner,()=>{lateCalls++;});
  });
  const result=finish(f);const afterFirst={firstCalls,lateCalls};
  const row=reserveRow(f.owner,{transferId:'next-real-release',retainedBytes:1,category:'consumer'});
  const released=releaseRow(f.owner,'next-real-release',row);
  results.push({name:'fixed-snapshot-does-not-expand',contractHolds:result===true&&
    afterFirst.firstCalls===1&&afterFirst.lateCalls===0&&released===true&&
    firstCalls===2&&lateCalls===1,result,afterFirst,released,firstCalls,lateCalls});
  removeFirst();removeLate();retire(f.owner);
}
writeFileSync(new URL('./capture-reentry.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
for(const r of results)console.log(`${r.contractHolds?'PASS':'COUNTEREXAMPLE'} ${r.name}`);
process.exitCode=results.every(r=>r.contractHolds)?0:1;

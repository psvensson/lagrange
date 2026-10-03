#!/usr/bin/env node
import {
  routeSplitSnapshotBatch,
} from '../../src/partition/partition-split-routing.js';

const LEFT = 'left';
const RIGHT = 'right';
const METADATA = Object.freeze({
  primaryKeyColumn: 'id',
  splitKey: 'm',
  targetPartitionIds: Object.freeze([LEFT, RIGHT]),
});
const EXPECTED = JSON.stringify([
  {partitionId: LEFT, params: ['a', 'Ada', 'b', 'Bob']},
  {partitionId: RIGHT, params: ['z', 'Zoe']},
]);

async function proveStableBatching() {
  const rows = [
    {id:'a',name:'Ada'},
    {id:'z',name:'Zoe'},
    {id:'b',name:'Bob'},
  ];
  Object.defineProperty(rows, Symbol.iterator, {
    configurable:true,
    value() {
      throw new Error('snapshot rows iterator executed');
    },
  });
  const routed=[];
  try {
    await routeSplitSnapshotBatch(rows,['id','name'],METADATA,{
      tableName:'users',
      queryExecutor:{
        async executeOnPartition(partitionId,_sql,params){
          routed.push({partitionId,params});
          return {success:true};
        },
      },
    });
  } catch {
    return 1;
  }
  return JSON.stringify(routed) === EXPECTED ? 0 : 1;
}

async function proveProxyRefusal() {
  let traps=0;
  const rows=new Proxy([{id:'a',name:'Ada'}],{
    get(){ traps+=1; throw new Error('proxy get trap'); },
    getOwnPropertyDescriptor(){ traps+=1; throw new Error('proxy descriptor trap'); },
  });
  try {
    await routeSplitSnapshotBatch(rows,['id','name'],METADATA,{
      tableName:'users',
      queryExecutor:{async executeOnPartition(){return {success:true};}},
    });
    return 1;
  } catch {
    return traps === 0 ? 0 : 1;
  }
}

async function proveCapturedPush() {
  const original=Array.prototype.push;
  let routed;
  try {
    Array.prototype.push=function(){ return this.length; };
    routed=[];
    await routeSplitSnapshotBatch(
      [{id:'a',name:'Ada'},{id:'z',name:'Zoe'}],
      ['id','name'],
      METADATA,
      {
        tableName:'users',
        queryExecutor:{
          async executeOnPartition(partitionId,_sql,params){
            // Avoid push while the intrinsic is hostile.
            routed[routed.length]={partitionId,params};
            return {success:true};
          },
        },
      },
    );
  } finally {
    Array.prototype.push=original;
  }
  return routed?.length === 2 ? 0 : 1;
}

const metric =
  await proveStableBatching() +
  await proveProxyRefusal() +
  await proveCapturedPush();
if(metric!==0){
  process.stderr.write(
    'partition-key-ordering-owner-completion-v10: outstanding problems='+
    String(metric)+'\n',
  );
}
process.stdout.write(String(metric)+'\n');
process.exitCode=metric===0?0:1;

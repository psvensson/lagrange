#!/usr/bin/env node
import fs from 'node:fs';
import {PARTITION_SERVICE_ERROR_MSG} from '../../src/partition/partition-service-constants.js';
import {compareRoutingKeys, resolveSplitTargetPartitionId} from '../../src/partition/split-key-comparator.js';

const UTF8='utf8';
const bufferCompare=Buffer.compare.bind(Buffer);
const bufferFrom=Buffer.from.bind(Buffer);
const regExpTest=Function.call.bind(RegExp.prototype.test);
const COMPARATOR_URL=new URL('../../src/partition/split-key-comparator.js',import.meta.url);
const MERGE_CORE_URL=new URL('../../src/partition/partition-split-merge-manager-core-methods.js',import.meta.url);
const MERGE_EVALUATION_URL=new URL('../../src/partition/partition-split-merge-manager-evaluation-methods.js',import.meta.url);
const PARTITIONING_DOC_URL=new URL('../../architecture/process-partitioning.md',import.meta.url);
const LOCALE_CALL_PATTERN=/\.localeCompare\s*\(/u;
const DUPLICATE_METHOD_PATTERN=/\bcomparePartitionKeys\s*\(/u;
const UNSUPPORTED_FALLBACK_PATTERN=/aType\s*===\s*null\s*&&\s*bType\s*===\s*null/u;
const EARLY_EQUALITY_PATTERN=/if\s*\(\s*a\s*===\s*b\s*\)\s*return\s+COMPARISON_RESULT\.EQUAL/u;
const TARGET_DESTRUCTURING_PATTERN=/const\s*\[\s*leftPartitionId\s*,\s*rightPartitionId\s*\]/u;
const DIRECT_MUTABLE_INTRINSIC_PATTERN=/(?:\b(?:Buffer\.(?:compare|from|isBuffer)|Number\.isFinite|Array\.isArray)\s*\(|\bnew\s+Error\s*\()/u;
const TARGET_INDEX_OWNER_PATTERN=/const\s+targetPartitionIds\s*=\s*metadata\?\.targetPartitionIds;[\s\S]*?arrayIsArray\(targetPartitionIds\)[\s\S]*?targetPartitionIds\[0\][\s\S]*?arrayIsArray\(targetPartitionIds\)[\s\S]*?targetPartitionIds\[1\]/u;
const SORT_OWNER_PATTERN=/sortEvaluationPartitions\(partitions\)[\s\S]*?return\s+compareRoutingKeys\(\s*this\.getPartitionStartKey\(left\),\s*this\.getPartitionStartKey\(right\),\s*\);/u;
const ADJACENCY_OWNER_PATTERN=/!this\.keyRangeManager\s*&&\s*compareRoutingKeys\(\s*this\.getPartitionEndKey\(leftPartition\),\s*this\.getPartitionStartKey\(rightPartition\),\s*\)\s*!==\s*0/u;
const TEXT_CASES=Object.freeze([Object.freeze(['Z','a']),Object.freeze(['a','A']),Object.freeze(['z','~']),Object.freeze(['0','A']),Object.freeze(['\uE000','\u{10000}'])]);
const RIGHT_NUMERIC_KEY=1000;
const STORED_NUMERIC_BOUNDARY='500.0';
const NON_NUMERIC_BOUNDARY='abc';
const EXPECTED_NUMBER_STRING_MISMATCH=PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('number','string');
const EXPECTED_OBJECT_MISMATCH=PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('object','object');
const EXPECTED_NUMBER_NUMBER_MISMATCH=PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('number','number');
const EXPECTED_SYMBOL_MISMATCH=PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('symbol','symbol');
const EXPECTED_BOOLEAN_MISMATCH=PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('boolean','boolean');

function sign(value){if(value<0)return -1;if(value>0)return 1;return 0;}
function sqliteBinaryTextCompare(left,right){return bufferCompare(bufferFrom(left,UTF8),bufferFrom(right,UTF8));}
function expectRefusal(left,right,message){try{compareRoutingKeys(left,right);}catch(error){return error?.message===message?0:1;}return 1;}
function exactRefusalProblemCount(){
  let problems=expectRefusal(RIGHT_NUMERIC_KEY,NON_NUMERIC_BOUNDARY,EXPECTED_NUMBER_STRING_MISMATCH);
  let coercionCalls=0;
  const hostile={[Symbol.toPrimitive](){coercionCalls+=1;throw new Error('hostile coercion executed');}};
  const boxed=Object('a');
  const symbol=Symbol('same');
  for(const [left,right,message] of [[hostile,hostile,EXPECTED_OBJECT_MISMATCH],[hostile,{},EXPECTED_OBJECT_MISMATCH],[boxed,boxed,EXPECTED_OBJECT_MISMATCH],[symbol,symbol,EXPECTED_SYMBOL_MISMATCH],[true,true,EXPECTED_BOOLEAN_MISMATCH],[Number.POSITIVE_INFINITY,Number.POSITIVE_INFINITY,EXPECTED_NUMBER_NUMBER_MISMATCH],[Number.NEGATIVE_INFINITY,Number.NEGATIVE_INFINITY,EXPECTED_NUMBER_NUMBER_MISMATCH],[Number.NaN,Number.NaN,EXPECTED_NUMBER_NUMBER_MISMATCH]])problems+=expectRefusal(left,right,message);
  if(coercionCalls!==0)problems+=1;
  if(compareRoutingKeys('same','same')!==0)problems+=1;
  if(compareRoutingKeys(7,7)!==0)problems+=1;
  if(compareRoutingKeys(-0,0)!==0)problems+=1;
  if(compareRoutingKeys(null,null)!==0)problems+=1;
  return problems;
}
function intrinsicStabilityProblemCount(){
  const originalBufferCompare=Buffer.compare;
  const originalBufferFrom=Buffer.from;
  const originalBufferIsBuffer=Buffer.isBuffer;
  const originalString=globalThis.String;
  const originalNumber=globalThis.Number;
  const originalNumberIsFinite=originalNumber.isFinite;
  const originalArrayIsArray=Array.isArray;
  const originalArrayIteratorDescriptor=Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator);
  const originalRegExpTestDescriptor=Object.getOwnPropertyDescriptor(RegExp.prototype,'test');
  const originalError=globalThis.Error;
  const leftBuffer=bufferFrom('a');
  const rightBuffer=bufferFrom('b');
  const targetPartitionIds=['left','right'];
  let textOrder=null,numericTextOrder=null,bufferOrder=null,splitTarget=null,mixedMessage=null,threw=false;
  try{
    Buffer.compare=()=>0;
    Buffer.from=()=>{throw new Error('mutated Buffer.from executed');};
    Buffer.isBuffer=()=>false;
    globalThis.String=()=> 'corrupted';
    originalNumber.isFinite=()=>false;
    globalThis.Number=()=>NaN;
    Array.isArray=()=>false;
    Reflect.defineProperty(Array.prototype,Symbol.iterator,{configurable:true,writable:true,value:()=>{throw new Error('mutated Array iterator executed');}});
    Reflect.defineProperty(RegExp.prototype,'test',{configurable:true,writable:true,value:()=>false});
    globalThis.Error=class CorruptedError extends originalError{constructor(){super('corrupted mutable Error');}};
    textOrder=compareRoutingKeys('a','b');
    numericTextOrder=compareRoutingKeys(RIGHT_NUMERIC_KEY,STORED_NUMERIC_BOUNDARY);
    bufferOrder=compareRoutingKeys(leftBuffer,rightBuffer);
    splitTarget=resolveSplitTargetPartitionId(20,{splitKey:10,targetPartitionIds});
    try{compareRoutingKeys(RIGHT_NUMERIC_KEY,NON_NUMERIC_BOUNDARY);}catch(error){mixedMessage=error?.message||null;}
  }catch(_error){threw=true;}finally{
    Buffer.compare=originalBufferCompare;
    Buffer.from=originalBufferFrom;
    Buffer.isBuffer=originalBufferIsBuffer;
    Reflect.defineProperty(RegExp.prototype,'test',originalRegExpTestDescriptor);
    Reflect.defineProperty(Array.prototype,Symbol.iterator,originalArrayIteratorDescriptor);
    Array.isArray=originalArrayIsArray;
    globalThis.Error=originalError;
    originalNumber.isFinite=originalNumberIsFinite;
    globalThis.Number=originalNumber;
    globalThis.String=originalString;
  }
  let problems=0;
  if(threw)problems+=1;
  if(!(textOrder<0))problems+=1;
  if(!(numericTextOrder>0))problems+=1;
  if(!(bufferOrder<0))problems+=1;
  if(splitTarget!=='right')problems+=1;
  if(mixedMessage!==EXPECTED_NUMBER_STRING_MISMATCH)problems+=1;
  return problems;
}
function behavioralProblemCount(){
  let problems=0;
  for(const [left,right] of TEXT_CASES)if(sign(compareRoutingKeys(left,right))!==sign(sqliteBinaryTextCompare(left,right)))problems+=1;
  if(compareRoutingKeys(RIGHT_NUMERIC_KEY,STORED_NUMERIC_BOUNDARY)<=0)problems+=1;
  return problems+exactRefusalProblemCount()+intrinsicStabilityProblemCount();
}
function structuralProblemCount(){
  const comparatorSource=fs.readFileSync(COMPARATOR_URL,UTF8);
  const mergeCoreSource=fs.readFileSync(MERGE_CORE_URL,UTF8);
  const mergeEvaluationSource=fs.readFileSync(MERGE_EVALUATION_URL,UTF8);
  const partitioningDoc=fs.readFileSync(PARTITIONING_DOC_URL,UTF8);
  let problems=0;
  if(regExpTest(LOCALE_CALL_PATTERN,comparatorSource))problems+=1;
  if(regExpTest(UNSUPPORTED_FALLBACK_PATTERN,comparatorSource))problems+=1;
  if(regExpTest(EARLY_EQUALITY_PATTERN,comparatorSource))problems+=1;
  if(regExpTest(TARGET_DESTRUCTURING_PATTERN,comparatorSource))problems+=1;
  if(!regExpTest(TARGET_INDEX_OWNER_PATTERN,comparatorSource))problems+=1;
  if(regExpTest(DIRECT_MUTABLE_INTRINSIC_PATTERN,comparatorSource))problems+=1;
  if(regExpTest(DUPLICATE_METHOD_PATTERN,mergeCoreSource))problems+=1;
  if(regExpTest(DUPLICATE_METHOD_PATTERN,mergeEvaluationSource))problems+=1;
  if(!regExpTest(SORT_OWNER_PATTERN,mergeCoreSource))problems+=1;
  if(!regExpTest(ADJACENCY_OWNER_PATTERN,mergeEvaluationSource))problems+=1;
  if(!partitioningDoc.includes('BINARY-compatible UTF-8 byte ordering'))problems+=1;
  if(partitioningDoc.includes('String#localeCompare'))problems+=1;
  return problems;
}
const metric=behavioralProblemCount()+structuralProblemCount();
if(metric!==0)process.stderr.write('partition-key-ordering-owner-completion-v4: outstanding problems='+String(metric)+'\n');
process.stdout.write(String(metric)+'\n');
process.exitCode=metric===0?0:1;

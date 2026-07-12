import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const PHASE = process.env.A2B_FAULT_PHASE;
const SIGNAL = 'SIGKILL';
const BACKUP_MARKER = '.a2b-backup-';
const JOURNAL_SUFFIX = '.transaction.json';
const OBJECT_SUFFIX = '.diff.gz';
const DESCRIPTOR_SUFFIX = '.diff.json';
const RECEIPT_SUFFIX = '.receipt.json';
const TEMPORARY_SUFFIX = '.tmp';
const UNRELATED_PHASE = 'unrelated-write';
const UNRELATED_PATH = 'solve/changes/injected-unrelated.txt';
const UNRELATED_CONTENT = 'injected-during-transaction\n';
const originalWriteFileSync = fs.writeFileSync;
export const HISTORICAL_ARTIFACT_BATCH_FAULT_PRELOAD =
  fileURLToPath(import.meta.url);

function fileName(value) {
  return String(value);
}

function killAfter(method, phase, matches) {
  const original = fs[method];
  fs[method] = function faultInjectedOperation(...args) {
    const result = original.apply(this, args);
    if (PHASE === phase && matches(...args)) process.kill(process.pid, SIGNAL);
    return result;
  };
}

if (PHASE) {
  killAfter('linkSync', 'journal', (_source, destination) =>
    fileName(destination).endsWith(JOURNAL_SUFFIX));
  killAfter('linkSync', UNRELATED_PHASE, (_source, destination) => {
    if (!fileName(destination).endsWith(JOURNAL_SUFFIX)) return false;
    originalWriteFileSync(UNRELATED_PATH, UNRELATED_CONTENT);
    return false;
  });
  killAfter('linkSync', 'object', (_source, destination) =>
    fileName(destination).endsWith(OBJECT_SUFFIX));
  killAfter('linkSync', 'descriptor', (_source, destination) =>
    fileName(destination).endsWith(DESCRIPTOR_SUFFIX));
  killAfter('renameSync', 'source', (_source, destination) =>
    fileName(destination).includes(BACKUP_MARKER));
  killAfter('writeFileSync', 'receipt-temporary', (file) =>
    fileName(file).endsWith(`${RECEIPT_SUFFIX}${TEMPORARY_SUFFIX}`));
  killAfter('linkSync', 'receipt', (_source, destination) =>
    fileName(destination).endsWith(RECEIPT_SUFFIX));
  killAfter('rmSync', 'cleanup', (file) =>
    fileName(file).endsWith(JOURNAL_SUFFIX));
}

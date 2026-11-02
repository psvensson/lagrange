/**
 * Test-only backup storage adapter for the management-v1 backup/restore
 * owner's declared `storageAdapter` port. Production composition installs no
 * storage adapter, so backup/restore reports capability-unsupported there;
 * tests inject this fake explicitly through the port.
 */
import {L3_BACKUP_RESTORE_REASON_CODE as L3_CODE} from
  '../../src/bootstrap/owners/management-v1-constants.js';

const BUFFER_ENCODING_UTF8 = 'utf8';
const STORAGE_NOT_FOUND_CODE = 'ENOENT';
const CORRUPTION_XOR_BYTE_MASK = 255;

const toBuffer = (d) => (Buffer.isBuffer(d) ? d : Buffer.from(String(d), BUFFER_ENCODING_UTF8));

const testUriMatch = (list, uri) =>
  Boolean(list && Array.from(Array.isArray(list) || list instanceof Set ? list : [list])
    .some((it) => typeof it === 'string' && it && uri.includes(it)));

const verifyFail = (list, uri, code) => {
  if (testUriMatch(list, uri)) throw Object.assign(new Error(code), {code});
};

function applyByteCorruption(failures, uri, buf) {
  if (testUriMatch(failures.corruptManifestUris, uri) ||
      testUriMatch(failures.corruptSegmentUris, uri)) {
    const copy = Buffer.from(buf);
    if (copy.length > 0) copy[0] ^= CORRUPTION_XOR_BYTE_MASK;
    return copy;
  }
  return buf;
}

class MemoryBackupStorageAdapter {
  constructor(failures = {}) {
    this.storage = new Map();
    this.failures = failures;
    this.writeCount = 0;
    this.readCount = 0;
  }

  async write(uri, data) {
    verifyFail(this.failures.unreachableUris, uri, L3_CODE.DESTINATION_UNREACHABLE);
    verifyFail(this.failures.writeDeniedUris, uri, L3_CODE.DESTINATION_WRITE_DENIED);
    verifyFail(this.failures.streamInterruptUris, uri, L3_CODE.BACKUP_STREAM_INTERRUPTED);
    this.writeCount += 1;
    this.storage.set(uri, toBuffer(data));
  }

  async read(uri) {
    verifyFail(this.failures.unreachableUris, uri, L3_CODE.DESTINATION_UNREACHABLE);
    this.readCount += 1;
    const buf = this.storage.get(uri);
    if (!buf) {
      throw Object.assign(new Error(STORAGE_NOT_FOUND_CODE), {code: STORAGE_NOT_FOUND_CODE});
    }
    return applyByteCorruption(this.failures, uri, buf);
  }

  has(uri) {
    return this.storage.has(uri);
  }
}

export {MemoryBackupStorageAdapter};

import {execFileSync} from 'node:child_process';

const ZERO = 0;
const ONE = 1;
const GCLOUD_TIMEOUT_MS = 180000;
const DEFAULT_SIZE_GB = 100;
const DEFAULT_TYPE = 'pd-balanced';
const DEFAULT_MOUNT_PATH = '/mnt/lagrange-benchmark-data';
const DEFAULT_DEVICE_NAME = 'lagrange-benchmark-data';
const RESOURCE_NAME_PATTERN = /^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9._/-]+$/u;
const SAFE_DISK_TYPE_PATTERN = /^[a-z0-9-]+$/u;

function runGcloud(args) {
  return execFileSync('gcloud', args, {
    encoding: 'utf8',
    timeout: GCLOUD_TIMEOUT_MS,
  });
}

function normalizePositiveInteger(value, label, fallback) {
  const number = value ?? fallback;
  if (!Number.isInteger(number) || number < ONE) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}

function normalizeResourceName(value, label) {
  const text = String(value || '').trim();
  if (!RESOURCE_NAME_PATTERN.test(text)) {
    throw new Error(`${label} must be a valid GCP resource name`);
  }
  return text;
}

function normalizeSafeToken(value, label) {
  const text = String(value || '').trim();
  if (!text || !SAFE_TOKEN_PATTERN.test(text)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return text;
}

function normalizeMountPath(value) {
  const path = normalizeSafeToken(
    value ?? DEFAULT_MOUNT_PATH,
    'GCP data disk mountPath',
  );
  if (!path.startsWith('/')) {
    throw new Error('GCP data disk mountPath must be absolute');
  }
  return path;
}

function normalizeDiskType(value) {
  const type = String(value ?? DEFAULT_TYPE).trim();
  if (!SAFE_DISK_TYPE_PATTERN.test(type)) {
    throw new Error('GCP data disk type contains unsupported characters');
  }
  return type;
}

function normalizeHostInfo(hostInfo) {
  if (!Array.isArray(hostInfo) || hostInfo.length === ZERO) {
    throw new Error('GCP data disk owner requires non-empty hostInfo');
  }
  return hostInfo.map((host, index) => {
    const internalIp = normalizeSafeToken(
      host?.internalIp,
      `GCP data disk hostInfo[${index}].internalIp`,
    );
    return {internalIp};
  });
}

function normalizeHostIndexes(hostIndexes, hostCount) {
  if (!Array.isArray(hostIndexes) || hostIndexes.length === ZERO) {
    throw new Error('GCP data disk owner requires hostIndexes');
  }
  const normalized = hostIndexes.map((value) => Number(value));
  if (normalized.some((value) =>
    !Number.isInteger(value) || value < ZERO || value >= hostCount)) {
    throw new Error('GCP data disk hostIndexes must identify provisioned hosts');
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('GCP data disk hostIndexes must be distinct');
  }
  return normalized;
}

function normalizePolicy(options = {}) {
  const hostInfo = normalizeHostInfo(options.hostInfo);
  const hostIndexes = normalizeHostIndexes(options.hostIndexes, hostInfo.length);
  const sizeGb = normalizePositiveInteger(
    options.sizeGb,
    'GCP data disk sizeGb',
    DEFAULT_SIZE_GB,
  );
  const type = normalizeDiskType(options.type);
  const mountPath = normalizeMountPath(options.mountPath);
  const deviceName = normalizeResourceName(
    options.deviceName ?? DEFAULT_DEVICE_NAME,
    'GCP data disk deviceName',
  );
  const namePrefix = normalizeResourceName(
    options.namePrefix,
    'GCP data disk namePrefix',
  );
  return Object.freeze({
    hostInfo,
    hostIndexes,
    sizeGb,
    type,
    mountPath,
    deviceName,
    namePrefix,
  });
}

function isNotFound(error) {
  return /(?:not found|was not found)/iu.test(
    `${error?.message || ''}\n${error?.stderr || ''}`,
  );
}

function mountCommand(deviceName, mountPath) {
  const device = `/dev/disk/by-id/google-${deviceName}`;
  return 'sudo bash -c \'set -euo pipefail; ' +
    `device=${device}; ` +
    'for attempt in $(seq 1 30); do ' +
    '[ -b "$device" ] && break; sleep 1; done; ' +
    'test -b "$device"; ' +
    'if ! blkid "$device" >/dev/null 2>&1; then ' +
    'mkfs.ext4 -F "$device" >/dev/null; fi; ' +
    `mkdir -p ${mountPath}; ` +
    `mountpoint -q ${mountPath} || mount "$device" ${mountPath}; ` +
    `chmod 0777 ${mountPath}; ` +
    `test -w ${mountPath}\''`;
}

function unmountCommand(mountPath) {
  return `sudo umount ${mountPath} >/dev/null 2>&1 || true`;
}

class GcpDataDiskOwner {
  constructor(options = {}) {
    this._project = normalizeSafeToken(options.project, 'GCP data disk project');
    this._zone = normalizeSafeToken(options.zone, 'GCP data disk zone');
    this._runCommand = options.runCommand || runGcloud;
    this._attached = [];
  }

  _gcloud(args) {
    return this._runCommand(args);
  }

  _resolveVmName(internalIp) {
    const output = this._gcloud([
      'compute', 'instances', 'list',
      '--project', this._project,
      '--zones', this._zone,
      `--filter=networkInterfaces.networkIP=${internalIp}`,
      '--format=value(name)',
    ]);
    const names = String(output || '').trim().split(/\r?\n/u).filter(Boolean);
    if (names.length !== ONE) {
      throw new Error(
        `Expected one GCP VM for internal IP ${internalIp}, got ${names.length}`,
      );
    }
    return normalizeResourceName(names[ZERO], 'GCP data disk VM name');
  }

  _ssh(vmName, command) {
    return this._gcloud([
      'compute', 'ssh', vmName,
      '--project', this._project,
      '--zone', this._zone,
      '--tunnel-through-iap',
      '--quiet',
      '--command', command,
    ]);
  }

  async attachDataDisks(options = {}) {
    if (this._attached.length !== ZERO) {
      throw new Error('GCP data disk owner already has attached disks');
    }
    const policy = normalizePolicy(options);
    try {
      for (const hostIndex of policy.hostIndexes) {
        const vmName = this._resolveVmName(policy.hostInfo[hostIndex].internalIp);
        const diskName = normalizeResourceName(
          `${policy.namePrefix}-${hostIndex}`,
          'GCP data disk name',
        );
        this._gcloud([
          'compute', 'disks', 'create', diskName,
          '--project', this._project,
          '--zone', this._zone,
          `--size=${policy.sizeGb}GB`,
          `--type=${policy.type}`,
          '--quiet',
        ]);
        const record = {
          hostIndex,
          vmName,
          diskName,
          deviceName: policy.deviceName,
          mountPath: policy.mountPath,
          sizeGb: policy.sizeGb,
          type: policy.type,
        };
        this._attached.push(record);
        this._gcloud([
          'compute', 'instances', 'attach-disk', vmName,
          '--project', this._project,
          '--zone', this._zone,
          '--disk', diskName,
          `--device-name=${policy.deviceName}`,
          '--mode=rw',
          '--quiet',
        ]);
        this._gcloud([
          'compute', 'instances', 'set-disk-auto-delete', vmName,
          '--project', this._project,
          '--zone', this._zone,
          '--auto-delete',
          '--disk', diskName,
          '--quiet',
        ]);
        this._ssh(vmName, mountCommand(policy.deviceName, policy.mountPath));
      }
      return this._attached.map((record) => Object.freeze({...record}));
    } catch (error) {
      let cleanupError = null;
      try {
        await this.destroy();
      } catch (candidate) {
        cleanupError = candidate;
      }
      if (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'GCP data disk attach and cleanup both failed',
        );
      }
      throw error;
    }
  }

  async destroy() {
    const failures = [];
    for (let index = this._attached.length - ONE; index >= ZERO; index -= ONE) {
      const record = this._attached[index];
      try {
        this._ssh(record.vmName, unmountCommand(record.mountPath));
      } catch (error) {
        if (!isNotFound(error)) failures.push(error);
      }
      try {
        this._gcloud([
          'compute', 'instances', 'detach-disk', record.vmName,
          '--project', this._project,
          '--zone', this._zone,
          '--disk', record.diskName,
          '--quiet',
        ]);
      } catch (error) {
        if (!isNotFound(error)) failures.push(error);
      }
      try {
        this._gcloud([
          'compute', 'disks', 'delete', record.diskName,
          '--project', this._project,
          '--zone', this._zone,
          '--quiet',
        ]);
      } catch (error) {
        if (!isNotFound(error)) failures.push(error);
      }
    }
    this._attached = [];
    if (failures.length !== ZERO) {
      throw new AggregateError(failures, 'GCP data disk cleanup failed');
    }
  }
}

export {
  DEFAULT_DEVICE_NAME as GCP_DATA_DISK_DEFAULT_DEVICE_NAME,
  DEFAULT_MOUNT_PATH as GCP_DATA_DISK_DEFAULT_MOUNT_PATH,
  DEFAULT_SIZE_GB as GCP_DATA_DISK_DEFAULT_SIZE_GB,
  DEFAULT_TYPE as GCP_DATA_DISK_DEFAULT_TYPE,
  GcpDataDiskOwner,
  mountCommand as buildGcpDataDiskMountCommand,
  normalizePolicy as normalizeGcpDataDiskPolicy,
};

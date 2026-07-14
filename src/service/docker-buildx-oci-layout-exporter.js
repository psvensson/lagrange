import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const executeFile = promisify(execFile);
const DEFAULT_DOCKER_COMMAND = 'docker';
const MAXIMUM_BUILD_OUTPUT_BYTES = 16 * 1024 * 1024;
const BUILD_ARGUMENT_FLAG = '--build-arg';
const DOCKER_COMMAND_FIELD = 'dockerCommand';
const EXECUTE_FILE_FIELD = 'executeFile';
const INVALID_EPOCH_MESSAGE =
  'sourceDateEpoch must be a non-negative safe integer';
const INVALID_BUILD_ARGS_MESSAGE =
  'buildArgs must be an object of string values';
const INVALID_EXECUTOR_MESSAGE = 'executeFile must be a function';

function requiredString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requiredEpoch(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(INVALID_EPOCH_MESSAGE);
  }
  return value;
}

function normalizedBuildArgs(buildArgs) {
  if (!buildArgs || typeof buildArgs !== 'object' || Array.isArray(buildArgs)) {
    throw new TypeError(INVALID_BUILD_ARGS_MESSAGE);
  }
  const entries = Object.entries(buildArgs);
  if (entries.some(([key, value]) =>
    key.length === 0 || typeof value !== 'string')) {
    throw new TypeError(INVALID_BUILD_ARGS_MESSAGE);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return entries;
}

class DockerBuildxOciLayoutExporter {
  constructor(options = {}) {
    this.executeFile = Object.hasOwn(options, EXECUTE_FILE_FIELD) ?
      options.executeFile : executeFile;
    this.dockerCommand = Object.hasOwn(options, DOCKER_COMMAND_FIELD) ?
      options.dockerCommand : DEFAULT_DOCKER_COMMAND;
    if (typeof this.executeFile !== 'function') {
      throw new TypeError(INVALID_EXECUTOR_MESSAGE);
    }
    requiredString(this.dockerCommand, DOCKER_COMMAND_FIELD);
  }

  async exportLayout(request = {}) {
    const contextPath = requiredString(request.contextPath, 'contextPath');
    const dockerfilePath = requiredString(
      request.dockerfilePath,
      'dockerfilePath',
    );
    const outputPath = requiredString(request.outputPath, 'outputPath');
    const platform = requiredString(request.platform, 'platform');
    const sourceDateEpoch = requiredEpoch(request.sourceDateEpoch);
    const output = `type=oci,dest=${outputPath},tar=false,` +
      'oci-mediatypes=true,rewrite-timestamp=true';
    const args = [
      'buildx',
      'build',
      '--file',
      dockerfilePath,
      '--platform',
      platform,
      '--provenance=false',
      '--output',
      output,
    ];
    for (const [key, value] of normalizedBuildArgs(request.buildArgs)) {
      args.push(BUILD_ARGUMENT_FLAG, `${key}=${value}`);
    }
    args.push(contextPath);
    await this.executeFile(this.dockerCommand, args, {
      env: {...process.env, SOURCE_DATE_EPOCH: String(sourceDateEpoch)},
      maxBuffer: MAXIMUM_BUILD_OUTPUT_BYTES,
      shell: false,
    });
  }
}

export {DockerBuildxOciLayoutExporter};

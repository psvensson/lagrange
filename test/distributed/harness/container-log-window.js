// A container's Docker log output, read as a stream and windowed as it
// arrives: the last maxRetainedBytes are kept (failure-bundle-log-window.js
// byte-tail mode) while every byte is counted. Peak memory is the window,
// never the log, so a failure echo or the collector's fallback cannot
// exhaust the harness on a long-running node. The complete per-node output
// is the streamed capture under .full-logs (full-node-log-capture.js).
import {finished} from 'node:stream/promises';
import {createLogTailWindow} from './failure-bundle-log-window.js';

const CONTAINER_LOG_SOURCE_PREFIX = 'container:';
const HTTP_GET = 'GET';
// dockerode's Container#logs route, dialled with isStream so the response is
// read as it arrives; follow:false makes the daemon end it at the last line.
const CONTAINER_LOG_STATUS_CODES = Object.freeze({
  200: true,
  404: 'no such container',
  500: 'server error',
});

function dialContainerLogStream(docker, containerId) {
  return new Promise((resolve, reject) => {
    docker.modem.dial({
      path: `/containers/${containerId}/logs?`,
      method: HTTP_GET,
      isStream: true,
      statusCodes: CONTAINER_LOG_STATUS_CODES,
      options: {stdout: true, stderr: true, follow: false},
    }, (error, stream) => (error ? reject(error) : resolve(stream)));
  });
}

/**
 * Read one container's log output into a byte-bounded tail window.
 * @param {Object} docker A dockerode instance.
 * @param {string} containerId
 * @param {{maxRetainedBytes: number}} options
 * @return {Promise<{lines: Array<string>, coverage: Object}>} coverage
 *   counts every byte read (retained + withheld = the whole output).
 */
async function readContainerLogWindow(docker, containerId, {maxRetainedBytes}) {
  const stream = await dialContainerLogStream(docker, containerId);
  const tailWindow = createLogTailWindow({
    maxRetainedBytes,
    source: CONTAINER_LOG_SOURCE_PREFIX + containerId,
  });
  // demuxStream writes each decoded payload synchronously from the socket's
  // data handler, so the window is fed with no intermediate queue.
  const sink = {write: (chunk) => {
    tailWindow.push(chunk);
    return true;
  }};
  docker.modem.demuxStream(stream, sink, sink);
  await finished(stream);
  return tailWindow.finish();
}

export {readContainerLogWindow};

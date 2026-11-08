// The one fake Docker daemon for container-log reads in harness tests: the
// real readers (container-log-window.js through DockerProvider and
// NodeHandle.getLogWindow) dial it, and docker-modem's own demultiplexer
// splits its multiplexed frames. No daemon is contacted.
import {Readable} from 'node:stream';
import Docker from 'dockerode';

const FRAME_HEADER_BYTES = 8;
const FRAME_LENGTH_OFFSET = 4;

export const DOCKER_STREAM = Object.freeze({STDOUT: 1, STDERR: 2});

// docker-modem's demultiplexer (never dials: no daemon is contacted).
const DOCKER_MODEM = new Docker({socketPath: '/nonexistent/docker.sock'}).modem;

/**
 * One Docker multiplexed log frame.
 * @param {number} streamType DOCKER_STREAM.STDOUT or STDERR.
 * @param {string|Buffer} payload
 * @return {Buffer}
 */
export function dockerLogFrame(streamType, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(FRAME_HEADER_BYTES);
  header[0] = streamType;
  header.writeUInt32BE(body.length, FRAME_LENGTH_OFFSET);
  return Buffer.concat([header, body]);
}

/**
 * A fake daemon whose dial answers with a log response stream.
 * @param {Array<Buffer>|function(Object): Array<Buffer>} respond the
 *   response chunks, or a function of the dial options returning them.
 * @param {Array<Object>} [dials] receives every dial's options, in order.
 * @return {{modem: Object}} usable as dockerode's `docker` for the readers.
 */
export function fakeDockerDaemon(respond, dials = []) {
  return {modem: {
    dial: (options, callback) => {
      dials[dials.length] = options;
      const chunks = typeof respond === 'function' ? respond(options) : respond;
      callback(null, Readable.from(chunks));
    },
    demuxStream: DOCKER_MODEM.demuxStream,
  }};
}

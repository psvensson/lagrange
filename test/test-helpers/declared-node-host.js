// The declared host identity (src/topology/node-host-identity.js) of the
// nodes a test starts in this process: they all run on this machine, so they
// declare its name. A test that needs a synthetic multi-host topology
// declares its own host ids instead.
import {hostname} from 'node:os';

const LOCAL_MACHINE_HOST_ID = hostname();

export {LOCAL_MACHINE_HOST_ID};

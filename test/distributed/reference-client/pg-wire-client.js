// The one constructor of pg-wire clients for the benchmark chain (adapters,
// proof observers and probes, state snapshots, the load generator). A
// server-side termination - a restarted server's FATAL 57P01, a dropped
// socket - arrives as an asynchronous 'error' event; without a listener Node
// turns it into an uncaught exception that ends the whole process. The error
// is kept on the client as evidence (`connectionError`); pg then refuses the
// client's further queries, which fail through their caller's outcome owner.
import pg from 'pg';

const {Client} = pg;

function createPgWireClient(config) {
  const client = new Client(config);
  client.on('error', (error) => {
    client.connectionError = error;
  });
  return client;
}

export {createPgWireClient};

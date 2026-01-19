import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';

const fastify = Fastify();
await fastify.register(websocket);

fastify.register(async (fastify) => {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    console.log('Client connected');
    socket.send(JSON.stringify({ type: 'hello' }));
    
    socket.on('message', (data) => {
      console.log('Received:', data.toString());
      socket.send(JSON.stringify({ type: 'echo', data: data.toString() }));
    });
    
    socket.on('close', () => {
      console.log('Client disconnected');
    });
  });
});

await fastify.listen({ port: 0 });
const port = fastify.server.address().port;
console.log('Server listening on port', port);

const ws = new WebSocket(`ws://localhost:${port}/ws`);

ws.on('open', () => {
  console.log('Connected');
});

ws.on('message', (data) => {
  console.log('Got message:', data.toString());
  ws.close();
});

ws.on('close', () => {
  console.log('Closed');
  fastify.close();
});

ws.on('error', (err) => {
  console.error('Error:', err);
});

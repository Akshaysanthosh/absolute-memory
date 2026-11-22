import { createServer } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { getConfig } from '@/server/config';
import { resolveFetchHost, validateFetchURL } from '@/server/security/safe-fetch';

/** yt-dlp sends HTTPS traffic through this proxy so all hosts, including CDNs, use checked DNS answers. */
export async function withMediaProxy<T>(maxBytes: number, run: (proxy: string) => Promise<T>) {
  const allowPrivate = getConfig().ALLOW_PRIVATE_NETWORK_FETCH;
  const sockets = new Set<Socket>();
  const server = createServer((_request, response) => response.writeHead(405).end());
  let received = 0;
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setTimeout(25_000, () => socket.destroy());
  };
  server.on('connection', track);
  server.on('connect', async (request, client, head) => {
    try {
      const authority = request.url ?? '';
      if (!/^(?:\[[\da-f:.]+\]|[a-z\d.-]+):443$/i.test(authority) || received > maxBytes)
        throw new Error('Unsupported media destination');
      const url = validateFetchURL(`https://${authority}`, allowPrivate);
      const addresses = await resolveFetchHost(url.hostname.replace(/^\[|\]$/g, ''), allowPrivate);
      if (client.destroyed) return;
      const upstream = connect({
        host: addresses[0].address,
        port: 443,
        family: addresses[0].family,
      });
      track(upstream);
      upstream.once('close', () => client.end());
      client.once('close', () => upstream.destroy());
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.on('data', (chunk) => {
        received += chunk.length;
        if (received > maxBytes) for (const socket of sockets) socket.destroy();
      });
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    }
  });
  server.maxConnections = 16;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    return await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

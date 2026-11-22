import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createLibraryClient, errorDetails } from './client.mjs';
import { localConfiguration } from './local-config.mjs';
import { createMemoryMcpServer } from './mcp-tools.mjs';

try {
  const client = createLibraryClient(await localConfiguration());
  await serveStdio(() => createMemoryMcpServer(client));
} catch (error) {
  console.error(errorDetails(error).error);
  process.exitCode = 1;
}

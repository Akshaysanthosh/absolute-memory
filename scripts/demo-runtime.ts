import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { demoEnvironment, seedDemo, startDemoProvider } from './demo-data';

function finished(child: ChildProcess) {
  return new Promise<number | null>((resolve, reject) => {
    child.once('error', reject).once('exit', resolve);
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) =>
    server.once('error', reject).listen(0, '127.0.0.1', resolve),
  );
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function prepareStandalone(runtime: string) {
  await mkdir(runtime);
  await Promise.all([
    cp('.next/standalone/server.js', resolve(runtime, 'server.js')),
    cp('.next/standalone/package.json', resolve(runtime, 'package.json')),
    cp('.next/standalone/.next', resolve(runtime, '.next'), { recursive: true }),
    cp('db', resolve(runtime, 'db'), { recursive: true }),
    symlink(resolve('.next/standalone/node_modules'), resolve(runtime, 'node_modules'), 'junction'),
    symlink(resolve('public'), resolve(runtime, 'public'), 'junction'),
  ]);
  await symlink(resolve('.next/static'), resolve(runtime, '.next/static'), 'junction');
}

async function waitForProduction(origin: string, app: ChildProcess) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (app.exitCode !== null) throw new Error('The production server stopped during startup.');
    const response = await fetch(origin + '/api/health', {
      signal: AbortSignal.timeout(1500),
    }).catch(() => null);
    if (response?.ok) return;
    await setTimeout(250);
  }
  throw new Error('The production server did not become healthy.');
}

export async function withDemo(
  capture: (
    options: Awaited<ReturnType<typeof seedDemo>> & {
      origin: string;
      password: string;
      output: string;
    },
  ) => Promise<void>,
  highlights = true,
) {
  const build = await finished(spawn('npm', ['run', 'build'], { stdio: 'inherit' }));
  if (build !== 0) throw new Error('The production build failed.');
  const scratch = await mkdtemp(resolve(tmpdir(), 'absolute-memory-demo-'));
  const runtime = resolve(scratch, 'runtime');
  const output = resolve(scratch, 'media');
  const data = resolve(scratch, 'data');
  let provider: Awaited<ReturnType<typeof startDemoProvider>> | undefined;
  let app: ChildProcess | undefined;
  let stopped: Promise<number | null> | undefined;
  try {
    provider = await startDemoProvider();
    const port = await availablePort();
    const origin = `http://127.0.0.1:${port}`;
    const env = demoEnvironment(data, origin, provider.baseURL);
    delete process.env.AM_TEST_DB;
    Object.assign(process.env, env);
    const password = randomBytes(20).toString('base64url');
    const demo = await seedDemo(data, password, highlights);
    await prepareStandalone(runtime);
    app = spawn(process.execPath, ['server.js'], {
      cwd: runtime,
      env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: String(port) },
      stdio: 'inherit',
    });
    stopped = finished(app);
    void stopped.catch(() => {});
    await waitForProduction(origin, app);
    await mkdir(output);
    await capture({ origin, password, output, ...demo });
  } finally {
    app?.kill();
    await stopped?.catch(() => {});
    await provider?.close();
    await rm(scratch, { recursive: true, force: true });
  }
}

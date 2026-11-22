import { databaseHealth } from '@/server/services/health';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const checks = await databaseHealth();
    const ready = checks.migrations && checks.vector;
    return Response.json(
      { status: ready ? 'ok' : 'unavailable', checks },
      { status: ready ? 200 : 503, headers },
    );
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers });
  }
}

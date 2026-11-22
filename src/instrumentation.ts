export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNodeRuntime } = await import('./server/jobs/startup');
    await startNodeRuntime(process.env.NEXT_PHASE);
  }
}

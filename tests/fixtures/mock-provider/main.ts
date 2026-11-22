import { startMockProvider } from './server';

void startMockProvider({
  port: Number(process.env.MOCK_PROVIDER_PORT ?? 4010),
  host: process.env.MOCK_PROVIDER_HOST,
}).then((mock) => {
  console.log(`Mock provider listening at ${mock.baseURL}`);
});

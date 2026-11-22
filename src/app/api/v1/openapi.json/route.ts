import { openapiDocument } from '@/server/http/integration-openapi';

export function GET() {
  return Response.json(openapiDocument, { headers: { 'Cache-Control': 'public, max-age=300' } });
}

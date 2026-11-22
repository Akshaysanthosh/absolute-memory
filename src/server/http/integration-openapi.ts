import { z } from 'zod';
import {
  answer,
  apiError,
  askInput,
  captureReceipt,
  highlight,
  highlightsList,
  highlightsQuery,
  id,
  integrationCaptureSchema,
  itemDetail,
  itemList,
  listQuery,
  offset,
  statusResponse,
  tagsList,
} from './integration-contracts';
import packageInfo from '../../../package.json';

function jsonSchema(schema: z.ZodType) {
  const { $schema, ...rest } = z.toJSONSchema(schema);
  return rest;
}
function json(schema: z.ZodType) {
  return { 'application/json': { schema: jsonSchema(schema) } };
}
function response(description: string, schema: z.ZodType) {
  return { description, content: json(schema) };
}
function parameters(schema: z.ZodObject) {
  return Object.entries(schema.shape).map(([name, field]) => ({
    name,
    in: 'query',
    required: false,
    schema: jsonSchema(field as z.ZodType),
  }));
}
const itemId = { name: 'id', in: 'path', required: true, schema: jsonSchema(id) };
const models = { schema: { type: 'string', format: 'binary' } };
const input = (schema: z.ZodType) => ({ required: true, content: json(schema) });
const errors = {
  '400': response('Invalid request', apiError),
  '401': response('Invalid or missing API key', apiError),
  '403': response('Insufficient key permission', apiError),
  '404': response('Resource unavailable', apiError),
  '429': response('Too many requests', apiError),
};
function read(description: string, schema: z.ZodType) {
  return { '200': response(description, schema), ...errors };
}
function saved() {
  return {
    '200': response('Already saved', captureReceipt),
    '201': response('Save accepted', captureReceipt),
    ...errors,
  };
}

export const openapiDocument = {
  openapi: '3.1.0',
  info: { title: 'Absolute Memory API', version: packageInfo.version },
  servers: [{ url: '/api/v1' }],
  security: [{ apiKey: [] }],
  components: {
    securitySchemes: {
      apiKey: {
        type: 'http',
        scheme: 'bearer',
        description: 'Use a personal API key from Settings.',
      },
    },
    schemas: { Highlight: jsonSchema(highlight) },
  },
  paths: {
    '/items': {
      get: {
        operationId: 'listItems',
        summary: 'List or search saved items',
        description: 'Requires library:read.',
        parameters: parameters(listQuery),
        responses: read('Saved items and cursor', itemList),
      },
      post: {
        operationId: 'createSave',
        summary: 'Save a URL or note',
        description: 'Requires library:write. Notes require an Idempotency-Key.',
        requestBody: input(integrationCaptureSchema),
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string', pattern: '^[A-Za-z0-9._-]{8,128}$' },
          },
        ],
        responses: { ...saved(), '409': response('Idempotency key collision', apiError) },
      },
    },
    '/items/{id}': {
      get: {
        operationId: 'getItem',
        summary: 'Read a saved item and its highlights',
        description: 'Requires library:read.',
        parameters: [
          itemId,
          { name: 'offset', in: 'query', required: false, schema: jsonSchema(offset) },
        ],
        responses: read('Item with paginated passages', itemDetail),
      },
    },
    '/files': {
      post: {
        operationId: 'uploadFile',
        summary: 'Save an original file',
        description: 'Requires library:write.',
        requestBody: { required: true, content: { 'application/octet-stream': models } },
        parameters: [
          {
            name: 'X-File-Name',
            in: 'header',
            required: true,
            description: 'URL-encoded original filename',
            schema: { type: 'string' },
          },
        ],
        responses: { ...saved(), '413': response('File too large', apiError) },
      },
    },
    '/saves/{id}': {
      get: {
        operationId: 'getSaveStatus',
        summary: 'Check import status',
        description: 'Requires the library:write key that created the save.',
        parameters: [itemId],
        responses: read('Save status', statusResponse),
      },
    },
    '/highlights': {
      get: {
        operationId: 'listHighlights',
        summary: 'List saved highlights',
        description: 'Requires library:read.',
        parameters: parameters(highlightsQuery),
        responses: read('Highlights', highlightsList),
      },
    },
    '/tags': {
      get: {
        operationId: 'listTags',
        summary: 'List library tags',
        description: 'Requires library:read.',
        responses: read('Tags', tagsList),
      },
    },
    '/ask': {
      post: {
        operationId: 'askMemory',
        summary: 'Answer from saved passages',
        description: 'Requires library:read and a configured chat provider.',
        requestBody: input(askInput),
        responses: {
          ...read('Answer and citations', answer),
          '502': response('Provider request failed', apiError),
          '503': response('Chat provider unavailable', apiError),
        },
      },
    },
    '/export': {
      get: {
        operationId: 'exportLibrary',
        summary: 'Download a library archive',
        description: 'Requires library:read.',
        responses: {
          '200': { description: 'Portable ZIP archive', content: { 'application/zip': models } },
          ...errors,
        },
      },
    },
  },
};

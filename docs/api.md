# HTTP API

The base path is `/api/v1`. The instance serves its [OpenAPI 3.1 specification](schemas/openapi-v1.json) at `/api/v1/openapi.json`. The request and response schemas in the specification are generated from the application's Zod contracts.

Use `Authorization: Bearer <key>`. Create a personal key in Settings. Give it read access for search, items, highlights, tags, answers, or export. Give it write access to create and check saves. A key's scope is limited to the account that created it.

| Method | Endpoint      | Purpose                                                                                                                                    |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/items`      | List recent saves or search with `q`. Filter with `type`, `tag`, `topic`, or `status`. Use `limit` and `cursor` to continue a result list. |
| `GET`  | `/items/{id}` | Read an item and highlights. Follow `nextOffset` to read more passages.                                                                    |
| `POST` | `/items`      | Save an article URL or a note. Notes require `Idempotency-Key`.                                                                            |
| `POST` | `/files`      | Save an original file. Send its raw bytes and the URL-encoded filename in `X-File-Name`.                                                   |
| `GET`  | `/saves/{id}` | Check the state of a save created by this key.                                                                                             |
| `GET`  | `/highlights` | List highlights. Use `itemId` to filter, `limit` to select a page size, and `nextOffset` as the next `offset`.                             |
| `GET`  | `/tags`       | List active tags and counts.                                                                                                               |
| `POST` | `/ask`        | Ask the configured provider about saved passages and get numbered reader links.                                                            |
| `GET`  | `/export`     | Stream an [export ZIP](export-format.md).                                                                                                  |

```sh
am_origin=http://localhost:3000
curl -fsS "$am_origin/api/v1/items?q=reading" \
  -H "Authorization: Bearer $ABSOLUTE_MEMORY_API_KEY"

curl -fsS "$am_origin/api/v1/items" \
  -H "Authorization: Bearer $ABSOLUTE_MEMORY_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"kind":"article","url":"https://example.org/article"}'
```

An accepted save includes its `id`, `status`, `duplicate` flag and `statusPath`. Saved media and article imports can begin as `pending` and later become `ready` or `failed`. Reader links use instance-relative paths such as `/read/<item-id>#p-2`. The highlight list returns each quote, its passage segments, and a path when anchored. Errors return an object with an `error` message.

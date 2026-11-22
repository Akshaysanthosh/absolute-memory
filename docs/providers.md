# AI providers

Absolute Memory runs without an AI provider. To enable summaries and chat, set `AI_BASE_URL` and `AI_MODEL` in the server environment, add `AI_API_KEY` if your endpoint requires it, and restart. Open **Settings → AI & providers → Test connection** to check the model with a short synthetic prompt. Keep provider keys in the server environment.

| Provider   | Chat base URL                  | Model configuration                                                                                                                                                                                                |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenAI     | `https://api.openai.com/v1`    | Choose a Chat Completions model from your account. For embeddings, set `EMBEDDINGS_MODEL=text-embedding-3-small`. [API reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create) |
| DeepSeek   | `https://api.deepseek.com`     | Use a chat model ID from the model list and set `AI_STRUCTURED_OUTPUT=json_object` if needed. Configure a separate endpoint for embeddings. [API documentation](https://api-docs.deepseek.com/)                    |
| OpenRouter | `https://openrouter.ai/api/v1` | Use the full model ID from the catalog. Verify the selected model supports the response format you configure. [API reference](https://openrouter.ai/docs/api_reference/overview)                                   |
| Ollama     | `http://127.0.0.1:11434/v1`    | Pull `llama3.1:8b` and `nomic-embed-text`, then set `AI_MODEL=llama3.1:8b` and `EMBEDDINGS_MODEL=nomic-embed-text`. [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)                       |
| LM Studio  | `http://127.0.0.1:1234/v1`     | Start the local server and copy the model IDs from its model list. Supply an API token if server authentication is enabled. [Developer documentation](https://lmstudio.ai/docs/developer)                          |

From Docker, use an address reachable from the container. `127.0.0.1` points to the container itself. With a hosted provider, the app sends the text required for the requested feature to that endpoint.

## Structured output and embeddings

The default `AI_STRUCTURED_OUTPUT=auto` tries JSON Schema first. If the endpoint rejects the format, it tries JSON object mode, then a prompt that asks for JSON. Choose `json_schema`, `json_object`, or `prompt` explicitly for providers with known format requirements.

To enable semantic search, set `EMBEDDINGS_MODEL`. You can set `EMBEDDINGS_BASE_URL` and `EMBEDDINGS_API_KEY` to use a separate service, or inherit the chat endpoint. With `EMBEDDINGS_DIMENSIONS` unset, Absolute Memory records the dimension of the first response. Set an explicit dimension only if the model supports it. The vector index supports up to 2,000 dimensions. After changing the embedding model or dimension, run `npm run absolute-memory -- reembed` from the app installation. Keyword search stays available while the worker rebuilds the vectors.

## Transcription

For Speaches or a faster-whisper server with an OpenAI-compatible API, set `TRANSCRIPTION_BASE_URL` to its `/v1` base URL and `TRANSCRIPTION_MODEL` to a model the server exposes. For example, Speaches documents `Systran/faster-distil-whisper-small.en`. Set `TRANSCRIPTION_API_KEY` if required. Absolute Memory sends WAV audio to `/audio/transcriptions` and reads timestamps when the provider returns them. [Speaches transcription guide](https://github.com/speaches-ai/speaches/blob/master/docs/usage/speech-to-text.md)

For a local Whisper.cpp server with a model already downloaded, set its inference path to the one Absolute Memory uses.

```sh
whisper-server --host 127.0.0.1 --port 8080 \
  --inference-path /v1/audio/transcriptions -m models/ggml-tiny.en.bin
```

Set `TRANSCRIPTION_BASE_URL=http://127.0.0.1:8080/v1` and `TRANSCRIPTION_MODEL=tiny.en`. In Docker, replace the address with a service name or another reachable on-network address. Keep the Whisper server on a private interface. [Whisper.cpp server options](https://github.com/ggml-org/whisper.cpp/blob/master/examples/server/README.md)

The automated suite exercises all three adapters against a local fixture server. Live checks are recorded in the [build log](BUILD-LOG.md).

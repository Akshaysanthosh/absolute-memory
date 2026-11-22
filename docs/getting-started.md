# Getting started

| Profile  | Use it for                                               | What runs                                                     |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Lite     | A personal library on one machine                        | One container with the app, worker, and embedded PGlite       |
| Standard | Multiple accounts or a deployment with separate services | Web container, worker container, and PostgreSQL with pgvector |

Docker must be running. Standard also needs the Docker Compose plugin. To build from source or use Standard, clone the repository first.

```sh
git clone https://github.com/Akshaysanthosh/absolute-memory.git
cd absolute-memory
```

## Lite

Lite runs the app, worker, and embedded PGlite database in one container. Use it for a single account or a small personal instance.

The prebuilt image will be available with the first release. See the [image command](https://github.com/Akshaysanthosh/absolute-memory#use-the-prebuilt-image) for that path. Use the following commands to build from source.

```sh
docker build -t absolute-memory:local .
docker run -d --name absolute-memory -p 127.0.0.1:3000:3000 \
  -v absolute-memory-data:/data \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  absolute-memory:local
```

Open `http://localhost:3000` and create the first owner account. The Docker command uses the `absolute-memory-data` volume for the database and originals. Keep that volume when replacing the container.

If you already have the local image, start with `docker run`. The source build downloads dependencies and media tooling.

For a port other than 3000, change the published host port and set `APP_URL` to match, for example `http://localhost:3010`. Keep the container port at 3000. To put the instance behind a reverse proxy, set `APP_URL` to its public HTTPS origin.

```sh
docker exec absolute-memory absolute-memory doctor
```

## Standard

Standard runs separate web and worker containers with PostgreSQL 17 and pgvector. Use it for multiple accounts or a larger library. Docker Compose v2.24 or newer supports the optional environment file in this project.

```sh
cp .env.example .env
```

Set `AUTH_SECRET` in `.env` to the output of `openssl rand -base64 32`. Add `POSTGRES_PASSWORD` from `openssl rand -hex 24`, and set `APP_URL` to the browser origin. Leave `DATABASE_URL` blank to use the database service.

```sh
docker compose -f docker/compose.yml up --build -d
docker compose -f docker/compose.yml ps
docker compose -f docker/compose.yml exec web absolute-memory doctor
```

The web container binds to local port 3000 by default. The worker connects to PostgreSQL and shares the file volume with the web process. Apply `docker/compose.override.example.yml` as a second Compose file for S3-compatible storage. Set the endpoint, bucket, and credentials in `.env`. To run MinIO alongside the app, build a compatible image using the upstream source instructions and set `MINIO_IMAGE` to the local tag. Add `--profile minio` when starting Compose and create the bucket through the console at `http://localhost:9001`. [MinIO source build instructions](https://github.com/minio/minio#install-from-source)

### Optional local AI

```sh
docker compose -f docker/compose.yml --profile local-ai up -d
docker compose -f docker/compose.yml exec ollama ollama pull llama3.1:8b
docker compose -f docker/compose.yml exec ollama ollama pull nomic-embed-text
```

Add the model settings to `.env` and recreate the web and worker services.

```dotenv
AI_BASE_URL=http://ollama:11434/v1
AI_MODEL=llama3.1:8b
EMBEDDINGS_MODEL=nomic-embed-text
```

See [AI providers](providers.md) for other endpoints and transcription.

## Local development

With Node 22 installed, run `npm ci` and `npm run dev`. Open `http://127.0.0.1:3000` or the origin in `APP_URL`. The development app uses PGlite and the in-process worker. Install yt-dlp and FFmpeg on `PATH` for media features, or use the image.

Run `npm run dev:mock` in another terminal for the deterministic provider on port 4010. Set `AI_BASE_URL=http://127.0.0.1:4010/v1`, `AI_MODEL=fixture`, `EMBEDDINGS_MODEL=fixture` and `EMBEDDINGS_DIMENSIONS=8` in `.env.local`, then restart the app.

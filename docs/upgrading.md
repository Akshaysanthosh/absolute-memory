# Upgrade an instance

Before replacing the image, read the [changelog](https://github.com/Akshaysanthosh/absolute-memory/blob/main/CHANGELOG.md) and take an [instance backup](backup.md). Keep the previous image tag until you have checked the upgrade.

## Lite

Build the new image with a different tag. Stop and remove the stopped container. Recreate it with the new tag, the original data volume and the original environment. Open the library to check a saved item and original file.

```sh
docker build -t absolute-memory:upgrade .
docker stop absolute-memory
docker rm absolute-memory
docker run -d --name absolute-memory -p 127.0.0.1:3000:3000 \
  -v absolute-memory-data:/data --env-file .env absolute-memory:upgrade
docker exec absolute-memory absolute-memory doctor
```

## Standard

Keep the same Compose project name and environment. Build and recreate both application services so the web process and worker use the same version.

```sh
docker compose -f docker/compose.yml stop web worker
docker compose -f docker/compose.yml up --build -d
docker compose -f docker/compose.yml ps
docker compose -f docker/compose.yml exec web absolute-memory doctor
```

Containers apply pending migrations at startup using a database lock. With `MIGRATE_ON_START=false`, run `absolute-memory migrate` before starting the upgraded services. If an upgrade fails after a migration, restore the pre-upgrade backup and previous image together. [Configuration](configuration.md)

# Back up and restore

Create a portable copy from **Settings → Export → Export everything**. Keep the downloaded ZIP in a safe location. Use this copy to restore one account on a clean instance. An instance backup also preserves accounts, invitations, sessions, job state and integration credentials. [Portable export and restore](import-export.md)

## Lite

Stop writes while copying the Docker volume. The archive contains the embedded database and originals.

```sh
docker stop absolute-memory
mkdir -p backups
docker run --rm --entrypoint tar \
  -v absolute-memory-data:/data:ro absolute-memory:local -czf - -C /data . \
  > backups/absolute-memory-data.tar.gz
docker start absolute-memory
```

Save the instance environment and auth secret separately. To restore, stop the old instance, choose a new volume, and restore into it. Start a replacement container using that volume and the same secret. Use the same app version for the first boot.

```sh
docker volume create absolute-memory-restored
docker run --rm --user root --entrypoint sh \
  -v absolute-memory-restored:/data -v "$PWD/backups:/backup:ro" absolute-memory:local \
  -c 'tar -xzf /backup/absolute-memory-data.tar.gz -C /data && chown -R node:node /data'
```

## Standard

Pause the web and worker so the database and originals represent the same point in time.

```sh
mkdir -p backups
docker compose -f docker/compose.yml stop web worker
docker compose -f docker/compose.yml exec -T db \
  pg_dump -U absolute_memory -d absolute_memory -Fc > backups/absolute-memory.pg.dump
docker compose -f docker/compose.yml run --rm --no-deps -T --user root --entrypoint tar \
  web -czf - -C /data . > backups/absolute-memory-files.tar.gz
docker compose -f docker/compose.yml start web worker
```

For S3-compatible storage, capture a point-in-time copy of the bucket alongside the database dump. Retain object keys when restoring. Keep configuration and credentials separately from the dump. Run this in a fresh Standard project using the corresponding environment and image version.

```sh
docker compose -f docker/compose.yml up -d --wait db
docker compose -f docker/compose.yml exec -T db \
  pg_restore --exit-on-error -U absolute_memory -d absolute_memory < backups/absolute-memory.pg.dump
docker compose -f docker/compose.yml run --rm --no-deps -T --user root --entrypoint sh \
  -v "$PWD/backups:/backup:ro" web \
  -c 'tar -xzf /backup/absolute-memory-files.tar.gz -C /data && chown -R node:node /data'
docker compose -f docker/compose.yml up -d
```

Verify a restored item, highlight, and original file before relying on the copy. [PostgreSQL backup and restore](https://www.postgresql.org/docs/17/backup.html)

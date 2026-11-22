# Operate an internet-facing instance

Keep the app port bound to loopback or on a private container network. Terminate HTTPS at a reverse proxy and set `APP_URL` to the public HTTPS origin. Generate a unique secret with `openssl rand -base64 32`. Store secrets in protected environment configuration.

Leave `ALLOW_SIGNUP=false` to use owner-issued invitations. Leave `ALLOW_PRIVATE_NETWORK_FETCH=false` for public capture. Use scoped personal API keys, revoke unused keys, and remove unused OAuth and SMTP configuration. Keep backups off the instance and test a restore. [Backup and restore](backup.md)

Set `TRUST_PROXY=true` only when all traffic enters through a trusted proxy that overwrites `X-Real-IP`. The Next.js request interface does not expose the socket peer address. Direct password sign-in and reset requests are limited separately by normalised email. Reset submissions also have a per-token limit. The trusted proxy adds a per-client limit. Valid integration and extension keys use their owner's limits. Invalid keys use an independent anonymous limit. Standard shares rate limits in PostgreSQL.

## Caddy

```caddyfile
memory.example.net {
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
    }
}
```

[Caddy reverse proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

## nginx

```nginx
server {
    listen 443 ssl;
    server_name memory.example.net;
    ssl_certificate /etc/ssl/memory/fullchain.pem;
    ssl_certificate_key /etc/ssl/memory/privkey.pem;

    client_max_body_size 260m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 130s;
        proxy_buffering off;
    }
}
```

The body limit accommodates the default backup import cap. Adjust it when the upload setting requires a larger limit. Supply a trusted TLS certificate and configure HTTP-to-HTTPS redirection separately. [nginx proxy documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)

Finishing a password reset signs out existing sessions and revokes personal API keys and extension connections. The CLI issues a reset URL, and revocation happens when the user completes the reset. New API keys expire in 90 days by default. Select **No expiry (revoke manually)** to create a permanent key.

Only the instance owner can run provider connection tests or view provider model identifiers. Other signed-in accounts can see which capabilities are available.

Uploads and ZIP entries are streamed with configurable size and count limits. An account can have one import and one export in progress. [Transfer limits](import-export.md)

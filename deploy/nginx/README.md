# nginx config for komyut.online

Snapshot of the live droplet's nginx config so the work isn't lost if
the server is rebuilt.

## Files

- `komyut.online.conf` — site server block. Lives on the droplet at
  `/etc/nginx/sites-enabled/sasakay` AND `/etc/nginx/sites-available/sasakay`
  (the deployed file is NOT a symlink — both must be updated together).
- `rate-limits.conf` — per-IP rate-limit zones used by the site
  config. Lives on the droplet at `/etc/nginx/conf.d/rate-limits.conf`.

## What's in here

- TLS via Let's Encrypt (managed by certbot — leave the certbot lines alone).
- Per-IP rate limit: 30 r/s, burst 60, returns 429 over budget.
- Security headers: HSTS, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy (geolocation=self only), CSP locked to self +
  CARTO basemap CDN, X-Frame-Options DENY.
- Cache-Control rules: SW + manifest no-cache, hashed assets 1y immutable,
  json/geojson revalidate.
- SPA fallback `try_files $uri $uri/ /index.html`.
- HTTP→HTTPS redirect.

## To restore on a fresh droplet

```bash
# Install nginx + certbot, then:
sudo cp deploy/nginx/rate-limits.conf /etc/nginx/conf.d/
sudo cp deploy/nginx/komyut.online.conf /etc/nginx/sites-available/sasakay
sudo ln -sf /etc/nginx/sites-available/sasakay /etc/nginx/sites-enabled/sasakay
sudo certbot --nginx -d komyut.online -d www.komyut.online   # rewrites the file in place
sudo nginx -t && sudo systemctl reload nginx
```

Certbot's first run will rewrite `komyut.online.conf` to inject the
SSL listener + cert paths. After that, edits to the file should be
mirrored back into this repo.

## To push a config change to the live server

```bash
scp -i ~/.ssh/bytebento deploy/nginx/komyut.online.conf root@129.212.229.226:/etc/nginx/sites-available/sasakay
scp -i ~/.ssh/bytebento deploy/nginx/komyut.online.conf root@129.212.229.226:/etc/nginx/sites-enabled/sasakay
ssh -i ~/.ssh/bytebento root@129.212.229.226 "nginx -t && systemctl reload nginx"
```

(Both paths must be written because sites-enabled isn't a symlink on this droplet.)

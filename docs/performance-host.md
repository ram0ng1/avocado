# Performance no servidor

Recomendações para o operador do host extraídas do README principal.

O Avocado já entrega vários ganhos do lado do tema (lazy-load por rota com
`webpackPrefetch`, CSS crítico inline, async-CSS, `Vary` + `nosniff` via
middleware). Esses ganhos só rendem 100% quando o operador do forum
configura o servidor HTTP corretamente. O Lighthouse típico reporta
**~1 MB de "Sem compressão de texto"** quando estes ajustes faltam.

### nginx

Cole dentro do `server { … }` que serve seu forum (`/etc/nginx/sites-available/forum.conf`):

```nginx
# 1. Compressão de texto — ganho típico ~1 MB no transfer size.
gzip on;
gzip_vary on;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_types
  application/javascript application/json application/xml
  text/css text/plain text/xml image/svg+xml font/ttf font/otf
  application/manifest+json;

# brotli (se o módulo nginx-brotli estiver compilado — recomendado em 2026):
# brotli on;
# brotli_comp_level 5;
# brotli_types
#   application/javascript application/json application/xml
#   text/css text/plain text/xml image/svg+xml font/ttf font/otf
#   application/manifest+json;

# 2. Cache longo para assets versionados — o webpack injeta hash no nome
# (forum-<hash>.js), então max-age=1 ano + immutable é seguro.
location ~* ^/assets/(.+)-[0-9a-f]{8,}\.(?:js|css|svg|woff2?|ttf|otf|png|jpg|jpeg|webp|avif)$ {
  expires 1y;
  add_header Cache-Control "public, immutable, max-age=31536000";
  access_log off;
}

# 3. Cache moderado para o resto da pasta /assets/ (favicon, manifests).
location /assets/ {
  expires 7d;
  add_header Cache-Control "public, max-age=604800";
}

# 4. HTTP/2 — já ativo se você usa Let's Encrypt + certbot recente.
# listen 443 ssl http2;
```

Reload:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

### Apache (`.htaccess` na raiz do forum)

```apache
# 1. Compressão gzip via mod_deflate
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE application/javascript application/json application/xml
  AddOutputFilterByType DEFLATE text/css text/plain text/xml image/svg+xml
  AddOutputFilterByType DEFLATE font/ttf font/otf application/manifest+json
</IfModule>

# 2. brotli (se mod_brotli disponível)
<IfModule mod_brotli.c>
  AddOutputFilterByType BROTLI_COMPRESS application/javascript application/json
  AddOutputFilterByType BROTLI_COMPRESS text/css text/plain image/svg+xml
</IfModule>

# 3. Cache longo para assets versionados
<IfModule mod_headers.c>
  <FilesMatch "-[0-9a-f]{8,}\.(?:js|css|svg|woff2?|ttf|otf|png|jpg|jpeg|webp|avif)$">
    Header set Cache-Control "public, immutable, max-age=31536000"
  </FilesMatch>
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType text/css                "access plus 1 year"
  ExpiresByType image/svg+xml           "access plus 30 days"
  ExpiresByType image/webp              "access plus 30 days"
  ExpiresByType font/woff2              "access plus 1 year"
</IfModule>
```

### Verificando que funcionou

```sh
# Compressão ativa?
curl -sI -H "Accept-Encoding: gzip, br" https://seu-forum.example/assets/forum.js \
  | grep -iE "content-encoding|content-length"
# Esperado: content-encoding: br  (ou gzip)

# Cache headers nos assets?
curl -sI https://seu-forum.example/assets/forum-abc12345.js \
  | grep -iE "cache-control|expires"
# Esperado: cache-control: public, immutable, max-age=31536000
```

### Outras dicas (host)

- **opcache do PHP** em produção: `opcache.enable=1`, `opcache.validate_timestamps=0` (revalida a cada deploy via `php flarum cache:clear`).
- **HTTP/2** na origin (já é default em nginx 1.25+ com SSL).
- **CDN** para `/assets/` se o forum atende internacional — qualquer CDN respeita os headers `Cache-Control: immutable` acima e descarrega o origin server.

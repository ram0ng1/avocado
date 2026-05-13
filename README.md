<p align="center">
  <img src="icon.svg" width="80" alt="Avocado">
  <h1 align="center">Avocado</h1>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square">
  <a href="https://packagist.org/packages/ramon/avocado">
    <img alt="Latest Stable Version" src="https://img.shields.io/packagist/v/ramon/avocado.svg?style=flat-square">
  </a>
  <a href="https://packagist.org/packages/ramon/avocado">
    <img alt="Total Downloads" src="https://img.shields.io/packagist/dt/ramon/avocado.svg?style=flat-square">
  </a>
  <a href="https://github.com/ram0ng1/avocado/actions/workflows/release-management.yml">
    <img alt="Release Workflow" src="https://github.com/ram0ng1/avocado/actions/workflows/release-management.yml/badge.svg?style=flat-square">
  </a>
  <a href="https://github.com/ram0ng1/avocado/releases/latest">
    <img alt="GitHub Release" src="https://img.shields.io/github/v/release/ram0ng1/avocado?style=flat-square&label=release&color=success">
  </a>
  <a href="https://donate.stripe.com/fZe5o66nebkf39S28a">
    <img alt="Donate" src="https://img.shields.io/badge/donate-stripe-%236772E5?style=flat-square">
  </a>
</p>

<p align="center">
  A modern, feature-rich <a href="https://flarum.org">Flarum</a> theme featuring advanced search capabilities, real-time messaging integration, comprehensive multi-language support, hero banners, tag colors, social sharing, and more. Originally forked from <a href="https://github.com/afrux/asirem">Asirem</a> by <a href="https://github.com/afrux">Afrux</a>, now significantly enhanced with new features and improvements.
</p>

---

## Features

- **Hero Banner** — Upload and position a custom banner image at the top of your forum (auto-scaled to 1400px, converted to WebP)
- **Tag Colors** — Discussion list items styled with tag colors and unread indicators
- **Share Button** — Native Web Share API on mobile; clipboard fallback on desktop
- **Action Icons** — Optional Font Awesome icons on Like and Reply buttons
- **Tags Page** — Custom tile and cloud view for the tags page
- **V1 Search Bar** — Toggle between the classic dropdown search and the default modal

## Requirements

- Flarum `^2.0.0`

## Installation

```sh
composer require ramon/avocado
```

## Updating

```sh
composer update ramon/avocado --with-dependencies
php flarum cache:clear
```

## Configuration

All settings are available in the admin panel under the Avocado extension:

| Setting | Description | Default |
|---|---|---|
| Hero Image | Upload a banner image for the forum header | — |
| Hero Image Position | CSS `background-position` value | `center top` |
| V1 Search Bar | Use classic dropdown search instead of modal | `true` |
| Show Share Button | Display share button on posts | `true` |
| Show Action Icons | Show icons on Like and Reply buttons | `true` |
| Fixed Avatar Effect | Keep comment avatars sticky while reading posts on desktop | `true` |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/avocado/banner` | Upload hero banner image |
| `DELETE` | `/api/avocado/banner` | Remove hero banner image |

## Performance — recomendações para o operador do host

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

## Links

- [GitHub](https://github.com/ram0ng1/avocado)
- [Issues](https://github.com/ram0ng1/avocado/issues)
- [Discuss](https://discuss.flarum.org/d/35041-colored-an-extension-to-color-elements-based-on-tag-colors/37)
- [Donate](https://donate.stripe.com/fZe5o66nebkf39S28a)

## Authors

- [Ramon Guilherme](https://ramonguilherme.com.br)
- [Sami Mazouz](https://www.buymeacoffee.com/sycho) — original Asirem theme

## License

[MIT](LICENSE.md)

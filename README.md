<p align="center">
  <img src="https://raw.githubusercontent.com/ram0ng1/avocado/refs/heads/master/icon.svg" width="80" height="80" alt="Avocado">
</p>

<h1 align="center">Avocado</h1>

<p align="center">
  <a href="https://github.com/ram0ng1/avocado/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/ram0ng1/avocado/ci.yml?branch=master&style=flat-square&label=ci"></a>
  <a href="https://packagist.org/packages/ramon/avocado"><img alt="Packagist" src="https://img.shields.io/packagist/v/ramon/avocado?style=flat-square&label=packagist"></a>
  <a href="https://packagist.org/packages/ramon/avocado"><img alt="Downloads" src="https://img.shields.io/packagist/dt/ramon/avocado?style=flat-square"></a>
  <img alt="Flarum" src="https://img.shields.io/badge/flarum-2.x-e7672e?style=flat-square">
  <a href="LICENSE.md"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <a href="https://donate.stripe.com/fZe5o66nebkf39S28a"><img alt="Donate" src="https://img.shields.io/badge/donate-stripe-6772E5?style=flat-square"></a>
</p>

<p align="center">A modern theme for Flarum 2, grown out of Asirem.</p>

Avocado started as a fork of the excellent <a href="https://github.com/afrux/asirem">Asirem</a> by Afrux and kept walking from there. Today it is a full theme with its own search experience, hero banners, tag colored discussion lists and a pile of small touches that make a forum feel finished.

It is also the theme I run in production, so performance is treated as a feature: route based lazy loading, critical CSS inlined, async stylesheets and WebP conversion for banners.

## What it does

- Hero banner with upload and positioning, auto scaled and converted to WebP
- Discussion list tinted with tag colors, including unread indicators
- Advanced search page plus an optional classic dropdown search bar
- Native share button, with the Web Share API on mobile and clipboard fallback
- Custom tags page with tile and cloud views
- Optional icons on Like and Reply buttons, sticky avatars while reading, and more

## Installation

```sh
composer require ramon/avocado
php flarum cache:clear
```

Enable Avocado on the Extensions page. Every setting is in the admin panel with a description next to it.

## Squeezing the most out of it

The theme does its part, but text compression and cache headers live on your web server. If Lighthouse complains about uncompressed text, follow the nginx and Apache recipes in [docs/performance-host.md](docs/performance-host.md).

## Credits

Original Asirem theme by <a href="https://www.buymeacoffee.com/sycho">Sami Mazouz</a>. Avocado is maintained by <a href="https://ramonguilherme.com.br">Ramon Guilherme</a>.

## License

[MIT](LICENSE.md). Ideas and bug reports are welcome on the [issue tracker](https://github.com/ram0ng1/avocado/issues).

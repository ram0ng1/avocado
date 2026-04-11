const config = require('flarum-webpack-config')();

// Use named module IDs to avoid numeric ID collisions with other Flarum extensions.
// Numeric IDs (webpack default) can clash with IDs registered by flarum/tags or
// other extensions in the shared webpackChunkmodule_exports global, causing
// "s[t] is not a function" errors when async chunks are loaded.
config.optimization = config.optimization || {};
config.optimization.moduleIds = 'named';

module.exports = config;

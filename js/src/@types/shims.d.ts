// Ambient declarations for Avocado theme.
//
// Most Flarum imports resolve via the `flarum/*` path mapping in tsconfig.json
// (pointing to ../../../vendor/flarum/core/js/dist-typings). The shims below
// cover globals exposed at runtime that aren't surfaced by any module:
//
//   - `flarum`          → ambient namespace seeded by core's bootstrap
//   - `m`               → Mithril global injected via webpack's externals
//   - `$`               → jQuery global from core
//
// And they export the JSX namespace so .tsx files don't need per-file shims
// when imported types ride through `any`-typed Flarum components.

declare const flarum: {
  reg: {
    asyncModuleImport(id: string): Promise<{ default: any }>;
    addChunkModule(id: string, mod: any): void;
    onLoad(id: string, callback: () => void): void;
  };
  extensions: Record<string, unknown>;
  [key: string]: any;
};

declare const m: any;
declare const $: any;

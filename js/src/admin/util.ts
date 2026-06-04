/*
 * Shared helpers for the admin settings UI. Kept deliberately small and
 * loosely typed: most admin components accept one-off `attrs` shapes that would
 * just duplicate the schema already declared in extend.php. New code should
 * still declare proper `attrs` interfaces where it can.
 */
import app from 'flarum/admin/app';
import Component, { ComponentAttrs } from 'flarum/common/Component';

/**
 * Most admin components accept arbitrary attrs (settingKey, label, help, …).
 * Extending ComponentAttrs with an index signature keeps individual
 * `this.attrs.settingKey` reads typed as `any` rather than triggering
 * "Property does not exist on ComponentAttrs".
 */
export type LooseAttrs = ComponentAttrs & Record<string, any>;

/** Base class for the admin controls so the type-loosening lives in one place. */
export abstract class AdminComponent<A extends LooseAttrs = LooseAttrs> extends Component<A> {}

/** Settings are stored as untyped strings in Flarum core; cast once instead of per-call. */
export const settings = (): Record<string, any> => (app.data as any).settings;

// ─── Translation helper ───────────────────────────────────────────────────────
export const trans = (key: string, fallback: string, params: Record<string, any> = {}): string => {
  // `extract: true` força a Translator.trans devolver string em vez de
  // NestedStringArray (Mithril children); sem isso o typeof string é sempre
  // falso e caímos no fallback inglês, quebrando a troca de locale.
  const out = app.translator?.trans(key, params, true);
  if (typeof out === 'string' && out !== key) return out;
  return Object.entries(params).reduce<string>((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)), fallback);
};

// ─── URL helpers ──────────────────────────────────────────────────────────────
export const normalizePath = (path: string): string =>
  String(path)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .split('/')
    .filter((seg, i) => {
      if (seg === '.' || seg === '') return i === 0;
      if (seg === '..') return false;
      return true;
    })
    .join('/');

export const resolveAssetUrl = (assetPath: string | null | undefined): string | null => {
  if (!assetPath) return null;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetPath)) return null;
  const normalized = normalizePath(assetPath);
  const base = (app.forum.attribute<string>('assetsBaseUrl') as string) || app.forum.attribute<string>('baseUrl') + '/assets';
  return base.replace(/\/+$/, '') + '/' + normalized;
};

// ─── Settings helpers ─────────────────────────────────────────────────────────
export const getBool = (key: string): boolean => {
  const v = settings()[key];
  return v === true || v === 'true' || v === '1' || v === 1;
};

export const getStr = (key: string, def = ''): string => String(settings()[key] ?? def);

// Direct-save to API (used by all custom controls)
export const saveSetting = (payload: Record<string, any>) => {
  const apiUrl = ((app.forum.attribute<string>('apiUrl') as string) || '/api').replace(/\/+$/, '');
  return app.request({ method: 'POST', url: `${apiUrl}/settings`, body: payload });
};

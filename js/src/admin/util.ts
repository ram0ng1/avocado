/*
 * Helpers do admin. Tipagem frouxa de propósito: interfaces de attrs só
 * repetiriam o schema já declarado no extend.php.
 */
import app from 'flarum/admin/app';
import Component, { ComponentAttrs } from 'flarum/common/Component';

/**
 * Index signature para `this.attrs.x` sair `any` em vez de erro de
 * propriedade inexistente em ComponentAttrs.
 */
export type LooseAttrs = ComponentAttrs & Record<string, any>;

/** Base class for the admin controls so the type-loosening lives in one place. */
export abstract class AdminComponent<A extends LooseAttrs = LooseAttrs> extends Component<A> {}

/** O core guarda as settings como strings sem tipo: o cast fica num lugar só. */
export const settings = (): Record<string, any> => (app.data as any).settings;

export const trans = (key: string, fallback: string, params: Record<string, any> = {}): string => {
  // `extract: true` faz o trans devolver string em vez de NestedStringArray; sem
  // isso o teste de string falha e tudo cai no fallback inglês.
  //
  // O try/catch é obrigatório: o formatter ICU do Flarum lança SyntaxError com
  // tradução de tags desbalanceadas, e uma string quebrada derrubaria a página.
  try {
    const out = app.translator?.trans(key, params, true);
    if (typeof out === 'string' && out !== key) return out;
  } catch (e) {
    console.warn(`[avocado] invalid translation for "${key}"; falling back to the English default.`, e);
  }
  return Object.entries(params).reduce<string>((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)), fallback);
};

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

export const getBool = (key: string): boolean => {
  const v = settings()[key];
  return v === true || v === 'true' || v === '1' || v === 1;
};

export const getStr = (key: string, def = ''): string => String(settings()[key] ?? def);

// Os controles gravam direto na API, sem o botão Salvar.
export const saveSetting = (payload: Record<string, any>) => {
  const apiUrl = ((app.forum.attribute<string>('apiUrl') as string) || '/api').replace(/\/+$/, '');
  return app.request({ method: 'POST', url: `${apiUrl}/settings`, body: payload });
};

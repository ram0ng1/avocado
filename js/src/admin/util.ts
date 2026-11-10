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

type SaveState = { state: 'saving' | 'saved' | 'error'; message?: string };

/** Estado do último salvamento de cada chave, mostrado ao lado do rótulo. */
const saveStates: Record<string, SaveState> = {};
const clearTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/** O último valor que o servidor confirmou: é para ele que o campo volta se a gravação falhar. */
let confirmed: Record<string, any> | null = null;

export const saveStateOf = (key: string): SaveState | undefined => saveStates[key];

/** Guarda as configurações como vieram do servidor (no boot do admin). */
export const rememberConfirmedSettings = (): void => {
  confirmed = { ...settings() };
};

/** Id estável do campo de uma configuração, para ligar `<label for>`. */
export const fieldId = (key: string): string => `avocado-setting-${key.replace(/[^a-z0-9_-]/gi, '-')}`;

/** Chamado assim que o valor muda, antes da gravação adiada dos campos de texto. */
export const markSaving = (key: string): void => {
  clearTimeout(clearTimers[key]);
  saveStates[key] = { state: 'saving' };
};

// Os controles gravam direto na API, sem o botão Salvar: cada chave mostra
// "Salvando…" e "Salvo", e volta ao valor anterior se o servidor recusar.
export const saveSetting = (payload: Record<string, any>) => {
  const apiUrl = ((app.forum.attribute<string>('apiUrl') as string) || '/api').replace(/\/+$/, '');
  const keys = Object.keys(payload);

  keys.forEach(markSaving);

  return app
    .request({ method: 'POST', url: `${apiUrl}/settings`, body: payload, errorHandler: () => {} })
    .then((response) => {
      keys.forEach((key) => {
        (confirmed as Record<string, any>)[key] = payload[key];
        saveStates[key] = { state: 'saved' };
        clearTimers[key] = setTimeout(() => {
          delete saveStates[key];
          m.redraw();
        }, 2500);
      });
      m.redraw();

      return response;
    })
    .catch((error: any) => {
      const reasons = (error?.status === 422 ? (error.response?.errors ?? []) : []).map((e: any) => e?.detail).filter(Boolean);
      keys.forEach((key) => {
        if (confirmed && key in confirmed) settings()[key] = confirmed[key];
        saveStates[key] = {
          state: 'error',
          message: reasons.join(' ') || trans('ramon-avocado.admin.save_failed', 'Couldn’t save. Check your connection and try again.'),
        };
      });
      m.redraw();

      throw error;
    });
};

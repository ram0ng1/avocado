import app from 'flarum/forum/app';
import { trans } from '../utils';

/**
 * Toggle de bookmark (discussão salva) com UI otimista.
 *
 * Existem dois provedores possíveis e o tema fala com um só por vez:
 *
 * - **fof/bookmarks**, quando a extensão está ativa. Ela é um sistema de
 *   bookmarks dedicado (discussões e posts), então o tema cede: a UI própria
 *   some (item de menu, nota, lembrete, página "Salvos") e o botão do card passa
 *   a gravar no campo `bookmarked` dela, que é writable — `Model.save()` já faz
 *   o otimismo e o rollback. Nada de dado do Avocado é apagado: a tabela
 *   `avocado_bookmarks` fica dormente e volta a valer se o fof for desativado.
 * - **Avocado**, o sistema próprio (nota + lembrete + notificação), em
 *   `avocado_bookmarks`. A discussão carrega o atributo read-only
 *   `avocadoBookmarked`; viramos ele localmente para resposta instantânea e
 *   POST/DELETE no endpoint dedicado. Se falhar, desfaz e alerta (CLAUDE.md
 *   §40.2) — nunca engole o erro.
 *
 * `pending` deduplica cliques concorrentes por id de discussão. Guarda só ids em
 * voo (transitório, não dado de usuário), então o Set no módulo é seguro.
 */
const pending = new Set<string>();

/** Chave do filtro de busca — prefixada para não colidir com o fof/bookmarks. */
export const BOOKMARKED_FILTER_KEY = 'avocadoBookmarked';

/** Path da página "Salvos" do tema. Só existe quando o fof/bookmarks não está ativo. */
export const BOOKMARKS_PATH = '/bookmarks';

const FOF_BOOKMARKS_ID = 'fof-bookmarks';

/** Atributo do fof/bookmarks na discussão — writable, ao contrário do nosso. */
const FOF_BOOKMARKED_ATTRIBUTE = 'bookmarked';

/**
 * O fof/bookmarks está no comando?
 *
 * `flarum.extensions` lista o que está ativo e já está completo quando os
 * initializers rodam (bootExtensions vem antes de boot), diferente de
 * `app.forum`, que só é hidratado depois. É o que permite decidir a rota.
 */
export function usesFofBookmarks(): boolean {
  return FOF_BOOKMARKS_ID in ((flarum as any)?.extensions ?? {});
}

/** O tema mostra alguma UI de salvar? (própria ou pilotando o fof) */
export function bookmarksEnabled(): boolean {
  return usesFofBookmarks() || avocadoBookmarksEnabled();
}

/**
 * O sistema PRÓPRIO do tema está no comando? Só então existem nota, lembrete,
 * notificação de lembrete e a página "Salvos" do Avocado.
 */
export function avocadoBookmarksEnabled(): boolean {
  return !usesFofBookmarks() && !!app.forum?.attribute?.('avocadoBookmarksEnabled');
}

/**
 * Nome da rota da página "Salvos" — a do fof quando ele está no comando, já que
 * é a página dele que o tema assume (index.tsx troca só o componente).
 */
export function bookmarksRouteName(): string {
  return usesFofBookmarks() ? FOF_BOOKMARKS_ID : 'avocado-bookmarks';
}

/**
 * Rótulo da ação de salvar. Cedendo ao fof/bookmarks o tema fala a língua dele
 * ("Bookmark" / "Bookmarked", das chaves fof-bookmarks.forum.*), para que card,
 * dropdown, botão da sidebar e página digam todos a mesma coisa.
 */
export function bookmarkActionLabel(saved: boolean): string {
  if (usesFofBookmarks()) {
    return fofTrans(`independentButton.${saved ? 'remove' : 'add'}`, saved ? 'Bookmarked' : 'Bookmark');
  }

  return saved
    ? (trans('ramon-avocado.forum.bookmarks.unsave', 'Remove from saved') as string)
    : (trans('ramon-avocado.forum.bookmarks.save', 'Save') as string);
}

/** Título da página "Salvos" — idem: com o fof ativo é o título dele. */
export function bookmarksPageTitle(): string {
  return usesFofBookmarks() ? fofTrans('page.title', 'Bookmarks') : (trans('ramon-avocado.forum.bookmarks.title', 'Saved') as string);
}

/**
 * O admin já escolheu mostrar o bookmark do post no menu ⋯ da extensão? Nesse
 * caso o tema não põe o dele — seria item duplicado.
 */
export function fofPostButtonInMenu(): boolean {
  return app.forum?.attribute?.('fof-bookmarks.postButtonPosition') === 'menu';
}

/** Uma tradução do fof/bookmarks, com o texto em inglês dele como fallback. */
export function fofTrans(key: string, fallback: string): string {
  const translated = app.translator?.trans(`fof-bookmarks.forum.${key}`, {}, true);

  return typeof translated === 'string' && translated !== `fof-bookmarks.forum.${key}` ? translated : fallback;
}

export function isBookmarked(discussion: any): boolean {
  const attribute = usesFofBookmarks() ? FOF_BOOKMARKED_ATTRIBUTE : 'avocadoBookmarked';

  return !!discussion?.attribute?.(attribute);
}

export function bookmarkNote(discussion: any): string {
  return (discussion?.attribute?.('avocadoBookmarkNote') || '') as string;
}

export function bookmarkRemindAt(discussion: any): Date | null {
  const raw = discussion?.attribute?.('avocadoBookmarkRemindAt');
  if (!raw) return null;
  const date = new Date(raw as string);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Persists note/reminder for the actor's bookmark (upsert — saves the
 * discussion when it wasn't saved yet). Mirrors the server response back into
 * the discussion model so cards/modals re-render with authoritative values.
 * Errors are re-thrown so the calling UI (modal) can keep its own state.
 */
export function updateBookmark(discussion: any, payload: { note?: string | null; remindAt?: string | null }): Promise<void> {
  const id = String(discussion?.id?.() || '');
  if (!id) return Promise.reject(new Error('missing discussion id'));

  return app
    .request({
      method: 'PATCH',
      url: `${apiUrl()}/avocado/bookmark`,
      body: { discussionId: Number(id), ...payload },
    })
    .then((response: any) => {
      discussion.pushData({
        attributes: {
          avocadoBookmarked: true,
          avocadoBookmarkNote: response?.note ?? null,
          avocadoBookmarkRemindAt: response?.remindAt ?? null,
        },
      });
      m.redraw();
    });
}

export function toggleBookmark(discussion: any): void {
  if (!bookmarksEnabled()) return;

  if (!app.session.user) {
    app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'));

    return;
  }

  const id = String(discussion?.id?.() || '');
  if (!id || pending.has(id)) return;

  if (usesFofBookmarks()) {
    toggleFofBookmark(discussion, id);

    return;
  }

  toggleAvocadoBookmark(discussion, id);
}

function apiUrl(): string {
  return ((app.forum.attribute<string>('apiUrl') as string) || '/api').replace(/\/+$/, '');
}

/** `Model.save()` já aplica o valor na hora e desfaz sozinho se a request falhar. */
function toggleFofBookmark(discussion: any, id: string): void {
  pending.add(id);

  discussion
    .save({ [FOF_BOOKMARKED_ATTRIBUTE]: !isBookmarked(discussion) })
    .then(() => {
      pending.delete(id);
      m.redraw();
    })
    .catch(() => {
      pending.delete(id);
      app.alerts.show({ type: 'error' }, trans('ramon-avocado.forum.bookmarks.toggle_error', 'Could not update your saved list. Please try again.'));
      m.redraw();
    });
}

function toggleAvocadoBookmark(discussion: any, id: string): void {
  const current = isBookmarked(discussion);
  const next = !current;

  pending.add(id);
  setAvocadoBookmarked(discussion, next);
  m.redraw();

  app
    .request({
      method: next ? 'POST' : 'DELETE',
      url: `${apiUrl()}/avocado/bookmark`,
      body: { discussionId: Number(id) },
    })
    .then(() => {
      pending.delete(id);
      m.redraw();
    })
    .catch(() => {
      setAvocadoBookmarked(discussion, current);
      pending.delete(id);
      app.alerts.show({ type: 'error' }, trans('ramon-avocado.forum.bookmarks.toggle_error', 'Could not update your saved list. Please try again.'));
      m.redraw();
    });
}

function setAvocadoBookmarked(discussion: any, value: boolean): void {
  const attributes: Record<string, unknown> = { avocadoBookmarked: value };

  if (!value) {
    attributes.avocadoBookmarkNote = null;
    attributes.avocadoBookmarkRemindAt = null;
  }

  discussion.pushData({ attributes });
}

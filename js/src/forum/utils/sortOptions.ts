import { trans } from '../utils';
import type { SortOption } from '../components/shared/SortDropdown';

/**
 * Opções de ordenação das listas. As mesmas chaves valem em toda página; cada
 * uma escolhe o subconjunto pelos helpers abaixo.
 */
const ALL_DISCUSSION_OPTIONS: SortOption[] = [
  { key: 'relevance', label: () => trans('ramon-avocado.forum.search.sort_relevance', 'Relevance') },
  { key: 'latest', label: () => trans('ramon-avocado.forum.search.sort_latest', 'Latest'), sort: '-lastPostedAt' },
  { key: 'top', label: () => trans('ramon-avocado.forum.search.sort_top', 'Top'), sort: '-commentCount' },
  { key: 'newest', label: () => trans('ramon-avocado.forum.search.sort_newest', 'Newest'), sort: '-createdAt' },
  { key: 'oldest', label: () => trans('ramon-avocado.forum.search.sort_oldest', 'Oldest'), sort: 'createdAt' },
  { key: 'trending', label: () => trans('ramon-avocado.forum.home.sort_trending', 'Trending'), sort: '-lastPostedAt' },
];

const ALL_POST_OPTIONS: SortOption[] = [
  { key: 'relevance', label: () => trans('ramon-avocado.forum.search.sort_relevance', 'Relevance') },
  { key: 'newest', label: () => trans('ramon-avocado.forum.search.sort_newest', 'Newest') },
  { key: 'oldest', label: () => trans('ramon-avocado.forum.search.sort_oldest', 'Oldest') },
];

/** Opções por chave; chaves desconhecidas são ignoradas. */
function pickOptions(source: SortOption[], keys: string[]): SortOption[] {
  return keys.map((key) => source.find((o) => o.key === key)).filter((o): o is SortOption => !!o);
}

/** Todas as discussões e página de tag. */
export const DISCUSSION_LIST_SORT: SortOption[] = pickOptions(ALL_DISCUSSION_OPTIONS, ['latest', 'top', 'newest', 'oldest']);

/** Seção de populares da home (com trending). */
export const HOME_FEED_SORT: SortOption[] = pickOptions(ALL_DISCUSSION_OPTIONS, ['latest', 'top', 'newest', 'oldest', 'trending']);

/** Aba de discussões da busca (relevância primeiro). */
export const DISCUSSION_SEARCH_SORT: SortOption[] = pickOptions(ALL_DISCUSSION_OPTIONS, ['relevance', 'latest', 'top', 'newest', 'oldest']);

/** Aba de posts da busca. */
export const POST_SEARCH_SORT: SortOption[] = ALL_POST_OPTIONS;

/** Rótulo traduzido de uma chave, para quando as chaves vêm do `sortMap()` do backend. */
export function getSortLabel(key: string): string {
  const found = ALL_DISCUSSION_OPTIONS.find((o) => o.key === key) || ALL_POST_OPTIONS.find((o) => o.key === key);
  if (!found) return key;
  return typeof found.label === 'function' ? found.label() : found.label;
}

/** Chave (`'latest'`) → parâmetro JSON:API (`'-lastPostedAt'`); `-lastPostedAt` se desconhecida. */
export function resolveSortParam(key: string): string {
  const found = ALL_DISCUSSION_OPTIONS.find((o) => o.key === key);
  return found?.sort || '-lastPostedAt';
}

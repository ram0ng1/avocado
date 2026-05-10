import { trans } from '../utils';
import type { SortOption } from '../components/shared/SortDropdown';

/**
 * Shared sort options for discussion / post listings.
 *
 * The same option keys (`latest`, `top`, `newest`, `oldest`, `trending`,
 * `relevance`) are used by every Avocado list page. Pages pick the subset
 * that applies to their context via the helpers below.
 */
const ALL_DISCUSSION_OPTIONS: SortOption[] = [
  { key: 'relevance', label: () => trans('ramon-avocado.forum.search.sort_relevance', 'Relevance') },
  { key: 'latest',    label: () => trans('ramon-avocado.forum.search.sort_latest',    'Latest'),    sort: '-lastPostedAt' },
  { key: 'top',       label: () => trans('ramon-avocado.forum.search.sort_top',       'Top'),       sort: '-commentCount' },
  { key: 'newest',    label: () => trans('ramon-avocado.forum.search.sort_newest',    'Newest'),    sort: '-createdAt' },
  { key: 'oldest',    label: () => trans('ramon-avocado.forum.search.sort_oldest',    'Oldest'),    sort: 'createdAt' },
  { key: 'trending',  label: () => trans('ramon-avocado.forum.home.sort_trending',    'Trending'),  sort: '-lastPostedAt' },
];

const ALL_POST_OPTIONS: SortOption[] = [
  { key: 'relevance', label: () => trans('ramon-avocado.forum.search.sort_relevance', 'Relevance') },
  { key: 'newest',    label: () => trans('ramon-avocado.forum.search.sort_newest',    'Newest') },
  { key: 'oldest',    label: () => trans('ramon-avocado.forum.search.sort_oldest',    'Oldest') },
];

/**
 * Build a list of sort options by key. Unknown keys are silently dropped.
 */
function pickOptions(source: SortOption[], keys: string[]): SortOption[] {
  return keys
    .map((key) => source.find((o) => o.key === key))
    .filter((o): o is SortOption => !!o);
}

/** Sort options for the "all discussions" / tag page list. */
export const DISCUSSION_LIST_SORT: SortOption[] = pickOptions(
  ALL_DISCUSSION_OPTIONS,
  ['latest', 'top', 'newest', 'oldest']
);

/** Sort options for the home "popular" section (includes trending). */
export const HOME_FEED_SORT: SortOption[] = pickOptions(
  ALL_DISCUSSION_OPTIONS,
  ['latest', 'top', 'newest', 'oldest', 'trending']
);

/** Sort options for the search discussions tab (relevance first). */
export const DISCUSSION_SEARCH_SORT: SortOption[] = pickOptions(
  ALL_DISCUSSION_OPTIONS,
  ['relevance', 'latest', 'top', 'newest', 'oldest']
);

/** Sort options for the search posts tab. */
export const POST_SEARCH_SORT: SortOption[] = ALL_POST_OPTIONS;

/**
 * Lookup a translated label for a sort key. Used when the available keys are
 * controlled by a backend `sortMap()` and we only want labels for them.
 */
export function getSortLabel(key: string): string {
  const found =
    ALL_DISCUSSION_OPTIONS.find((o) => o.key === key) ||
    ALL_POST_OPTIONS.find((o) => o.key === key);
  if (!found) return key;
  return typeof found.label === 'function' ? found.label() : found.label;
}

/**
 * Resolve a sort key (e.g. `'latest'`) to its JSON:API param (e.g. `'-lastPostedAt'`).
 * Falls back to `-lastPostedAt` when the key is unknown.
 */
export function resolveSortParam(key: string): string {
  const found = ALL_DISCUSSION_OPTIONS.find((o) => o.key === key);
  return found?.sort || '-lastPostedAt';
}

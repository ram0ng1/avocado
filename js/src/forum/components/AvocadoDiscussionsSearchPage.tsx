import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';

import { trans, renderThreadSkeleton, renderLoadMore } from '../utils';
import { toggleDiscussionLike } from '../utils/likes';
import { DISCUSSION_SEARCH_SORT, getSortLabel } from '../utils/sortOptions';

import ThreadCard from './shared/ThreadCard';
import SortDropdown, { SortOption } from './shared/SortDropdown';

/**
 * AvocadoDiscussionsSearchPage
 *
 * Injected into IndexPage.contentItems when `?q=` is present. Reads from
 * `app.discussions` (DiscussionListState already populated by IndexPage),
 * and renders a unified ThreadCard list with the shared sort dropdown.
 */
export default class AvocadoDiscussionsSearchPage extends Component<ComponentAttrs> {
  private likingIds = new Set<string>();

  private renderTitle() {
    const q = m.route.param('q') || '';
    const filter = (m.route.param('filter') || {}) as Record<string, string>;

    if (q) {
      return (
        <>
          {trans('ramon-avocado.forum.search.results_for', 'Results for')} <span className="AvocadoSearch-query">"{q}"</span>
        </>
      );
    }

    const parts = Object.entries(filter)
      .filter(([k]) => !k.startsWith('-'))
      .map(([k, v]) => `${k}:${v}`);

    if (parts.length > 0) {
      return (
        <>
          {trans('ramon-avocado.forum.search.filtered_by', 'Filtered by')} <span className="AvocadoSearch-query">{parts.join(', ')}</span>
        </>
      );
    }

    return trans('ramon-avocado.forum.search.results', 'Search results');
  }

  view() {
    const state = app.discussions as any;
    const isLoading = state.isInitialLoading() || state.isLoadingNext();
    const items = state.getPages().flatMap((pg: any) => pg.items) as any[];
    const q = (m.route.param('q') || '') as string;

    const sortMap = state.sortMap() as Record<string, string>;
    const currentKey = (app.search as any).state.params().sort || Object.keys(sortMap)[0];
    const sortOpts: SortOption[] = Object.keys(sortMap).map((key) => ({
      key,
      label: DISCUSSION_SEARCH_SORT.find((o) => o.key === key)?.label || (() => getSortLabel(key)),
    }));

    return (
      <div className="AvocadoSearch AvocadoSearch--discussions">
        <div className="AvocadoSearch-header">
          <h1 className="AvocadoSearch-title">{this.renderTitle()}</h1>
          <SortDropdown
            options={sortOpts}
            currentKey={currentKey}
            onChange={(key: string) => {
              (app.search as any).state.changeSort(key);
              m.redraw();
            }}
          />
        </div>

        {isLoading && items.length === 0 ? (
          <div className="AvocadoSearch-stack">{renderThreadSkeleton()}</div>
        ) : items.length === 0 ? (
          <div className="AvocadoSearch-empty">
            <i className="far fa-frown-open" aria-hidden="true" />
            <p>
              {q
                ? trans('ramon-avocado.forum.search.no_discussions_query', `No discussions found for "${q}".`, { q })
                : trans('ramon-avocado.forum.search.no_discussions_filter', 'No discussions match these filters.')}
            </p>
          </div>
        ) : (
          <div className="AvocadoSearch-stack">
            {items.map((d: any) => (
              <ThreadCard
                key={d.id?.()}
                discussion={d}
                context={this}
                likingIds={this.likingIds}
                onToggleLike={(disc: any) => toggleDiscussionLike(disc, this.likingIds)}
                searchQuery={q}
                variant="search"
              />
            ))}
            {isLoading && renderThreadSkeleton()}
            {!isLoading && state.hasNext() && renderLoadMore(trans('ramon-avocado.forum.discussions.load_more', 'Load more'), () => state.loadNext())}
          </div>
        )}
      </div>
    );
  }
}

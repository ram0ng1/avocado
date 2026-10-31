import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Avatar from 'flarum/common/components/Avatar';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';

import { trans, navigate, displayName, safeRoute, renderThreadSkeleton, renderLoadMore, renderEmpty } from '../utils';
import { toggleDiscussionLike } from '../utils/likes';
import { DISCUSSION_LIST_SORT } from '../utils/sortOptions';
import { bindDiscussionFeedRealtime } from '../utils/discussionRealtime';

import DiscussionFeedState from '../states/DiscussionFeedState';

import ThreadCard from './shared/ThreadCard';
import SortDropdown from './shared/SortDropdown';
import WsUpdateBanner from './shared/WsUpdateBanner';
import OnlineUsers from './shared/OnlineUsers';
import InlineComposer from './shared/InlineComposer';
import { needsCoreComposer, openCoreDiscussionComposer } from '../utils/coreComposer';
import FloatingInlineComposer, { composerPlacement } from './shared/FloatingInlineComposer';

/**
 * Rota `/discussions`. Paginação, fila de realtime e ordenação ficam no
 * `DiscussionFeedState`; a página só monta a interface.
 */
export default class AllDiscussionsPage extends Page {
  private feedState!: DiscussionFeedState;
  private likingIds = new Set<string>();
  private unbindRealtime: (() => void) | null = null;
  private composerOpen = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.bodyClass = 'App--index';

    const sort = m.route.param('sort') || 'latest';
    this.feedState = new DiscussionFeedState({ sort });
    this.feedState.refresh();
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);

    this.unbindRealtime = bindDiscussionFeedRealtime({
      selfActionIds: this.feedState.selfActionIds,
      updatedLikeIds: this.feedState.updatedLikeIds,
      pendingDiscs: this.feedState.pendingDiscs,
      currentItems: () => this.feedState.flatItems(),
      onFetchFailure: () => this.feedState.wsFetchFailures++,
      // Fixar/desafixar não pede nada: `flatItems()` reordena a cada leitura.
    });
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    this.unbindRealtime?.();
    this.unbindRealtime = null;
  }

  private openComposer() {
    if (!app.session.user) {
      app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'));
      return;
    }
    // Já aberto (o campo continua na página): leva o foco de volta ao cartão.
    if (this.composerOpen) {
      document.querySelector<HTMLInputElement>('.AvocadoComposerDock .AvocadoHome-composerTitle')?.focus();
      return;
    }
    // Extensões que acrescentam campos à nova discussão (idioma, enquete,
    // modelos…) só funcionam no compositor do core.
    needsCoreComposer().then((useCore) => {
      if (useCore) {
        openCoreDiscussionComposer();
        return;
      }
      this.composerOpen = true;
      m.redraw();
    });
  }

  private closeComposer() {
    this.composerOpen = false;
    m.redraw();
  }

  private onDiscussionSubmitted(discussion: any) {
    if (discussion?.id?.()) {
      m.route.set(app.route('discussion', { id: discussion.id(), slug: discussion.slug?.() || discussion.id() }));
    }
  }

  view() {
    const user = app.session.user;
    const homeHref = safeRoute('index');
    const discussions = this.feedState.flatItems();
    const isLoadingNext = this.feedState.isLoadingNext();
    const isInitialLoading = this.feedState.isInitialLoading();
    const currentSort = (this.feedState.getParams() as any).sort || 'latest';
    const composerMode = composerPlacement();

    return (
      <div className="AvocadoDiscussions">
        <div className="AvocadoNav-helper">
          <IndexSidebar />
        </div>

        <div className="AvocadoDiscussions-header">
          <h1 className="AvocadoDiscussions-title">{trans('ramon-avocado.forum.discussions.title', 'All discussions')}</h1>
          <div className="AvocadoDiscussions-controls">
            <SortDropdown
              options={DISCUSSION_LIST_SORT}
              currentKey={currentSort}
              onChange={(key: string) => this.feedState.refreshParams({ sort: key } as any, 1)}
            />
            <a className="AvocadoDiscussions-homeLink" href={homeHref} onclick={(e: Event) => navigate(e as MouseEvent, homeHref)}>
              <i className="fas fa-arrow-left" aria-hidden="true" />
              {trans('ramon-avocado.forum.discussions.home', 'Home')}
            </a>
          </div>
        </div>

        <div className="AvocadoDiscussions-onlineBlock">
          <OnlineUsers />
        </div>

        {/* Com efeito, o campo fica (recolhido) para o cartão sair dele e voltar para ele. */}
        {user && (composerMode !== 'default' || !this.composerOpen) && this.renderComposerTrigger(user)}
        {this.composerOpen &&
          (composerMode !== 'default' ? (
            <FloatingInlineComposer
              alignTo=".AvocadoHome-postInput"
              placement={composerMode}
              user={user}
              onClose={() => this.closeComposer()}
              onSubmitted={(disc: any) => this.onDiscussionSubmitted(disc)}
            />
          ) : (
            <InlineComposer user={user} onClose={() => this.closeComposer()} onSubmitted={(disc: any) => this.onDiscussionSubmitted(disc)} />
          ))}

        <WsUpdateBanner pendingCount={this.feedState.pendingCount()} onFlush={() => this.feedState.flushPending()} />

        <div className="AvocadoHome-threadStack">
          {discussions.length === 0 && isInitialLoading
            ? renderThreadSkeleton(5)
            : discussions.length === 0
              ? renderEmpty(trans('ramon-avocado.forum.discussions.empty', 'No discussions found.'))
              : discussions.map((d: any) => (
                  <ThreadCard
                    key={d.id?.()}
                    discussion={d}
                    context={this}
                    likingIds={this.likingIds}
                    updatedLikeIds={this.feedState.updatedLikeIds}
                    newDiscIds={this.feedState.newDiscIds}
                    onToggleLike={(disc: any) => toggleDiscussionLike(disc, this.likingIds, this.feedState.selfActionIds)}
                  />
                ))}
          {discussions.length > 0 && isLoadingNext && renderThreadSkeleton(3)}
        </div>

        {this.feedState.hasNext() &&
          !isLoadingNext &&
          renderLoadMore(trans('ramon-avocado.forum.discussions.load_more', 'Load more'), () => this.feedState.loadNext())}
      </div>
    );
  }

  private renderComposerTrigger(user: any) {
    return (
      <div className="AvocadoHome-postInput" onclick={() => this.openComposer()}>
        <div className="AvocadoHome-postInput-inner">
          {user && <Avatar user={user} className="AvocadoHome-postInput-avatar" title={displayName(user)} />}
          <span className="AvocadoHome-postInput-placeholder">
            {trans('ramon-avocado.forum.home.start_discussion', 'Tell everyone what are you working on...')}
          </span>
          <button
            className="AvocadoHome-postInput-newBtn"
            type="button"
            onclick={(e: Event) => {
              e.stopPropagation();
              this.openComposer();
            }}
          >
            <i className="fas fa-plus" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.new_discussion', 'New discussion')}
          </button>
        </div>
      </div>
    );
  }
}

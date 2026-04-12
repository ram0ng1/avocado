// @ts-nocheck
import app from 'flarum/forum/app';
import Component, { ComponentAttrs } from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import Tooltip from 'flarum/common/components/Tooltip';
import Dropdown from 'flarum/common/components/Dropdown';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import {
  trans,
  numberOr,
  discussionRoute,
  tagRoute,
  displayName,
  formatTimeLabel,
  postPreview,
  tagPillStyle,
  truncate,
  navigate,
  userRoute,
  highlight,
} from '../../utils';

export interface ThreadCardAttrs extends ComponentAttrs {
  /** The discussion model to render */
  discussion: any;
  /** Parent component reference for DiscussionControls context */
  context: any;
  /** Set of discussion IDs currently being liked (optimistic lock) */
  likingIds: Set<string>;
  /** Callback to toggle like on a discussion */
  onToggleLike: (discussion: any) => void;
  /** IDs with a recent like update (triggers pop animation) */
  updatedLikeIds?: Set<string>;
  /** IDs of newly arrived discussions (highlights as new) */
  newDiscIds?: Set<string>;
  /** Tag to render as non-link (TagPage: skip linking the current tag) */
  currentTag?: any;
  /** Search query for title/excerpt highlighting */
  searchQuery?: string;
  /**
   * 'home' (default) — shows reply card + like/reply stat buttons
   * 'search'         — shows highlighted excerpt + reply count footer, no like button
   */
  variant?: 'home' | 'search';
}

export default class ThreadCard extends Component<ThreadCardAttrs> {
  view() {
    const {
      discussion,
      context,
      likingIds,
      onToggleLike,
      updatedLikeIds = new Set<string>(),
      newDiscIds = new Set<string>(),
      currentTag = null,
      searchQuery = '',
      variant = 'home',
    } = this.attrs;

    if (!discussion) return null;

    const id              = discussion.id?.() as string;
    const user            = discussion.user?.();
    const title           = (discussion.title?.() || 'Untitled') as string;
    const href            = discussionRoute(discussion);
    const tags            = ((discussion.tags?.() || []) as any[]).filter(Boolean);
    const isSticky        = discussion.isSticky?.() || false;
    const isLocked        = discussion.isLocked?.() || false;
    const isFollowing     = discussion.subscription?.() === 'follow';
    const isUnread        = discussion.isUnread?.() || false;
    const replies         = numberOr(discussion.replyCount?.(), 0);
    const timeLabel       = formatTimeLabel(discussion.lastPostedAt?.());
    const userProfileHref = userRoute(user);
    const isNew           = newDiscIds.has(id);
    const isSearch        = variant === 'search';
    const p               = isSearch ? 'AvocadoSearch' : 'AvocadoHome';

    // ── excerpt ──────────────────────────────────────────────────────────────
    const excerptRaw = isSearch
      ? (() => {
          try {
            const mrp = discussion.mostRelevantPost?.();
            if (mrp) return (mrp.contentPlain?.() || '') as string;
            return (discussion.firstPost?.()?.contentPlain?.() || '') as string;
          } catch {
            return '';
          }
        })()
      : postPreview(discussion);

    const excerptNode = isSearch
      ? (searchQuery ? highlight(excerptRaw, searchQuery, 160) : truncate(excerptRaw, 160))
      : excerptRaw;

    const titleNode = isSearch && searchQuery ? highlight(title, searchQuery) : title;

    // ── controls dropdown ────────────────────────────────────────────────────
    const controls = DiscussionControls.controls(discussion, context).toArray();
    const controlsDropdown = controls.length ? (
      <Dropdown
        className="AvocadoHome-threadControls"
        icon="fas fa-ellipsis-v"
        buttonClassName="Button Button--icon Button--flat AvocadoHome-threadControls-toggle"
        accessibleToggleLabel={app.translator.trans('core.forum.discussion_controls.toggle_dropdown_accessible_label') as string}
      >
        {controls}
      </Dropdown>
    ) : null;

    // ── like state (home variant) ─────────────────────────────────────────────
    const likes   = numberOr(discussion.firstPost?.()?.attribute?.('likesCount'), 0);
    const isLiked = !!(app.session.user && ((discussion.firstPost?.()?.likes?.() || []) as any[]).some((u: any) => u === app.session.user));
    const isLiking = likingIds.has(id);

    // ── reply card (home variant, only when there are replies) ────────────────
    const replyCardNode = (!isSearch && replies > 0) ? (() => {
      const lastPoster = discussion.lastPostedUser?.();
      const lastPost   = discussion.lastPost?.();
      if (!lastPoster && !lastPost) return null;
      const preview    = truncate((lastPost?.contentPlain?.() || '') as string, 100);
      const otherCount = replies - 1;
      const lastPostHref = (() => {
        try { const n = discussion.lastPostNumber?.(); return n ? app.route.discussion(discussion, n) : href; }
        catch { return href; }
      })();
      const secondHref = (() => {
        try { return app.route.discussion(discussion, 2); } catch { return href; }
      })();
      return (
        <div className="AvocadoHome-replyCard">
          <a
            className="AvocadoHome-replyCard-line"
            href={lastPostHref}
            onclick={(e: Event) => { e.stopPropagation(); navigate(e as MouseEvent, lastPostHref); }}
          >
            <div className="AvocadoHome-replyCard-avatar">
              {lastPoster && <Avatar user={lastPoster} />}
            </div>
            <span className="AvocadoHome-replyCard-name">{displayName(lastPoster)}</span>
            {preview && <span className="AvocadoHome-replyCard-text">{preview}</span>}
          </a>
          {otherCount > 0 && (
            <a
              className="AvocadoHome-replyCard-seeMore"
              href={secondHref}
              onclick={(e: Event) => { e.stopPropagation(); navigate(e as MouseEvent, secondHref); }}
            >
              {otherCount === 1
                ? trans('ramon-avocado.forum.home.see_other_reply_singular', 'See other {count} reply', { count: otherCount })
                : trans('ramon-avocado.forum.home.see_other_replies', 'See other {count} replies', { count: otherCount })}
            </a>
          )}
        </div>
      );
    })() : null;

    return (
      <article
        key={id}
        className={`${p}-threadCard${isUnread ? ` ${p}-threadCard--unread` : ''}${isNew ? ` ${p}-threadCard--new` : ''}`}
      >
        <div className={`${p}-threadHead`}>
          {/* Avatar */}
          <div className={isSearch ? `${p}-threadAvatar` : 'AvocadoHome-avatarWrap'}>
            {user && <Avatar user={user} title={displayName(user)} />}
          </div>

          {/* Main content */}
          <div className={`${p}-threadMain`}>
            <div className={`${p}-threadMeta`}>
              <a
                className={`${p}-threadAuthor`}
                href={userProfileHref}
                onclick={(e: Event) => { e.stopPropagation(); navigate(e as MouseEvent, userProfileHref); }}
              >
                {displayName(user)}
              </a>
              {timeLabel && <span className={`${p}-threadTime`}>{timeLabel}</span>}
              {isNew && <span className="AvocadoStatDot AvocadoStatDot--new" aria-hidden="true" />}
              {isSticky && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--sticky">
                    <i className="fas fa-thumbtack" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {isLocked && (
                <Tooltip text={app.translator.trans('flarum-lock.forum.badge.locked_tooltip') as string} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--locked">
                    <i className="fas fa-lock" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {isFollowing && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_following', 'Following')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--following">
                    <i className="fas fa-star" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {tags.slice(0, 4).map((tag: any, idx: number) => {
                const tagColor     = tag.color?.() || null;
                const isCurrentTag = currentTag && tag.id?.() === currentTag.id?.();
                const extraClass   = idx >= 2 ? ' AvocadoHome-tagPill--extra' : '';
                const tagStyle     = tagPillStyle(tagColor);
                if (isCurrentTag) {
                  return (
                    <span
                      key={tag.id?.()}
                      className={`AvocadoHome-tagPill${extraClass}`}
                      style={{ ...tagStyle, cursor: 'default' }}
                    >
                      {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                      {tag.name?.()}
                    </span>
                  );
                }
                return (
                  <a
                    key={tag.id?.()}
                    className={`AvocadoHome-tagPill${extraClass}`}
                    href={tagRoute(tag)}
                    onclick={(e: Event) => { e.stopPropagation(); navigate(e as MouseEvent, tagRoute(tag)); }}
                    style={tagStyle}
                  >
                    {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                    {tag.name?.()}
                  </a>
                );
              })}
              {tags.length > 2 && <span className="AvocadoHome-tagMore">+{tags.length - 2}</span>}
            </div>

            <a
              className={`${p}-threadTitle`}
              href={href}
              onclick={(e: Event) => navigate(e as MouseEvent, href)}
            >
              {titleNode}
            </a>

            {excerptNode && <p className={`${p}-threadExcerpt`}>{excerptNode}</p>}

            {/* Search-mode footer: reply count */}
            {isSearch && (
              <div className={`${p}-threadFooter`}>
                <span className={`${p}-threadReplies`}>
                  <i className="far fa-comment" aria-hidden="true" />
                  {replies === 1
                    ? trans('ramon-avocado.forum.home.reply_singular', '1 reply')
                    : trans('ramon-avocado.forum.home.reply_plural', '{count} replies', { count: replies })}
                </span>
              </div>
            )}
          </div>

          {/* Actions — search: just controls dropdown; home: controls + reply button */}
          {isSearch ? controlsDropdown : (
            <div className="AvocadoHome-threadActions">
              {controlsDropdown}
              <button
                className="AvocadoHome-replyBtn"
                onclick={(e: Event) => {
                  e.stopPropagation();
                  if (!app.session.user) {
                    app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'));
                    return;
                  }
                  app.composer
                    .load(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/ReplyComposer'), { user: app.session.user, discussion })
                    .then(() => { app.composer.show(); m.route.set(href); });
                }}
              >
                <i className="fas fa-reply" aria-hidden="true" />
                {trans('ramon-avocado.forum.home.reply_label', 'Reply')}
              </button>
            </div>
          )}
        </div>

        {/* Reply preview card */}
        {replyCardNode && <div className="AvocadoHome-threadReplyGroup">{replyCardNode}</div>}

        {/* Like + reply stats (home variant only) */}
        {!isSearch && (
          <div className="AvocadoHome-threadStats">
            <button
              className={[
                'AvocadoHome-statBtn AvocadoHome-statBtn--likes',
                isLiked   ? ' AvocadoHome-statBtn--liked'   : '',
                isLiking  ? ' AvocadoHome-statBtn--loading' : '',
                updatedLikeIds.has(id) ? ' AvocadoHome-statBtn--pop' : '',
              ].join('')}
              onclick={(e: Event) => {
                e.stopPropagation();
                if (!app.session.user) {
                  app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'));
                  return;
                }
                onToggleLike(discussion);
              }}
              title={trans('ramon-avocado.forum.home.like', 'Like')}
            >
              <i className={isLiked ? 'fas fa-thumbs-up' : 'far fa-thumbs-up'} aria-hidden="true" />
              <span>
                {likes === 1
                  ? trans('ramon-avocado.forum.home.like_count_singular', '1 like')
                  : trans('ramon-avocado.forum.home.like_count_plural', '{count} likes', { count: likes })}
              </span>
            </button>
            <button
              className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
              onclick={(e: Event) => { e.stopPropagation(); m.route.set(href); }}
              title={trans('ramon-avocado.forum.home.replies', 'Replies')}
            >
              <i className="far fa-comment" aria-hidden="true" />
              <span>
                {replies === 1
                  ? trans('ramon-avocado.forum.home.reply_count_singular', '1 resposta')
                  : trans('ramon-avocado.forum.home.reply_count_plural', '{count} respostas', { count: replies })}
              </span>
            </button>
          </div>
        )}
      </article>
    );
  }
}

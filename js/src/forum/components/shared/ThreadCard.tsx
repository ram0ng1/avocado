import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import Tooltip from 'flarum/common/components/Tooltip';
import Dropdown from 'flarum/common/components/Dropdown';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import listItems from 'flarum/common/helpers/listItems';
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
  discussionViews,
  formatViews,
} from '../../utils';
import {
  toggleBookmark,
  isBookmarked,
  bookmarkNote,
  bookmarkRemindAt,
  bookmarksEnabled,
  avocadoBookmarksEnabled,
  bookmarkActionLabel,
} from '../../utils/bookmarks';
import { formatDateTime } from '../../utils/clock';
import { firstPostLikes } from '../../utils/likes';
import UserHoverCard from './UserHoverCard';
import CakedayBadge from './CakedayBadge';

// O modal de lembrete só baixa no clique (chunk lazy, mesmo do index.tsx); o
// ModalManager do core aceita a função async no lugar da classe.
const BookmarkModal = () => import('../BookmarkModal');

export interface ThreadCardAttrs extends ComponentAttrs {
  discussion: any;
  /** Componente pai, contexto dos DiscussionControls. */
  context: any;
  /** Discussões com like em andamento (trava otimista). */
  likingIds: Set<string>;
  onToggleLike: (discussion: any) => void;
  /** Ids com like recente (dispara a animação). */
  updatedLikeIds?: Set<string>;
  /** Ids de discussões recém-chegadas, destacadas como novas. */
  newDiscIds?: Set<string>;
  /** Tag desenhada sem link (na TagPage, a própria tag). */
  currentTag?: any;
  /** Termo buscado, para destacar título e trecho. */
  searchQuery?: string;
  /** Tags fora da linha de pílulas (ex.: as da vitrine na home). */
  filterTagIds?: Set<string>;
  /**
   * 'home' (padrão): cartão de resposta e botões de like/resposta.
   * 'search': trecho destacado e contagem de respostas, sem like.
   */
  variant?: 'home' | 'search';
  /** Show the bookmark note/reminder row under the excerpt (BookmarksPage). */
  showBookmarkMeta?: boolean;
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
      filterTagIds,
      variant = 'home',
      showBookmarkMeta = false,
    } = this.attrs;

    if (!discussion) return null;

    const id = discussion.id?.() as string;
    const user = discussion.user?.();
    const title = (discussion.title?.() || 'Untitled') as string;
    const href = discussionRoute(discussion);
    const allTags = ((discussion.tags?.() || []) as any[]).filter(Boolean);
    const tags = filterTagIds ? allTags.filter((t: any) => !filterTagIds.has(String(t.id?.() ?? ''))) : allTags;
    const isSticky = discussion.isSticky?.() || false;
    const isLocked = discussion.isLocked?.() || false;
    const isFollowing = discussion.subscription?.() === 'follow';
    const isUnread = discussion.isUnread?.() || false;
    const unreadCount = isUnread ? numberOr(discussion.unreadCount?.(), 0) : 0;
    const replies = numberOr(discussion.replyCount?.(), 0);
    const timeLabel = formatTimeLabel(discussion.lastPostedAt?.());
    const userProfileHref = userRoute(user);
    const isNew = newDiscIds.has(id);
    const isSearch = variant === 'search';
    const p = isSearch ? 'AvocadoSearch' : 'AvocadoHome';

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

    const excerptNode = isSearch ? (searchQuery ? highlight(excerptRaw, searchQuery, 160) : truncate(excerptRaw, 160)) : excerptRaw;

    const titleNode = isSearch && searchQuery ? highlight(title, searchQuery) : title;

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

    // Sistema do tema: não salvo, um clique salva; salvo, o clique abre o modal de
    // nota/lembrete. Cedendo ao fof/bookmarks não há nota nem lembrete, e o botão
    // vira um toggle que grava na extensão.
    const editsNoteAndReminder = avocadoBookmarksEnabled();
    const saved = isBookmarked(discussion);
    const bookmarkLabel =
      saved && editsNoteAndReminder ? (trans('ramon-avocado.forum.bookmarks.edit', 'Edit bookmark') as string) : bookmarkActionLabel(saved);
    const bookmarkBtn =
      app.session.user && bookmarksEnabled() ? (
        <Tooltip text={bookmarkLabel} position="top">
          <button
            className={`AvocadoThreadCard-bookmarkBtn${saved ? ' is-saved' : ''}`}
            type="button"
            aria-pressed={saved}
            aria-label={bookmarkLabel as string}
            onclick={(e: Event) => {
              e.stopPropagation();
              e.preventDefault();
              // O Tooltip também abre no focus: sem o blur ficaria preso depois do clique,
              // flutuando quando o botão some (ele só aparece no hover).
              (e.currentTarget as HTMLElement | null)?.blur();
              if (saved && editsNoteAndReminder) {
                app.modal.show(BookmarkModal, { discussion });
              } else {
                toggleBookmark(discussion);
              }
            }}
          >
            <i className={saved ? 'fas fa-bookmark' : 'far fa-bookmark'} aria-hidden="true" />
          </button>
        </Tooltip>
      ) : null;

    const metaVisible = showBookmarkMeta && saved && editsNoteAndReminder;
    const note = metaVisible ? bookmarkNote(discussion) : '';
    const remindAt = metaVisible ? bookmarkRemindAt(discussion) : null;
    const bookmarkMeta =
      note || remindAt ? (
        <button
          className="AvocadoBookmark-meta"
          type="button"
          onclick={(e: Event) => {
            e.stopPropagation();
            e.preventDefault();
            app.modal.show(BookmarkModal, { discussion });
          }}
        >
          {remindAt && (
            <span className="AvocadoBookmark-metaReminder">
              <i className="far fa-clock" aria-hidden="true" />
              {formatDateTime(remindAt)}
            </span>
          )}
          {note && (
            <span className="AvocadoBookmark-metaNote">
              <i className="far fa-sticky-note" aria-hidden="true" />
              {truncate(note, 120)}
            </span>
          )}
        </button>
      ) : null;

    const { count: likes, liked: isLiked } = firstPostLikes(discussion);
    const views = discussionViews(discussion);
    const viewsLabel =
      views === null
        ? ''
        : views === 1
          ? trans('ramon-avocado.forum.home.view_count_singular', '1 view')
          : trans('ramon-avocado.forum.home.view_count_plural', '{count} views', { count: formatViews(views) });
    const isLiking = likingIds.has(id);

    const replyCardNode =
      !isSearch && replies > 0
        ? (() => {
            const lastPoster = discussion.lastPostedUser?.();
            const lastPost = discussion.lastPost?.();
            if (!lastPoster && !lastPost) return null;
            // `avocadoLastPostExcerpt` vem na própria discussão, porque as listas não
            // incluem o post; o post do store fica de reserva.
            const preview = truncate((discussion.attribute?.('avocadoLastPostExcerpt') || lastPost?.contentPlain?.() || '') as string, 100);
            const otherCount = replies - 1;
            const lastPostHref = (() => {
              try {
                const n = discussion.lastPostNumber?.();
                return n ? app.route.discussion(discussion, n) : href;
              } catch {
                return href;
              }
            })();
            const secondHref = (() => {
              try {
                return app.route.discussion(discussion, 2);
              } catch {
                return href;
              }
            })();
            return (
              <div className="AvocadoHome-replyCard">
                <a
                  className="AvocadoHome-replyCard-line"
                  href={lastPostHref}
                  onclick={(e: Event) => {
                    e.stopPropagation();
                    navigate(e as MouseEvent, lastPostHref);
                  }}
                >
                  <div className="AvocadoHome-replyCard-avatar">{lastPoster && <Avatar user={lastPoster} />}</div>
                  <span className="AvocadoHome-replyCard-name">{displayName(lastPoster)}</span>
                  {preview && <span className="AvocadoHome-replyCard-text">{preview}</span>}
                </a>
                {otherCount > 0 && (
                  <a
                    className="AvocadoHome-replyCard-seeMore"
                    href={secondHref}
                    onclick={(e: Event) => {
                      e.stopPropagation();
                      navigate(e as MouseEvent, secondHref);
                    }}
                  >
                    {otherCount === 1
                      ? trans('ramon-avocado.forum.home.see_other_reply_singular', 'See other {count} reply', { count: otherCount })
                      : trans('ramon-avocado.forum.home.see_other_replies', 'See other {count} replies', { count: otherCount })}
                  </a>
                )}
              </div>
            );
          })()
        : null;

    // Selos que as extensões põem em Discussion.badges() (approval, byobu,
    // best-answer, polls, frontpage, follow-tags…). Fixado, trancado, seguindo
    // e salvo já têm o desenho próprio do cartão logo acima.
    const extensionBadges = (() => {
      const items = discussion.badges?.();
      if (!items) return [];
      ['sticky', 'locked', 'bookmarked', ...(isFollowing ? ['subscription'] : [])].forEach((key) => items.has(key) && items.remove(key));
      return items.toArray();
    })();

    const primaryTagColor: string = (allTags.length ? allTags[0].color?.() : null) || 'var(--primary-color)';

    return (
      <article
        key={id}
        className={`${p}-threadCard${isUnread ? ` ${p}-threadCard--unread` : ''}${isNew ? ` ${p}-threadCard--new` : ''}`}
        style={{ '--item-tag-color': primaryTagColor }}
      >
        <div className={`${p}-threadHead`}>
          <div className={isSearch ? `${p}-threadAvatar` : 'AvocadoHome-avatarWrap'}>
            {user && (
              <UserHoverCard user={user}>
                <Avatar user={user} title={displayName(user)} />
              </UserHoverCard>
            )}
            {unreadCount > 0 && (
              <Tooltip
                text={trans('ramon-avocado.forum.home.badge_unread_tooltip', unreadCount === 1 ? '1 unread post' : '{count} unread posts', {
                  count: unreadCount,
                })}
                position="top"
              >
                <span className="AvocadoHome-unreadBadge" aria-hidden="true">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              </Tooltip>
            )}
          </div>

          <div className={`${p}-threadMain`}>
            <div className={`${p}-threadMeta`}>
              <UserHoverCard user={user}>
                <a
                  className={`${p}-threadAuthor`}
                  href={userProfileHref}
                  onclick={(e: Event) => {
                    e.stopPropagation();
                    navigate(e as MouseEvent, userProfileHref);
                  }}
                >
                  {displayName(user)}
                </a>
              </UserHoverCard>
              {user && <CakedayBadge user={user} />}
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
              {extensionBadges.length > 0 && <ul className="AvocadoHome-extBadges badges">{listItems(extensionBadges)}</ul>}
              {tags.slice(0, 4).map((tag: any, idx: number) => {
                const tagColor = tag.color?.() || null;
                const isCurrentTag = currentTag && tag.id?.() === currentTag.id?.();
                const extraClass = idx >= 2 ? ' AvocadoHome-tagPill--extra' : '';
                const tagStyle = tagPillStyle(tagColor);
                if (isCurrentTag) {
                  return (
                    <span key={tag.id?.()} className={`AvocadoHome-tagPill${extraClass}`} style={{ ...tagStyle, cursor: 'default' }}>
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
                    onclick={(e: Event) => {
                      e.stopPropagation();
                      navigate(e as MouseEvent, tagRoute(tag));
                    }}
                    style={tagStyle}
                  >
                    {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                    {tag.name?.()}
                  </a>
                );
              })}
              {tags.length > 2 && <span className="AvocadoHome-tagMore">+{tags.length - 2}</span>}
            </div>

            <a className={`${p}-threadTitle`} href={href} onclick={(e: Event) => navigate(e as MouseEvent, href)}>
              {titleNode}
            </a>

            {excerptNode && <p className={`${p}-threadExcerpt`}>{excerptNode}</p>}

            {bookmarkMeta}

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

          {isSearch ? (
            <div className="AvocadoSearch-threadActions">
              {bookmarkBtn}
              {controlsDropdown}
            </div>
          ) : (
            <div className="AvocadoHome-threadActions">
              {bookmarkBtn}
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
                    .load(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/ReplyComposer'), {
                      user: app.session.user,
                      discussion,
                    })
                    .then(() => {
                      app.composer.show();
                      m.route.set(href);
                    });
                }}
              >
                <i className="fas fa-reply" aria-hidden="true" />
                {trans('ramon-avocado.forum.home.reply_label', 'Reply')}
              </button>
            </div>
          )}
        </div>

        {replyCardNode && <div className="AvocadoHome-threadReplyGroup">{replyCardNode}</div>}

        {!isSearch && (
          <div className="AvocadoHome-threadStats">
            {'flarum-likes' in flarum.extensions && (
              <button
                className={[
                  'AvocadoHome-statBtn AvocadoHome-statBtn--likes',
                  isLiked ? ' AvocadoHome-statBtn--liked' : '',
                  isLiking ? ' AvocadoHome-statBtn--loading' : '',
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
            )}
            <button
              className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
              onclick={(e: Event) => {
                e.stopPropagation();
                m.route.set(href);
              }}
              title={trans('ramon-avocado.forum.home.replies', 'Replies')}
            >
              <i className="far fa-comment" aria-hidden="true" />
              <span>
                {replies === 1
                  ? trans('ramon-avocado.forum.home.reply_count_singular', '1 resposta')
                  : trans('ramon-avocado.forum.home.reply_count_plural', '{count} respostas', { count: replies })}
              </span>
            </button>
            {/* michaelbelgium/flarum-discussion-views: só o número, como a própria extensão mostra */}
            {views !== null && (
              <span className="AvocadoHome-statBtn AvocadoHome-statBtn--views" title={viewsLabel} aria-label={viewsLabel}>
                <i className="far fa-eye" aria-hidden="true" />
                <span>{formatViews(views)}</span>
              </span>
            )}
          </div>
        )}
      </article>
    );
  }
}

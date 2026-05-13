import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import Tooltip from 'flarum/common/components/Tooltip';
import Dropdown from 'flarum/common/components/Dropdown';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import {
  trans,
  displayName,
  tagPillStyle,
  discussionRoute,
  tagRoute,
  formatTimeLabel,
  truncate,
  highlight,
  navigate,
  userRoute,
  numberOr,
} from '../../utils';

export interface PostCardAttrs extends ComponentAttrs {
  /** The post model to render (comment post) */
  post: any;
  /** Parent component reference for DiscussionControls context */
  context: any;
  /**
   * Search query string — enables highlighted title and excerpt.
   * When omitted the text is rendered plain/truncated.
   */
  searchQuery?: string;
  /**
   * Show sticky/locked badges on the meta row.
   * Default: true — set to false for search result contexts.
   */
  showBadges?: boolean;
}

/**
 * PostCard — shared card for rendering a user's comment inside a discussion.
 *
 * Used by:
 *  - UserProfilePage  (posts tab, likes tab, mentions tab)
 *  - AvocadoSearchPage (discussions/posts search results)
 *
 * Renders the same AvocadoHome-threadCard shell as ThreadCard but is
 * anchored to a **post** (not a discussion), linking to the post's position.
 */
export default class PostCard extends Component<PostCardAttrs> {
  view() {
    const { post, context, searchQuery = '', showBadges = true } = this.attrs;

    if (!post) return null;

    const discussion = post.discussion?.();
    if (!discussion) return null;

    const id = post.id?.() as string;
    const user = post.user?.();
    const title = (discussion.title?.() || 'Untitled') as string;
    const postNum = post.number?.();
    const href = (() => {
      try {
        return app.route.discussion(discussion, postNum);
      } catch {
        return discussionRoute(discussion);
      }
    })();
    const tags = ((discussion.tags?.() || []) as any[]).filter(Boolean);
    const timeLabel = formatTimeLabel(post.createdAt?.());
    const userHref = userRoute(user);
    const plain = (post.contentPlain?.() || '') as string;
    const excerpt = plain ? (searchQuery ? highlight(plain, searchQuery, 200) : truncate(plain, 200)) : null;
    const titleNode = searchQuery ? highlight(title, searchQuery) : title;
    const replies = numberOr(discussion.replyCount?.(), 0);
    const isSticky = discussion.isSticky?.() || false;
    const isLocked = discussion.isLocked?.() || false;
    const controls = DiscussionControls.controls(discussion, context).toArray();

    return (
      <article key={id} className="AvocadoHome-threadCard">
        <div className="AvocadoHome-threadHead">
          {/* Avatar */}
          <div className="AvocadoHome-avatarWrap">{user && <Avatar user={user} title={displayName(user)} />}</div>

          {/* Main content */}
          <div className="AvocadoHome-threadMain">
            <div className="AvocadoHome-threadMeta">
              <a
                className="AvocadoHome-threadAuthor"
                href={userHref}
                onclick={(e: Event) => {
                  e.stopPropagation();
                  navigate(e as MouseEvent, userHref);
                }}
              >
                {displayName(user)}
              </a>
              {timeLabel && <span className="AvocadoHome-threadTime">{timeLabel}</span>}

              {/* Status badges — opt-in via showBadges prop */}
              {showBadges && isSticky && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--sticky">
                    <i className="fas fa-thumbtack" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {showBadges && isLocked && (
                <Tooltip text={app.translator.trans('flarum-lock.forum.badge.locked_tooltip') as string} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--locked">
                    <i className="fas fa-lock" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}

              {/* Tag pills (up to 2) */}
              {tags.slice(0, 2).map((tag: any) => (
                <a
                  key={tag.id?.()}
                  className="AvocadoHome-tagPill"
                  href={tagRoute(tag)}
                  onclick={(e: Event) => {
                    e.stopPropagation();
                    navigate(e as MouseEvent, tagRoute(tag));
                  }}
                  style={tagPillStyle(tag.color?.())}
                >
                  {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                  {tag.name?.()}
                </a>
              ))}
            </div>

            {/* Discussion title */}
            <a className="AvocadoHome-threadTitle" href={href} onclick={(e: Event) => navigate(e as MouseEvent, href)}>
              {titleNode}
            </a>

            {/* Post excerpt */}
            {excerpt && <p className="AvocadoHome-threadExcerpt AvocadoUserPage-postExcerpt">{excerpt}</p>}
          </div>

          {/* Actions: controls dropdown + view button */}
          <div className="AvocadoHome-threadActions">
            {controls.length > 0 && (
              <Dropdown
                className="AvocadoHome-threadControls"
                icon="fas fa-ellipsis-v"
                buttonClassName="Button Button--icon Button--flat AvocadoHome-threadControls-toggle"
                accessibleToggleLabel={app.translator.trans('core.forum.discussion_controls.toggle_dropdown_accessible_label') as string}
              >
                {controls}
              </Dropdown>
            )}
            <a
              className="AvocadoHome-replyBtn"
              href={href}
              onclick={(e: Event) => {
                e.stopPropagation();
                navigate(e as MouseEvent, href);
              }}
            >
              <i className="fas fa-arrow-right" aria-hidden="true" />
              {trans('ramon-avocado.forum.home.view', 'View')}
            </a>
          </div>
        </div>

        {/* Stats: reply count */}
        <div className="AvocadoHome-threadStats">
          <span
            className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
            onclick={(e: Event) => {
              e.stopPropagation();
              m.route.set(href);
            }}
          >
            <i className="far fa-comment" aria-hidden="true" />
            <span>
              {replies === 1
                ? trans('ramon-avocado.forum.home.reply_singular', '1 reply')
                : trans('ramon-avocado.forum.home.reply_plural', '{count} replies', { count: replies })}
            </span>
          </span>
        </div>
      </article>
    );
  }
}

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
  post: any;
  /** Componente pai, contexto dos DiscussionControls. */
  context: any;
  /** Termo buscado: destaca título e trecho. */
  searchQuery?: string;
  /** Selos de fixado/trancado na meta. Padrão true; false nos resultados de busca. */
  showBadges?: boolean;
}

/**
 * Cartão de um post do usuário (perfil e busca): a mesma casca do ThreadCard,
 * mas ancorada no post, com link para a posição dele.
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
          <div className="AvocadoHome-avatarWrap">{user && <Avatar user={user} title={displayName(user)} />}</div>

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

            <a className="AvocadoHome-threadTitle" href={href} onclick={(e: Event) => navigate(e as MouseEvent, href)}>
              {titleNode}
            </a>

            {excerpt && <p className="AvocadoHome-threadExcerpt AvocadoUserPage-postExcerpt">{excerpt}</p>}
          </div>

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

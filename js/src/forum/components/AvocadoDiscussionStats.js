import Component from 'flarum/common/Component';

/**
 * AvocadoDiscussionStats — compact stats card injected between the Reply
 * button (controls, @100) and the Scrubber/Timeline (@-100) in the
 * DiscussionPage sidebar.
 *
 * Shows: views (if flarum/views extension present), replies, and first-post
 * likes (if flarum/likes extension present).
 */
export default class AvocadoDiscussionStats extends Component {
  view() {
    const discussion = this.attrs.discussion;
    if (!discussion) return <div className="AvocadoSidebar-stats" />;

    const replyCount = Number(discussion.replyCount?.()) || 0;

    // viewCount provided by flarum/views; may not exist — gracefully absent
    const viewCount = Number(
      discussion.attribute?.('viewCount') ??
      discussion.viewCount?.() ??
      0
    );

    // First-post likes provided by flarum/likes
    const firstPost  = discussion.firstPost?.();
    const likeCount  = Number(
      firstPost?.attribute?.('likesCount') ??
      firstPost?.likesCount?.() ??
      0
    );

    const rows = [
      viewCount > 0 && { key: 'views',   icon: 'far fa-eye',       label: 'Views',   value: viewCount.toLocaleString() },
      true           && { key: 'replies', icon: 'far fa-comment',   label: 'Replies', value: String(replyCount)         },
      likeCount > 0  && { key: 'likes',   icon: 'far fa-thumbs-up', label: 'Likes',   value: String(likeCount)          },
    ].filter(Boolean);

    return (
      <div className="AvocadoSidebar-stats">
        {rows.map(({ key, icon, label, value }) => (
          <div key={key} className="AvocadoSidebar-statRow">
            <span className="AvocadoSidebar-statLabel">
              <i className={icon} aria-hidden="true" />
              {label}
            </span>
            <span className="AvocadoSidebar-statValue">{value}</span>
          </div>
        ))}
      </div>
    );
  }
}

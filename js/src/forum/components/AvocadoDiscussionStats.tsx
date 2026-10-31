import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';

import { discussionViews, formatViews } from '../utils';

interface StatRow {
  key: string;
  icon: string;
  label: string;
  value: string;
}

export interface AvocadoDiscussionStatsAttrs extends ComponentAttrs {
  discussion: any;
}

/**
 * Estatísticas na lateral da discussão, entre Responder (@100) e o Scrubber
 * (@-100): visualizações (michaelbelgium/flarum-discussion-views), respostas e
 * likes do primeiro post (flarum/likes).
 */
export default class AvocadoDiscussionStats extends Component<AvocadoDiscussionStatsAttrs> {
  view() {
    const { discussion } = this.attrs;
    if (!discussion) return <div className="AvocadoSidebar-stats" />;

    const replyCount = Number(discussion.replyCount?.()) || 0;
    const viewCount = discussionViews(discussion) ?? 0;
    const firstPost = discussion.firstPost?.();
    const likeCount = Number(firstPost?.attribute?.('likesCount') ?? firstPost?.likesCount?.() ?? 0);

    const rows: StatRow[] = [
      viewCount > 0 && { key: 'views', icon: 'far fa-eye', label: 'Views', value: formatViews(viewCount) },
      true && { key: 'replies', icon: 'far fa-comment', label: 'Replies', value: String(replyCount) },
      likeCount > 0 && { key: 'likes', icon: 'far fa-thumbs-up', label: 'Likes', value: String(likeCount) },
    ].filter(Boolean) as StatRow[];

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

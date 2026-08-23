import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';

import { trans } from '../../utils';

export interface WsUpdateBannerAttrs extends ComponentAttrs {
  pendingCount: number;
  onFlush: () => void;
}

/**
 * WsUpdateBanner — "N new discussions" pill shown when WebSocket events arrive.
 * Used by AllDiscussionsPage and TagPage.
 */
export default class WsUpdateBanner extends Component<WsUpdateBannerAttrs> {
  view() {
    const { pendingCount, onFlush } = this.attrs;
    if (pendingCount <= 0) return null;

    const label =
      pendingCount === 1
        ? trans('ramon-avocado.forum.home.ws_update_singular', '1 new discussion')
        : trans('ramon-avocado.forum.home.ws_update_plural', '{count} new discussions', { count: pendingCount });

    return (
      <div className="AvocadoWsUpdate">
        <button className="AvocadoWsUpdate-btn" onclick={onFlush}>
          <span className="AvocadoWsUpdate-dot" aria-hidden="true" />
          {label}
        </button>
      </div>
    );
  }
}

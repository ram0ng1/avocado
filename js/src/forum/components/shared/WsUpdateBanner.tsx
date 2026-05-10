import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';

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

    const label = pendingCount === 1
      ? '1 new discussion'
      : `${pendingCount} new discussions`;

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

import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';

import { trans } from '../../utils';
import { joinDiscussionPresence, presenceEnabled, type PresenceState } from '../../utils/presence';

export interface WhoIsReadingAttrs extends ComponentAttrs {
  discussion: any;
}

/**
 * "{count} lendo agora" no meta do hero da discussão. Entra no presence
 * channel ao montar e sai ao desmontar; navegação discussão→discussão reusa a
 * instância, então onupdate re-entra quando o id muda. Renderiza nada com
 * menos de 2 leitores visíveis (só você não é notícia) ou com o recurso
 * desligado — o custo de um no-op é zero.
 */
export default class WhoIsReading extends Component<WhoIsReadingAttrs> {
  // Não usar `state`: é reservado pelo Component do Mithril (2º generic).
  private presence: PresenceState = { members: [], count: 0 };
  private leave: (() => void) | null = null;
  private joinedId = '';

  oncreate(vnode: any) {
    super.oncreate(vnode);
    this.join();
  }

  onupdate(vnode: any) {
    super.onupdate(vnode);
    const id = String(this.attrs.discussion?.id?.() || '');
    if (id && id !== this.joinedId) this.join();
  }

  onremove() {
    this.leave?.();
    this.leave = null;
  }

  view() {
    if (!presenceEnabled() || this.presence.count < 2) return null;

    const shown = this.presence.members.slice(0, 6);

    return (
      <span className="DiscussionHero-metaItem AvocadoPresence">
        <span className="AvocadoPresence-dot" aria-hidden="true" />
        <span className="AvocadoPresence-avatars" aria-hidden="true">
          {shown.map((member) =>
            member.avatarUrl ? (
              <img key={member.id} className="AvocadoPresence-avatar" src={member.avatarUrl} alt="" title={member.displayName} />
            ) : (
              <span key={member.id} className="AvocadoPresence-avatar AvocadoPresence-avatar--initial" title={member.displayName}>
                {member.displayName.charAt(0).toUpperCase()}
              </span>
            )
          )}
        </span>
        {trans('ramon-avocado.forum.presence.reading_now', '{count} reading now', { count: this.presence.count })}
      </span>
    );
  }

  private join() {
    this.leave?.();
    const id = String(this.attrs.discussion?.id?.() || '');
    this.joinedId = id;
    this.presence = { members: [], count: 0 };
    if (!id) return;

    this.leave = joinDiscussionPresence(id, (next) => {
      this.presence = next;
      m.redraw();
    });
  }
}

import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import Tooltip from 'flarum/common/components/Tooltip';

import { trans } from '../../utils';

export function cakedayEnabled(): boolean {
  return !!app.forum?.attribute?.('avocadoCakedayEnabled');
}

/**
 * Anos completos de conta SE hoje é o aniversário de registro do usuário
 * (mesmo dia e mês, com pelo menos 1 ano de casa); null nos demais dias.
 * 29/02 é comemorado em 01/03 nos anos não bissextos, como no Discourse.
 */
export function cakedayYears(user: any): number | null {
  if (!cakedayEnabled()) return null;

  const joined = user?.joinTime?.();
  if (!joined) return null;

  const joinDate = new Date(joined);
  if (isNaN(joinDate.getTime())) return null;

  const now = new Date();
  let month = joinDate.getMonth();
  let day = joinDate.getDate();

  if (month === 1 && day === 29) {
    const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (!leap(now.getFullYear())) {
      month = 2;
      day = 1;
    }
  }

  if (now.getDate() !== day || now.getMonth() !== month) return null;

  const years = now.getFullYear() - joinDate.getFullYear();
  return years >= 1 ? years : null;
}

export interface CakedayBadgeAttrs extends ComponentAttrs {
  user: any;
}

/**
 * 🎂 ao lado do nome no dia do aniversário de conta. Renderiza nada nos outros
 * 364 dias ou com o recurso desligado — custo zero de layout.
 */
export default class CakedayBadge extends Component<CakedayBadgeAttrs> {
  view() {
    const years = cakedayYears(this.attrs.user);
    if (!years) return null;

    return (
      <Tooltip
        text={
          years === 1
            ? (trans('ramon-avocado.forum.cakeday.tooltip_singular', 'Account anniversary — 1 year here today!') as string)
            : (trans('ramon-avocado.forum.cakeday.tooltip_plural', 'Account anniversary — {years} years here today!', { years }) as string)
        }
        position="top"
      >
        <span className="AvocadoCakeday" aria-label={trans('ramon-avocado.forum.cakeday.aria', 'Account anniversary') as string}>
          <i className="fas fa-birthday-cake" aria-hidden="true" />
        </span>
      </Tooltip>
    );
  }
}

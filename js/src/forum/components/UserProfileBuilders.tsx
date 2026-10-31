/**
 * Só os helpers de render chamados no override do UserPage registrado no boot.
 * Ficam separados para o import estático do index.tsx não puxar as páginas de
 * perfil, que vêm por import() dinâmico (UserProfilePage.tsx).
 */
import app from 'flarum/forum/app';
import extractText from 'flarum/common/utils/extractText';
import Avatar from 'flarum/common/components/Avatar';
import AvatarEditor from 'flarum/forum/components/AvatarEditor';
import Dropdown from 'flarum/common/components/Dropdown';
import listItems from 'flarum/common/helpers/listItems';
import SelectDropdown from 'flarum/common/components/SelectDropdown';
import humanTime from 'flarum/common/helpers/humanTime';
import { coverPosition, formatDate, safeCssUrl, trans } from '../utils';
import { bone, BONE_FILL } from './Skeletons';

class ScrollableNav {
  private _el: Element | null = null;
  private _canLeft = false;
  private _canRight = false;
  private _dragging = false;
  private _startX = 0;
  private _scrollLeft0 = 0;
  private _ro: ResizeObserver | null = null;
  private _handleScroll: (() => void) | null = null;
  private _handleMouseDown: ((e: MouseEvent) => void) | null = null;
  private _handleMouseMove: ((e: MouseEvent) => void) | null = null;
  private _handleMouseUp: (() => void) | null = null;

  private _check() {
    const el = this._el as HTMLElement;
    if (!el) return;
    const l = el.scrollLeft > 1;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    if (l !== this._canLeft || r !== this._canRight) {
      this._canLeft = l;
      this._canRight = r;
      m.redraw();
    }
  }

  private _scroll(dir: number) {
    (this._el as HTMLElement)?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  }

  oncreate(vnode: any) {
    const el = vnode.dom.querySelector('.AvocadoUserPage-navInner') as HTMLElement;
    this._el = el;
    if (!el) return;

    this._handleScroll = () => this._check();
    this._handleMouseDown = (e: MouseEvent) => {
      this._dragging = true;
      this._startX = e.pageX - el.offsetLeft;
      this._scrollLeft0 = el.scrollLeft;
      document.documentElement.style.cursor = 'grabbing';
      document.documentElement.style.userSelect = 'none';
    };
    this._handleMouseMove = (e: MouseEvent) => {
      if (!this._dragging) return;
      e.preventDefault();
      el.scrollLeft = this._scrollLeft0 - (e.pageX - el.offsetLeft - this._startX);
    };
    this._handleMouseUp = () => {
      if (!this._dragging) return;
      this._dragging = false;
      document.documentElement.style.cursor = '';
      document.documentElement.style.userSelect = '';
    };

    el.addEventListener('scroll', this._handleScroll!, { passive: true });
    el.addEventListener('mousedown', this._handleMouseDown!);
    window.addEventListener('mousemove', this._handleMouseMove!);
    window.addEventListener('mouseup', this._handleMouseUp!);

    this._ro = new ResizeObserver(() => this._check());
    this._ro.observe(el);
    this._check();

    const activeItem = el.querySelector('li.active') as HTMLElement | null;
    if (activeItem) {
      requestAnimationFrame(() => {
        el.scrollLeft = activeItem.offsetLeft - (el.clientWidth - activeItem.clientWidth) / 2;
      });
    }
  }

  onremove() {
    if (this._el) {
      this._el.removeEventListener('scroll', this._handleScroll!);
      this._el.removeEventListener('mousedown', this._handleMouseDown! as EventListener);
    }
    window.removeEventListener('mousemove', this._handleMouseMove! as EventListener);
    window.removeEventListener('mouseup', this._handleMouseUp!);
    this._ro?.disconnect();
    this._el = null;
  }

  view(vnode: any) {
    return (
      <div className="AvocadoUserPage-nav">
        <button
          className={`AvocadoUserPage-navArrow AvocadoUserPage-navArrow--left${this._canLeft ? ' is-visible' : ''}`}
          onclick={() => this._scroll(-1)}
          aria-label={extractText(app.translator.trans('ramon-avocado.forum.profile.scroll_left'))}
          tabindex="-1"
        >
          <i className="fas fa-chevron-left" aria-hidden="true" />
        </button>
        {vnode.children}
        <button
          className={`AvocadoUserPage-navArrow AvocadoUserPage-navArrow--right${this._canRight ? ' is-visible' : ''}`}
          onclick={() => this._scroll(1)}
          aria-label={extractText(app.translator.trans('ramon-avocado.forum.profile.scroll_right'))}
          tabindex="-1"
        >
          <i className="fas fa-chevron-right" aria-hidden="true" />
        </button>
      </div>
    );
  }
}

/** O componente de bio do fof/user-bio, se a extensão estiver ativa. */
const userBioComponent = (): any => {
  try {
    return (flarum as any).reg.get('fof-user-bio', 'forum/components/UserBio') || null;
  } catch {
    return null;
  }
};

export function buildHero(user: any, isEditable: boolean, controls: any[] = []) {
  if (!user) {
    // A marcação do hero real, com ossos no lugar do texto. Bio e selos ficam de
    // fora: não dá para saber se existem antes de carregar.
    return (
      <div className="AvocadoUserPage-hero AvocadoUserPage-hero--skeleton" aria-hidden="true">
        <div className="AvocadoUserPage-cover" />
        <div className="AvocadoUserPage-hero-inner">
          <div className="AvocadoUserPage-hero-bar">
            <div className="AvocadoUserPage-hero-avatarWrap">
              <span className={`Avatar ${BONE_FILL}`} />
            </div>

            <div className="AvocadoUserPage-hero-identity">
              <div className="AvocadoUserPage-hero-nameRow">
                <div className="AvocadoUserPage-hero-name">{bone('210px')}</div>
              </div>
              <span className="AvocadoUserPage-hero-username">{bone('112px')}</span>
              <div className="AvocadoUserPage-hero-meta">
                <span className="AvocadoUserPage-metaItem">{bone('188px')}</span>
                <span className="AvocadoUserPage-metaItem">{bone('64px')}</span>
              </div>
            </div>

            {/* Só quem está logado tem controles (mensagem, editar…) num perfil. */}
            {app.session.user && (
              <div className="AvocadoUserPage-hero-actions">
                <div className="ButtonGroup Dropdown">
                  <span className={`Button AvocadoUserPage-controlsBtn ${BONE_FILL}`}>
                    <span className="Button-label">{app.translator.trans('core.forum.user_controls.button')}</span>
                    <i className="icon fas fa-caret-down Button-caret" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Admin edita qualquer perfil, então a caixa de bio aparece sempre (nem que seja o convite a escrever). */}
          {app.session.user?.isAdmin?.() && userBioComponent() && (
            <div className="AvocadoUserPage-hero-bio">
              <div className="UserBio editable">
                <div className="UserBio-content">
                  <p className="UserBio-placeholder">{bone('196px')}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const color = user.color?.() || '#5a6480';
  const badges = user.badges?.().toArray?.() || [];
  const isOnline = user.isOnline?.();
  const lastSeen = user.lastSeenAt?.();
  const username = user.username?.();
  const joinTime = user.joinTime?.();

  const joinLabel = joinTime ? formatDate(new Date(joinTime as string), { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  // forumaker/profile-cover estende o UserCard, que este hero substitui: a capa
  // sai de user.cover() direto (undefined sem a extensão). safeCssUrl recusa
  // protocolos perigosos (data:, javascript:).
  const coverUrl = user.cover?.();
  const coverCss = coverUrl ? safeCssUrl(coverUrl) : null;
  const hasCover = coverCss !== null && coverCss !== 'none';

  const heroStyle: Record<string, string> = { '--user-color': color };
  if (hasCover) {
    heroStyle['--user-cover'] = coverCss as string;
    // Pelo mesmo motivo o enquadramento da capa é aplicado aqui: a extensão só o
    // aplica no .UserCard do core.
    heroStyle['--user-cover-position'] = coverPosition(user);
  }

  const onlineLabel = trans('ramon-avocado.forum.user.online', 'Online');

  const UserBio = userBioComponent();
  const bioNode =
    UserBio && user.attribute('canViewBio') ? (
      <div className="AvocadoUserPage-hero-bio">
        <UserBio user={user} editable={isEditable} />
      </div>
    ) : null;

  return (
    <div className={'AvocadoUserPage-hero' + (hasCover ? ' AvocadoUserPage-hero--hasCover' : '')} style={heroStyle}>
      <div className="AvocadoUserPage-cover" />
      <div className="AvocadoUserPage-hero-inner">
        <div className="AvocadoUserPage-hero-bar">
          <div
            className={`AvocadoUserPage-hero-avatarWrap${isOnline ? ' AvocadoUserPage-hero-avatarWrap--online' : ''}`}
            title={isOnline ? (onlineLabel as string) : undefined}
            aria-label={isOnline ? (onlineLabel as string) : undefined}
          >
            {isEditable ? <AvatarEditor user={user} /> : <Avatar user={user} loading="eager" />}
          </div>

          <div className="AvocadoUserPage-hero-identity">
            <div className="AvocadoUserPage-hero-nameRow">
              <h1 className="AvocadoUserPage-hero-name">{user.displayName?.() || username}</h1>
              {badges.length > 0 && <ul className="AvocadoUserPage-hero-badges badges">{listItems(badges)}</ul>}
            </div>
            {username && <span className="AvocadoUserPage-hero-username">@{username}</span>}

            <div className="AvocadoUserPage-hero-meta">
              {/* Posts/discussões não entram aqui — os números já aparecem nas abas abaixo. */}
              {joinLabel && (
                <span className="AvocadoUserPage-metaItem">
                  <i className="far fa-calendar" aria-hidden="true" />
                  {trans('ramon-avocado.forum.profile.member_since', 'Member since {date}', { date: joinLabel })}
                </span>
              )}
              {/* Online é indicado pelo dot no avatar; na meta só "visto há X" quando offline. */}
              {!isOnline && lastSeen && (
                <span className="AvocadoUserPage-metaItem">
                  <i className="far fa-clock" aria-hidden="true" />
                  {humanTime(lastSeen)}
                </span>
              )}
            </div>
          </div>

          {controls.length > 0 && (
            <div className="AvocadoUserPage-hero-actions">
              <Dropdown
                buttonClassName="Button AvocadoUserPage-controlsBtn"
                menuClassName="Dropdown-menu--right"
                label={app.translator.trans('core.forum.user_controls.button') as string}
              >
                {controls}
              </Dropdown>
            </div>
          )}
        </div>

        {bioNode}
      </div>
    </div>
  );
}

/** Larguras dos rótulos das abas no esqueleto (posts, discussões, curtidas, menções…). */
const NAV_BONES = ['96px', '124px', '78px', '88px', '92px'];

export function buildSidebar(page: any) {
  const user = page?.user;
  if (!user) {
    // A lista e os botões de aba de verdade, com um osso no lugar de ícone + rótulo.
    return (
      <div className="AvocadoUserPage-nav AvocadoUserPage-nav--skeleton" aria-hidden="true">
        <ul className="AvocadoUserPage-navInner">
          {NAV_BONES.map((width) => (
            <li key={width}>
              <span className="LinkButton">{bone(width)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <ScrollableNav>
      <ul className="AvocadoUserPage-navInner">{listItems(page.navItems().toArray())}</ul>
    </ScrollableNav>
  );
}

export function buildUserPhoneNav(page: any) {
  const user = page?.user;
  const items = user ? page.navItems().toArray() : [];
  return (
    <nav className="IndexPage-nav sideNav">
      <ul>
        <li className="item item-nav">
          <SelectDropdown className="App-titleControl" buttonClassName="Button">
            {items}
          </SelectDropdown>
        </li>
      </ul>
    </nav>
  );
}

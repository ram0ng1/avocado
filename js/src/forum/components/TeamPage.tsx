import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Avatar from 'flarum/common/components/Avatar';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import humanTime from 'flarum/common/helpers/humanTime';
import trustedHtml from '../../common/trustedHtml';
import { trans, navigate, displayName, safeCssColor } from '../utils';

export default class TeamPage extends Page {
  loading = true;
  members: any[] = [];
  private configuredGroupIds: string[] = [];

  private get skeletonCount(): number {
    return app.forum.attribute<number>('avocadoTeamPageMemberCount') || 6;
  }

  oninit(vnode: any) {
    super.oninit(vnode);
    this.bodyClass = 'App--index';

    const title = app.forum.attribute<string>('avocadoTeamPageTitle') || trans('ramon-avocado.forum.team.title', 'Our Team');
    app.setTitle(title);

    this.load();
  }

  async load() {
    const raw = app.forum.attribute<string>('avocadoTeamPageGroups') || '[]';
    let groupIds: string[];
    try {
      const parsed = JSON.parse(raw);
      groupIds = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      groupIds = [];
    }
    this.configuredGroupIds = groupIds;

    if (groupIds.length) {
      try {
        const results = await Promise.all(
          groupIds.map((gid: string) => app.store.find('users', { filter: { group: gid }, page: { limit: 50 }, include: 'groups' }))
        );
        const seen = new Set<string>();
        this.members = (results as any[]).flat().filter((u: any) => {
          if (seen.has(u.id())) return false;
          seen.add(u.id());
          return true;
        });
      } catch {}
    }

    this.loading = false;
    m.redraw();
  }

  view() {
    const title = app.forum.attribute('avocadoTeamPageTitle') || trans('ramon-avocado.forum.team.title', 'Our Team');
    const desc = app.forum.attribute('avocadoTeamPageDescription') || '';

    return (
      <div className="AvocadoTeamPage">
        <div className="AvocadoNav-helper">
          <IndexSidebar />
        </div>

        <div className="AvocadoTeamPage-header">
          <h1 className="AvocadoTeamPage-title">{title}</h1>
          {desc && <p className="AvocadoTeamPage-description">{desc}</p>}
        </div>

        {this.loading ? (
          <div className="AvocadoTeamPage-grid">
            {Array.from({ length: this.skeletonCount }, (_, i) => (
              <div key={i} className="AvocadoTeamPage-card AvocadoTeamPage-card--skeleton">
                <div className="AvocadoTeamPage-shimmer AvocadoTeamPage-shimmer--avatar" />
                <div className="AvocadoTeamPage-shimmer AvocadoTeamPage-shimmer--name" />
                <div className="AvocadoTeamPage-shimmer AvocadoTeamPage-shimmer--role" />
                <div className="AvocadoTeamPage-shimmer AvocadoTeamPage-shimmer--bio" />
                <div className="AvocadoTeamPage-shimmer AvocadoTeamPage-shimmer--stats" />
              </div>
            ))}
          </div>
        ) : !this.members.length ? (
          <p className="AvocadoTeamPage-empty">{trans('ramon-avocado.forum.team.empty', 'No members found.')}</p>
        ) : (
          <div className="AvocadoTeamPage-grid">{this.members.map((u: any) => this.renderCard(u))}</div>
        )}
      </div>
    );
  }

  renderCard(user: any) {
    const href = (() => {
      try {
        return app.route('user', { username: user.username() });
      } catch {
        return `/u/${user.username()}`;
      }
    })();

    const name = displayName(user);
    const isOnline = user.isOnline?.();
    // fof/user-bio parses and sanitizes the markdown server-side (s9e) and
    // exposes the result as `bioHtml`; mirror its own <UserBio> and render that
    // instead of the raw source. `bio` (plain text) is the fallback for when
    // formatting is disabled or the extension isn't installed.
    const bioHtml = user.bioHtml?.();
    const bio = user.bio?.();
    const discussions = user.discussionCount?.() ?? 0;
    const posts = user.commentCount?.() ?? 0;
    const joinTime = user.joinTime?.();

    const role = (() => {
      const groups: any[] = user.groups?.() ?? [];
      const match = groups.find((g: any) => this.configuredGroupIds.includes(String(g.id())));
      return match ?? groups[0] ?? null;
    })();

    return (
      <a key={user.id()} className="AvocadoTeamPage-card" href={href} onclick={(e: MouseEvent) => navigate(e, href)}>
        <div className="AvocadoTeamPage-card-avatarWrap">
          <Avatar user={user} className="AvocadoTeamPage-card-avatar" />
          {isOnline && <span className="AvocadoTeamPage-card-online" aria-hidden="true" />}
        </div>

        <h3 className="AvocadoTeamPage-card-name">{name}</h3>

        {role &&
          (() => {
            // Validate the admin-set group color before interpolating it into the
            // style attribute — an invalid/crafted value falls back to no inline
            // background instead of injecting extra CSS declarations.
            const roleColor = safeCssColor(role.color?.());
            return (
              <span className="AvocadoTeamPage-card-role" style={roleColor ? `background:${roleColor};color:#fff` : undefined}>
                {role.nameSingular?.() || role.namePlural?.()}
              </span>
            );
          })()}

        {bioHtml ? (
          <div className="AvocadoTeamPage-card-bio">{trustedHtml(bioHtml)}</div>
        ) : bio ? (
          <p className="AvocadoTeamPage-card-bio">{bio}</p>
        ) : null}

        <p className="AvocadoTeamPage-card-stats">
          {discussions} {trans('ramon-avocado.forum.team.discussions', 'discussions')}
          {' · '}
          {posts} {trans('ramon-avocado.forum.team.posts', 'posts')}
        </p>

        {joinTime && (
          <span className="AvocadoTeamPage-card-joined">
            {trans('ramon-avocado.forum.team.member_since', 'Since')} {humanTime(joinTime)}
          </span>
        )}
      </a>
    );
  }
}

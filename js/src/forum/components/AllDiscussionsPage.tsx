// @ts-nocheck
import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Avatar from 'flarum/common/components/Avatar';
import TextEditor from 'flarum/common/components/TextEditor';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import {
  trans, navigate, renderThreadSkeleton, renderLoadMore, renderEmpty,
  displayName, FALLBACK_COLORS, safeRoute,
} from '../utils';
import ThreadCard from './shared/ThreadCard';
import SortDropdown, { SortOption } from './shared/SortDropdown';
import WsUpdateBanner from './shared/WsUpdateBanner';

const SORT_OPTIONS: SortOption[] = [
  { key: 'latest',   label: () => trans('ramon-avocado.forum.search.sort_latest',   'Latest'),   sort: '-lastPostedAt' },
  { key: 'top',      label: () => trans('ramon-avocado.forum.search.sort_top',       'Top'),      sort: '-commentCount' },
  { key: 'newest',   label: () => trans('ramon-avocado.forum.search.sort_newest',   'Newest'),   sort: '-createdAt'    },
  { key: 'oldest',   label: () => trans('ramon-avocado.forum.search.sort_oldest',   'Oldest'),   sort: 'createdAt'     },
  { key: 'trending', label: () => trans('ramon-avocado.forum.home.sort_trending',   'Trending'), sort: '-lastPostedAt' },
];

const PAGE_SIZE = 20;

export default class AllDiscussionsPage extends Page {
  private discussions: any[] = [];
  private loading = false;
  private _initialLoading = true;
  private hasMore = false;
  private sort: string = 'latest';
  private offset = 0;
  private likingIds   = new Set<string>();
  private _wsUpdates  = 0;
  private _wsHandler: ((d: any) => void) | null = null;
  private _likeHandler: ((d: any) => void) | null = null;
  private _unlikeHandler: ((d: any) => void) | null = null;
  private _deletedHandler: ((d: any) => void) | null = null;
  private _pinnedHandler: ((d: any) => void) | null = null;
  private _updatedLikeIds = new Set<string>();
  private _pendingDiscs   = new Map<string, any>();
  private _newDiscIds     = new Set<string>();
  private _selfActionIds  = new Set<string>();

  // Composer + online users state
  private onlineUsers: any[]   = [];
  private composerOpen         = false;
  private composerTitle        = '';
  private composerBody         = '';
  private composerTags: any[]  = [];
  private composerPreview      = false;
  private composerSubmitting   = false;
  private composerProxy: any   = {};
  private tagPickerOpen        = false;
  private tagBypassReqs        = false;
  private tagFilter            = '';
  private _tagPickerOutside: ((e: any) => void) | null = null;
  private _previewInterval: ReturnType<typeof setInterval> | null = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.bodyClass = 'App--index';
    this.sort = m.route.param('sort') || 'latest';
    this.loadDiscussions(true);
    this.loadOnlineUsers();
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);

    this._tagPickerOutside = (e: any) => {
      if (!this.tagPickerOpen) return;
      if (!e.target.closest?.('.AvocadoHome-tagPicker')) {
        this.tagPickerOpen = false;
        this.tagFilter = '';
        m.redraw();
      }
    };
    document.addEventListener('click', this._tagPickerOutside);

    if (!app.pusher) return;

    this._wsHandler = (data: any) => {
      const discId = String(data?.discussionId || '');
      if (!discId) return;
      app.store
        .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then((disc: any) => {
          if (!disc) return;
          const exists = this.discussions.some((d) => String(d.id?.() || '') === discId);
          if (exists) { m.redraw(); } else { this._pendingDiscs.set(discId, disc); m.redraw(); }
        })
        .catch(() => { this._wsUpdates++; m.redraw(); });
    };

    const handleLike = (data: any) => {
      const discId = String(data?.discussionId || '');
      if (!discId) return;
      const isSelf = this._selfActionIds.has(discId);
      if (isSelf) this._selfActionIds.delete(discId);
      app.store
        .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then(() => {
          if (!isSelf) {
            this._updatedLikeIds.add(discId);
            setTimeout(() => { this._updatedLikeIds.delete(discId); m.redraw(); }, 500);
          }
          m.redraw();
        })
        .catch(() => {});
    };
    this._likeHandler   = handleLike;
    this._unlikeHandler = handleLike;

    this._deletedHandler = (data: any) => {
      const discId = String(data?.discussionId || '');
      if (!discId) return;
      if (!this.discussions.some((d) => String(d.id?.() || '') === discId) && !this._pendingDiscs.has(discId)) return;
      app.store.find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then(() => m.redraw()).catch(() => {});
    };

    this._pinnedHandler = (data: any) => {
      const discId = String(data?.discussionId || '');
      if (!discId) return;
      app.store.find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then((disc: any) => {
          if (!disc) return;
          if (this.discussions.some((d) => String(d.id?.() || '') === discId)) {
            this.discussions.sort((a, b) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0));
          }
          m.redraw();
        })
        .catch(() => {});
    };

    if (typeof app.pusher.then === 'function') {
      app.pusher.then(({ channels }: any) => {
        if (!channels?.main) return;
        channels.main.bind('newPost',          this._wsHandler);
        channels.main.bind('postLiked',        this._likeHandler);
        channels.main.bind('postUnliked',      this._unlikeHandler);
        channels.main.bind('postDeleted',      this._deletedHandler);
        channels.main.bind('discussionPinned', this._pinnedHandler);
      });
    }
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    if (this._tagPickerOutside) document.removeEventListener('click', this._tagPickerOutside);
    if (!app.pusher || typeof app.pusher.then !== 'function') return;
    app.pusher.then(({ channels }: any) => {
      if (!channels?.main) return;
      if (this._wsHandler)      channels.main.unbind('newPost',          this._wsHandler);
      if (this._likeHandler)    channels.main.unbind('postLiked',        this._likeHandler);
      if (this._unlikeHandler)  channels.main.unbind('postUnliked',      this._unlikeHandler);
      if (this._deletedHandler) channels.main.unbind('postDeleted',      this._deletedHandler);
      if (this._pinnedHandler)  channels.main.unbind('discussionPinned', this._pinnedHandler);
    });
  }

  // ── Data loading ─────────────────────────────────────────────────────────────

  private getSortParam(): string {
    return SORT_OPTIONS.find((o) => o.key === this.sort)?.sort || '-lastPostedAt';
  }

  private loadDiscussions(reset: boolean) {
    if (this.loading) return;
    if (reset) { this.discussions = []; this.offset = 0; this.hasMore = false; }
    this.loading = true;
    m.redraw();
    app.store
      .find('discussions', {
        sort: this.getSortParam(),
        page: { offset: this.offset, limit: PAGE_SIZE },
        include: 'user,firstPost,lastPostedUser,lastPost,tags',
      })
      .then((results: any) => {
        const items    = Array.isArray(results) ? results : [];
        const combined = reset ? [...items] : [...this.discussions, ...items];
        combined.sort((a, b) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0));
        this.discussions      = combined;
        this.hasMore          = !!(results.payload?.links?.next);
        this.offset          += items.length;
        this.loading          = false;
        this._initialLoading  = false;
        m.redraw();
      })
      .catch(() => { this.loading = false; this._initialLoading = false; m.redraw(); });
  }

  loadOnlineUsers() {
    const win = window as any;
    if (Array.isArray(win.__avocadoOnlineUsers)) {
      this.onlineUsers = win.__avocadoOnlineUsers;
      return;
    }

    const injected = app.forum?.attribute('avocadoOnlineUsers');
    if (Array.isArray(injected)) {
      this.onlineUsers = injected;
      return;
    }
  }

  private toggleLike(discussion: any) {
    const firstPost = discussion.firstPost?.();
    if (!firstPost) return;
    const id = discussion.id?.() as string;
    if (this.likingIds.has(id)) return;
    const likes   = firstPost.likes?.() || [];
    const isLiked = app.session.user && likes.some((u: any) => u === app.session.user);
    this.likingIds.add(id);
    this._selfActionIds.add(id);
    m.redraw();
    firstPost.save({ isLiked: !isLiked })
      .then(() => { this.likingIds.delete(id); m.redraw(); })
      .catch(() => { this.likingIds.delete(id); this._selfActionIds.delete(id); m.redraw(); });
  }

  private flushPending() {
    const pending = Array.from(this._pendingDiscs.values());
    this._pendingDiscs.clear();
    this._wsUpdates = 0;
    pending.forEach((disc) => {
      const discId = String(disc.id?.() || '');
      const existingIdx = this.discussions.findIndex((d) => String(d.id?.() || '') === discId);
      if (existingIdx >= 0) this.discussions.splice(existingIdx, 1);
      const insertPos = this.discussions.findIndex((d) => !d.isSticky?.());
      this.discussions.splice(insertPos >= 0 ? insertPos : 0, 0, disc);
      this._newDiscIds.add(discId);
    });
    m.redraw();
    setTimeout(() => { this._newDiscIds.clear(); m.redraw(); }, 4000);
  }

  // ── Composer ─────────────────────────────────────────────────────────────────

  openInlineComposer() {
    if (!app.session.user) {
      app.modal.show(() => flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal'));
      return;
    }
    if (this.composerOpen) return;
    this.composerOpen    = true;
    this.composerPreview = false;
    this.composerTitle   = '';
    this.composerBody    = '';
    this.composerTags    = [];
    this.tagPickerOpen   = false;
    this.tagBypassReqs   = false;
    this.tagFilter       = '';
    this.composerProxy = {
      isVisible: () => true,
      fields: { content: () => this.composerBody },
    };
    this._previewInterval = null;
    m.redraw();
    setTimeout(() => {
      const el = document.querySelector('.AvocadoHome-composerTitle');
      if (el) (el as HTMLElement).focus();
    }, 50);
  }

  isComposerValid() {
    const title = this.composerTitle.trim();
    const body  = this.composerBody.trim();
    if (!title || !body) return false;
    if (!this.tagBypassReqs) {
      const minP = parseInt(app.forum.attribute('minPrimaryTags')) || 0;
      const minS = parseInt(app.forum.attribute('minSecondaryTags')) || 0;
      const chosenPrimary = this.composerTags.filter((t) => t.position?.() !== null && !t.isChild?.()).length;
      const chosenSecond  = this.composerTags.filter((t) => t.position?.() === null).length;
      const selectableTags = app.store.all('tags').filter(Boolean);
      if (selectableTags.length && (chosenPrimary < minP || chosenSecond < minS)) return false;
    }
    return true;
  }

  submitInlineComposer() {
    if (this.composerSubmitting) return;
    const title = this.composerTitle.trim();
    const body  = this.composerBody.trim();
    if (!title || !body) return;
    if (!this.tagBypassReqs) {
      const minP = parseInt(app.forum.attribute('minPrimaryTags')) || 0;
      const minS = parseInt(app.forum.attribute('minSecondaryTags')) || 0;
      const chosenPrimary = this.composerTags.filter((t) => t.position?.() !== null && !t.isChild?.()).length;
      const chosenSecond  = this.composerTags.filter((t) => t.position?.() === null).length;
      const selectableTags = app.store.all('tags').filter(Boolean);
      if (selectableTags.length && (chosenPrimary < minP || chosenSecond < minS)) {
        this.tagPickerOpen = true;
        m.redraw();
        return;
      }
    }
    this.composerSubmitting = true;
    m.redraw();
    const data: any = { title, content: body };
    if (this.composerTags.length > 0) {
      data.relationships = { tags: this.composerTags };
    }
    app.store.createRecord('discussions').save(data).then((discussion: any) => {
      this.composerOpen       = false;
      this.composerSubmitting = false;
      this.composerTitle      = '';
      this.composerBody       = '';
      this.composerTags       = [];
      this.tagPickerOpen      = false;
      this.tagBypassReqs      = false;
      this.tagFilter          = '';
      m.redraw();
      if (discussion?.id?.()) {
        const route = app.route('discussion', { id: discussion.id(), slug: discussion.slug?.() || discussion.id() });
        m.route.set(route);
      }
    }).catch(() => {
      this.composerSubmitting = false;
      m.redraw();
    });
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  _injectToolbarBtns(container: any) {
    const ul = container?.querySelector?.('ul.TextEditor-controls');
    if (!ul) return;

    const isPreview    = this.composerPreview;
    const isValid      = this.isComposerValid();
    const isSubmitting = this.composerSubmitting;

    const iconCls    = isPreview ? 'icon fas fa-pen' : 'icon far fa-eye';
    const label      = isPreview
      ? trans('ramon-avocado.forum.home.composer_edit', 'Edit')
      : trans('ramon-avocado.forum.home.composer_preview', 'Preview');
    const previewCls = `Button Button--icon Button--link AvocadoHome-composerPreviewBtn${isPreview ? ' is-active' : ''}`;

    const existingPreview = ul.querySelector('.item-avocadoPreview');
    if (existingPreview) {
      const b = existingPreview.querySelector('button');
      const i = existingPreview.querySelector('i');
      if (b) { b.className = previewCls; b.setAttribute('aria-label', label); }
      if (i) { i.className = iconCls; }
    } else {
      const li = document.createElement('li');
      li.className = 'item-avocadoPreview';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = previewCls;
      btn.setAttribute('aria-label', label);
      const icon = document.createElement('i');
      icon.setAttribute('aria-hidden', 'true');
      icon.className = iconCls;
      btn.appendChild(icon);
      btn.addEventListener('click', (e: any) => {
        e.preventDefault(); e.stopPropagation();
        this.composerPreview = !this.composerPreview;
        m.redraw();
      });
      li.appendChild(btn);
      ul.insertBefore(li, ul.firstChild);
    }

    const submitCls = `Button Button--primary AvocadoHome-composer-submit${isSubmitting ? ' is-loading' : ''}${!isValid ? ' is-disabled' : ''}`;
    const submitTxt = isSubmitting
      ? trans('ramon-avocado.forum.home.composer_submitting', 'Posting…')
      : trans('ramon-avocado.forum.home.composer_post', 'Post Discussion');

    const existingPost = ul.querySelector('.item-avocadoPost');
    if (existingPost) {
      const btnPost = existingPost.querySelector('button') as HTMLButtonElement | null;
      if (btnPost) {
        btnPost.className = submitCls;
        btnPost.disabled = isSubmitting || !isValid;
        btnPost.textContent = submitTxt;
      }
    } else {
      const spacer = document.createElement('li');
      spacer.className = 'item-avocadoSpacer';
      ul.appendChild(spacer);

      const liClose = document.createElement('li');
      liClose.className = 'item-avocadoClose';
      const btnClose = document.createElement('button');
      btnClose.type = 'button';
      btnClose.className = 'Button AvocadoHome-composer-cancel';
      btnClose.textContent = trans('ramon-avocado.forum.home.composer_close', 'Close');
      btnClose.addEventListener('click', () => {
        this.composerOpen = false; this.composerPreview = false;
        this.composerTitle = ''; this.composerBody = '';
        this.composerTags = []; this.tagPickerOpen = false;
        this.tagBypassReqs = false; this.tagFilter = '';
        m.redraw();
      });
      liClose.appendChild(btnClose);
      ul.appendChild(liClose);

      const liPost = document.createElement('li');
      liPost.className = 'item-avocadoPost';
      const btnPost = document.createElement('button') as HTMLButtonElement;
      btnPost.type = 'button';
      btnPost.className = submitCls;
      btnPost.disabled = isSubmitting || !isValid;
      btnPost.textContent = submitTxt;
      btnPost.addEventListener('click', () => this.submitInlineComposer());
      liPost.appendChild(btnPost);
      ul.appendChild(liPost);
    }
  }

  renderAvatar(user: any, className = '') {
    if (!user) return null;
    return <Avatar user={user} className={className || undefined} title={displayName(user)} />;
  }

  renderOnlineAvatars() {
    if (!app.forum?.attribute('avocadoShowOnlineUsers')) return null;
    if (!this.onlineUsers.length) return null;

    const MAX_SHOWN = 6;
    const total = this.onlineUsers.length;
    const shown = this.onlineUsers.slice(0, MAX_SHOWN);
    const isPlain = shown[0] && typeof shown[0].username === 'string';

    const GRADIENTS = [
      'linear-gradient(135deg,#ffd166,#f28482)',
      'linear-gradient(135deg,#89cff0,#6b7fc4)',
      'linear-gradient(135deg,#9eea6c,#337d63)',
      'linear-gradient(135deg,#f0b213,#e84393)',
      'linear-gradient(135deg,#c5ccff,#b5e3ff)',
      'linear-gradient(135deg,#ffb5a7,#fcd5ce)',
    ];

    return (
      <div className="AvocadoHome-onlineAvatars">
        <div className="AvocadoHome-onlineAvatars-row">
          {shown.map((user: any, i: number) => {
            const key        = isPlain ? user.id : user.id?.();
            const userModel  = isPlain ? (key ? app.store.getById('users', String(key)) : null) : user;
            const username   = userModel?.username?.() || (isPlain ? user.username : '');
            const name       = userModel?.displayName?.() || userModel?.username?.() || (isPlain ? (user.displayName || user.username) : displayName(user));
            const avatarUrl  = userModel?.avatarUrl?.() || (isPlain ? (user.avatarUrl || null) : null);
            const profileHref = safeRoute('user', { username });
            const fallbackBg = GRADIENTS[i % GRADIENTS.length];
            return (
              <a
                key={key}
                className="AvocadoHome-onlineAvatars-item"
                href={profileHref}
                onclick={(e: any) => { e.stopPropagation(); navigate(e, profileHref); }}
                title={name}
                style={avatarUrl ? {} : { background: fallbackBg }}
              >
                {avatarUrl && (
                  <img src={avatarUrl} alt={name} className="Avatar" width="28" height="28" decoding="async" />
                )}
              </a>
            );
          })}
        </div>
        {app.forum?.attribute('avocadoShowOnlineCount') !== false && (
          <span className="AvocadoHome-onlineAvatars-count">{total} online</span>
        )}
      </div>
    );
  }

  renderTagPicker() {
    const rawMaxP = parseInt(app.forum.attribute('maxPrimaryTags'));
    const rawMaxS = parseInt(app.forum.attribute('maxSecondaryTags'));
    const maxPrimary = isNaN(rawMaxP) ? Infinity : rawMaxP;
    const maxSecond  = isNaN(rawMaxS) ? Infinity : rawMaxS;
    const minPrimary = parseInt(app.forum.attribute('minPrimaryTags'))  || 0;
    const minSecond  = parseInt(app.forum.attribute('minSecondaryTags')) || 0;
    const canBypass  = !!app.forum.attribute('canBypassTagCounts');

    const selected     = this.composerTags;
    const bypass       = this.tagBypassReqs;
    const primaryCount = selected.filter((t: any) => t.position?.() !== null && !t.isChild?.()).length;
    const secondCount  = selected.filter((t: any) => t.position?.() === null).length;

    const allTags  = app.store.all('tags').filter(Boolean);
    const rootTags = allTags
      .filter((t: any) => !t.isChild?.())
      .sort((a: any, b: any) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999));

    const tagItems: any[] = [];
    for (const root of rootTags) {
      tagItems.push({ tag: root, isChild: false });
      allTags
        .filter((t: any) => t.isChild?.() && t.parent?.()?.id?.() === root.id?.())
        .sort((a: any, b: any) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999))
        .forEach((child: any) => tagItems.push({ tag: child, isChild: true }));
    }

    const visibleItems = (maxSecond === 0 && !bypass)
      ? tagItems.filter(({ isChild }: any) => !isChild)
      : tagItems;

    const filterText = (this.tagFilter || '').toLowerCase();
    const filtered = filterText
      ? visibleItems.filter(({ tag }: any) => tag.name?.().toLowerCase().includes(filterText))
      : visibleItems;

    const canSelectTag = (tag: any) => {
      if (bypass || selected.includes(tag)) return true;
      const isPrimary = tag.position?.() !== null && !tag.isChild?.();
      if (!isPrimary && primaryCount === 0) return false;
      if (isPrimary && primaryCount >= maxPrimary) return false;
      if (!isPrimary && secondCount >= maxSecond) return false;
      return true;
    };

    let instruction = '';
    if (!bypass) {
      if (primaryCount < minPrimary) {
        const n = minPrimary - primaryCount;
        instruction = n === 1 ? 'Choose 1 primary tag' : `Choose ${n} primary tags`;
      } else if (secondCount < minSecond) {
        const n = minSecond - secondCount;
        instruction = n === 1 ? 'Choose 1 secondary tag' : `Choose ${n} secondary tags`;
      }
    }

    const addTag = (tag: any) => {
      const next = [...selected];
      const parent = tag.parent?.();
      if (parent && parent !== false && !next.includes(parent)) next.push(parent);
      next.push(tag);
      this.composerTags = next;
      this.tagFilter = '';
      m.redraw();
    };

    const removeTag = (tag: any) => {
      this.composerTags = this.composerTags.filter(
        (t: any) => t !== tag && t.parent?.()?.id?.() !== tag.id?.()
      );
      m.redraw();
    };

    return (
      <div className="AvocadoHome-tagPicker">
        <button
          className={`AvocadoHome-tagPickerTrigger${this.tagPickerOpen ? ' is-open' : ''}`}
          type="button"
          onclick={(e: any) => {
            e.preventDefault();
            e.stopPropagation();
            this.tagPickerOpen = !this.tagPickerOpen;
            if (!this.tagPickerOpen) this.tagFilter = '';
            m.redraw();
          }}
        >
          <i className="fas fa-tag" aria-hidden="true" />
          {selected.length === 0 && (
            <span className="AvocadoHome-tagPickerPlaceholder">
              {instruction || trans('ramon-avocado.forum.home.choose_tags', 'Choose tags')}
            </span>
          )}
          {selected.map((tag: any) => {
            const tagColor = tag.color?.() || null;
            return (
              <span
                key={tag.id?.()}
                className="AvocadoHome-tagChip"
                style={tagColor ? { '--tag-color': tagColor } : {}}
                onclick={(e: any) => { e.preventDefault(); e.stopPropagation(); removeTag(tag); }}
                title="Remove tag"
              >
                {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                {tag.name?.()}
                <i className="fas fa-times AvocadoHome-tagChipRemoveIcon" aria-hidden="true" />
              </span>
            );
          })}
          <i className={`fas fa-chevron-${this.tagPickerOpen ? 'up' : 'down'} AvocadoHome-tagPickerChevron`} aria-hidden="true" />
        </button>

        {this.tagPickerOpen && (
          <div className="AvocadoHome-tagPickerDropdown">
            <div className="AvocadoHome-tagPickerSearch">
              <i className="fas fa-search" aria-hidden="true" />
              <input
                type="text"
                placeholder={trans('ramon-avocado.forum.home.filter_tags', 'Filter tags')}
                value={this.tagFilter || ''}
                oninput={(e: any) => { this.tagFilter = e.target.value; m.redraw(); }}
                onclick={(e: any) => e.stopPropagation()}
                oncreate={(vnode: any) => { setTimeout(() => vnode.dom.focus(), 0); }}
              />
            </div>
            {filtered.length === 0
              ? <span className="AvocadoHome-tagPickerEmpty">{trans('ramon-avocado.forum.home.no_tags_found', 'No tags found')}</span>
              : <ul className="AvocadoHome-tagPickerList">
                  {filtered.map(({ tag, isChild }: any) => {
                    const tagId     = tag.id?.();
                    const isSelected = selected.includes(tag);
                    const tagColor  = tag.color?.() || FALLBACK_COLORS[0];
                    const selectable = canSelectTag(tag);
                    return (
                      <li
                        key={tagId}
                        className={[
                          'AvocadoHome-tagPickerItem',
                          isChild    && 'is-child',
                          isSelected && 'is-selected',
                          !selectable && !isSelected && 'is-disabled',
                        ].filter(Boolean).join(' ')}
                        onclick={(e: any) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!selectable && !isSelected) return;
                          isSelected ? removeTag(tag) : addTag(tag);
                        }}
                      >
                        <span className="AvocadoHome-tagPickerItem-icon" style={{ background: tagColor }}>
                          {tag.icon?.()
                            ? <i className={tag.icon()} aria-hidden="true" />
                            : <i className="fas fa-tag" aria-hidden="true" />
                          }
                        </span>
                        <span className="AvocadoHome-tagPickerItem-name">{tag.name?.()}</span>
                        {tag.description?.() && (
                          <span className="AvocadoHome-tagPickerItem-desc">{tag.description()}</span>
                        )}
                        {isSelected && <i className="fas fa-check AvocadoHome-tagPickerItem-check" aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ul>
            }
            {canBypass && (
              <label className="AvocadoHome-tagPickerBypass" onclick={(e: any) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={this.tagBypassReqs}
                  onchange={(e: any) => { this.tagBypassReqs = e.target.checked; m.redraw(); }}
                />
                {' Bypass tag requirements'}
              </label>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── View ─────────────────────────────────────────────────────────────────────

  view() {
    const user     = app.session.user;
    const homeHref = app.route('index');

    return (
      <div className="AvocadoDiscussions">
        <div className="AvocadoNav-helper"><IndexSidebar /></div>

        <div className="AvocadoDiscussions-header">
          <h1 className="AvocadoDiscussions-title">
            {trans('ramon-avocado.forum.discussions.title', 'All discussions')}
          </h1>
          <div className="AvocadoDiscussions-controls">
            <SortDropdown
              options={SORT_OPTIONS}
              currentKey={this.sort}
              onChange={(key: string) => { this.sort = key; this.loadDiscussions(true); }}
            />
            <a
              className="AvocadoDiscussions-homeLink"
              href={homeHref}
              onclick={(e: Event) => navigate(e as MouseEvent, homeHref)}
            >
              <i className="fas fa-arrow-left" aria-hidden="true" />
              {trans('ramon-avocado.forum.discussions.home', 'Home')}
            </a>
          </div>
        </div>

        {/* ── Online users ──────────────────────────────────────────────────── */}
        {(() => {
          const avatars = this.renderOnlineAvatars();
          return avatars ? <div className="AvocadoDiscussions-onlineBlock">{avatars}</div> : null;
        })()}

        {/* ── Post input / inline composer ─────────────────────────────────── */}
        {user && !this.composerOpen && (
          <div
            className="AvocadoHome-postInput"
            onclick={this.openInlineComposer.bind(this)}
          >
            <div className="AvocadoHome-postInput-inner">
              {this.renderAvatar(user, 'AvocadoHome-postInput-avatar')}
              <span className="AvocadoHome-postInput-placeholder">
                {trans('ramon-avocado.forum.home.start_discussion', 'Tell everyone what are you working on...')}
              </span>
              <button
                className="AvocadoHome-postInput-newBtn"
                type="button"
                onclick={(e: any) => { e.stopPropagation(); this.openInlineComposer(); }}
              >
                <i className="fas fa-plus" aria-hidden="true" />
                {trans('ramon-avocado.forum.home.new_discussion', 'New discussion')}
              </button>
            </div>
          </div>
        )}

        {/* ── Inline composer ───────────────────────────────────────────────── */}
        {this.composerOpen && (
          <div className="AvocadoHome-composer">
            <div className="AvocadoHome-composer-header">
              <div className="AvocadoHome-composer-avatar">
                {this.renderAvatar(user)}
              </div>
              <input
                className="AvocadoHome-composerTitle"
                type="text"
                placeholder={trans('ramon-avocado.forum.home.composer_title_placeholder', 'Discussion title…')}
                value={this.composerTitle}
                oninput={(e: any) => { this.composerTitle = e.target.value; }}
              />
            </div>
            <div className="AvocadoHome-composer-tags">
              {this.renderTagPicker()}
            </div>
            <div
              className={`AvocadoHome-composerBody${this.composerPreview ? ' is-preview' : ''}`}
              oncreate={(vnode: any) => { setTimeout(() => this._injectToolbarBtns(vnode.dom), 0); }}
              onupdate={(vnode: any) => { this._injectToolbarBtns(vnode.dom); }}
            >
              {/* TextEditor — hidden (display:none) in preview mode via CSS */}
              <TextEditor
                composer={this.composerProxy}
                value={this.composerBody}
                placeholder={trans('ramon-avocado.forum.home.composer_body_placeholder', 'Tell everyone what are you working on...')}
                onchange={(value: string) => { this.composerBody = value; m.redraw(); }}
                onsubmit={() => this.submitInlineComposer()}
              />

              {/* Preview area — replicates Flarum ComposerPostPreview: setInterval polls content,
                  vnode.dom captured in closure avoids stale-ref issues, no Mithril children */}
              <div className="AvocadoHome-composerPreviewArea">
                <article className="CommentPost Post">
                  <div className="Post-container">
                    <div
                      className="Post-body"
                      oncreate={(vnode: any) => {
                        let lastContent: string | undefined;
                        let wasPreview = false;
                        const update = () => {
                          const isPreview = this.composerPreview;
                          if (!isPreview) {
                            lastContent = undefined;
                            wasPreview = false;
                            return;
                          }
                          const content = this.composerBody || '';
                          // Force re-render whenever preview just became active
                          const justOpened = !wasPreview;
                          wasPreview = true;
                          if (!justOpened && lastContent === content) return;
                          lastContent = content;
                          setTimeout(() => {
                            // Guard: check visibility when the macrotask actually fires
                            if (!this.composerPreview) return;
                            if (!content.trim()) {
                              vnode.dom.innerHTML = '';
                              const span = document.createElement('span');
                              span.className = 'AvocadoHome-composerPreviewEmpty';
                              span.textContent = trans('ramon-avocado.forum.home.composer_preview_empty', 'Nothing to preview.');
                              vnode.dom.appendChild(span);
                            } else {
                              const s9e = (window as any).s9e;
                              if (s9e?.TextFormatter?.preview) {
                                s9e.TextFormatter.preview(content, vnode.dom);
                                (app as any).visuals?.processPost?.(vnode.dom);
                                // Sticker/lottie spans use an async fetch; if the canvas
                                // wasn't created (slow fetch or hidden container), clone and
                                // replace the span so the observer starts a clean fetch.
                                setTimeout(() => {
                                  if (!this.composerPreview) return;
                                  vnode.dom.querySelectorAll('.Sticker--tgs, .Sticker--lottie').forEach((el: Element) => {
                                    if (el.querySelector('canvas')) return;
                                    const clone = el.cloneNode(true) as Element;
                                    clone.removeAttribute('data-tgs-init');
                                    clone.removeAttribute('data-lottie-init');
                                    el.parentNode?.replaceChild(clone, el);
                                  });
                                }, 200);
                              } else {
                                vnode.dom.textContent = content;
                              }
                            }
                          }, 0);
                        };
                        update();
                        this._previewInterval = setInterval(update, 50);
                      }}
                      onremove={() => {
                        clearInterval(this._previewInterval!);
                        this._previewInterval = null;
                      }}
                    />
                  </div>
                </article>
              </div>

            </div>
          </div>
        )}

        <WsUpdateBanner
          pendingCount={this._pendingDiscs.size + this._wsUpdates}
          onFlush={() => this.flushPending()}
        />

        <div className="AvocadoHome-threadStack">
          {this.discussions.length === 0 && this._initialLoading
            ? renderThreadSkeleton(5)
            : this.discussions.length === 0
              ? renderEmpty(trans('ramon-avocado.forum.discussions.empty', 'No discussions found.'))
              : this.discussions.map((d) => (
                <ThreadCard
                  key={d.id?.()}
                  discussion={d}
                  context={this}
                  likingIds={this.likingIds}
                  updatedLikeIds={this._updatedLikeIds}
                  newDiscIds={this._newDiscIds}
                  onToggleLike={(disc: any) => this.toggleLike(disc)}
                />
              ))
          }
          {this.discussions.length > 0 && this.loading && renderThreadSkeleton(3)}
        </div>

        {this.hasMore && !this.loading && renderLoadMore(
          trans('ramon-avocado.forum.discussions.load_more', 'Load more'),
          () => this.loadDiscussions(false)
        )}
      </div>
    );
  }
}

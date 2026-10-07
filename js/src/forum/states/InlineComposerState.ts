import app from 'flarum/forum/app';
import { trans, uploadDiscussionHeroImage, tagsAreChangelogProducts, changelogAttributes } from '../utils';

/** Contador do menu de rascunhos do fof (`draftCount` do usuário): o delete não devolve o usuário, então desce aqui como no fof. */
const adjustDraftCount = (delta: number): void => {
  const attributes = (app.session.user as any)?.data?.attributes;
  if (!attributes) return;
  attributes.draftCount = Math.max(0, (Number(attributes.draftCount) || 0) + delta);
};

/**
 * State backing the inline new-discussion composer.
 *
 * Owns the form fields, tag selection (with bypass-requirements toggle for
 * privileged users), preview/submit flags, and the submission flow itself.
 *
 * Pages should:
 *  1. Instantiate one state per composer.
 *  2. Bind it to a `<InlineComposer state={...} onSubmitted={...} />`.
 *  3. Call `state.reset()` after closing.
 */
export default class InlineComposerState {
  title = '';
  body = '';
  tags: any[] = [];
  preview = false;
  /** Tela cheia do cartão flutuante: a prévia, quando ligada, fica ao lado do editor. */
  fullScreen = false;
  submitting = false;
  tagBypassReqs = false;
  tagPickerOpen = false;
  tagFilter = '';

  // Optional hero image attached to the new discussion when one of the
  // selected tags is in `app.forum.attribute('avocadoHeroImageTags')`.
  // Lives only on the client until submit() succeeds — at that point the
  // file is POSTed to /api/avocado/discussion-hero and the discussion model
  // is patched in the local store so the next page load already shows it.
  heroImageFile: File | null = null;
  heroImagePreview: string | null = null;

  // Campos do changelog (só usados quando uma tag escolhida é um produto): o
  // número da versão e o banner na cor da tag, que vale na ausência de imagem.
  changelogVersion = '';
  /** Capa colorida, já codificada (utils/cover); 'color' = automática, null = sem capa colorida. */
  changelogCover: string | null = 'color';

  // fof/drafts: o rascunho salvo a partir deste compositor. O fof só cuida do
  // compositor do core (ComposerState.draft), então este guarda o seu aqui.
  draft: any = null;
  savingDraft = false;
  draftJustSaved = false;

  /** Required by Flarum's TextEditor — proxies the live composer body. */
  composerProxy = {
    isVisible: () => true,
    fields: { content: () => this.body },
  };

  // ── Validation ─────────────────────────────────────────────────────────

  isValid(): boolean {
    if (!this.title.trim() || !this.body.trim()) return false;
    if (this.tagBypassReqs) return true;
    return this.tagsMeetMinimums();
  }

  /**
   * True when the current tag selection satisfies `minPrimaryTags` /
   * `minSecondaryTags`. Always true when no tags exist on the forum.
   */
  tagsMeetMinimums(): boolean {
    const minP = parseInt(app.forum.attribute('minPrimaryTags') as string) || 0;
    const minS = parseInt(app.forum.attribute('minSecondaryTags') as string) || 0;
    const primary = this.tags.filter((t) => t.position?.() !== null && !t.isChild?.()).length;
    const secondary = this.tags.filter((t) => t.position?.() === null).length;
    const selectableCount = app.store.all('tags').filter(Boolean).length;
    if (selectableCount === 0) return true;
    return primary >= minP && secondary >= minS;
  }

  // ── Tag mutations ──────────────────────────────────────────────────────

  addTag(tag: any): void {
    if (this.tags.includes(tag)) return;
    const next = [...this.tags];
    const parent = tag.parent?.();
    if (parent && parent !== false && !next.includes(parent)) next.push(parent);
    next.push(tag);
    this.tags = next;
    this.tagFilter = '';
  }

  removeTag(tag: any): void {
    this.tags = this.tags.filter((t) => t !== tag && t.parent?.()?.id?.() !== tag.id?.());
  }

  // ── Hero image attachment ──────────────────────────────────────────────

  setHeroImageFile(file: File | null): void {
    if (this.heroImagePreview) {
      try {
        URL.revokeObjectURL(this.heroImagePreview);
      } catch {
        /* noop */
      }
    }
    this.heroImageFile = file;
    this.heroImagePreview = file ? URL.createObjectURL(file) : null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  reset(): void {
    this.title = '';
    this.body = '';
    this.tags = [];
    this.preview = false;
    this.submitting = false;
    this.tagBypassReqs = false;
    this.tagPickerOpen = false;
    this.tagFilter = '';
    this.setHeroImageFile(null);
    this.changelogVersion = '';
    this.changelogCover = 'color';
    this.draft = null;
    this.savingDraft = false;
    this.draftJustSaved = false;
  }

  // ── Drafts (fof/drafts) ────────────────────────────────────────────────

  /** `canSaveDrafts` só existe com o fof/drafts ativo e quem tem a permissão. */
  canSaveDraft(): boolean {
    return !!app.forum.attribute('canSaveDrafts');
  }

  /**
   * Salva (ou atualiza) o rascunho no mesmo formato que o compositor do core
   * grava: título, conteúdo, tags em `relationships` e os campos do changelog
   * em `extra` — assim abrir o rascunho pelo menu do fof ou publicá-lo agendado
   * funciona igual. A imagem do hero fica de fora: só existe no navegador.
   */
  saveDraft(): Promise<void> {
    if (this.savingDraft || !this.canSaveDraft() || !this.body.trim()) return Promise.resolve();

    this.savingDraft = true;
    m.redraw();

    const payload: any = {
      title: this.title,
      content: this.body,
      relationships: { tags: { data: this.tags.map((tag) => ({ type: 'tags', id: tag.id() })) } },
      extra: tagsAreChangelogProducts(this.tags) ? changelogAttributes(this.changelogVersion, this.changelogCover, !!this.heroImageFile) : {},
    };

    const isNew = !this.draft;
    const request = isNew ? app.store.createRecord('drafts').save(payload) : this.draft.save(payload);

    return request
      .then((draft: any) => {
        // O contador sobe sozinho: a resposta do create já traz o usuário com o `draftCount` novo.
        if (isNew) this.draft = draft;
        this.draftJustSaved = true;
        setTimeout(() => {
          this.draftJustSaved = false;
          m.redraw();
        }, 300);
      })
      .catch((err: any) => console.error('Draft save failed:', err))
      .finally(() => {
        this.savingDraft = false;
        m.redraw();
      });
  }

  /** Publicada a discussão, o rascunho de onde ela veio sai da lista (como no core). */
  private discardDraft(): void {
    const draft = this.draft;
    this.draft = null;
    if (!draft?.exists) return;
    draft.delete().then(() => {
      adjustDraftCount(-1);
      m.redraw();
    });
  }

  /**
   * Submit the discussion. Returns the saved Discussion on success.
   * Rejects without changing state if validation fails.
   */
  submit(): Promise<any> {
    if (this.submitting) return Promise.reject(new Error('already submitting'));
    if (!this.title.trim() || !this.body.trim()) return Promise.reject(new Error('empty fields'));
    if (!this.tagBypassReqs && !this.tagsMeetMinimums()) {
      this.tagPickerOpen = true;
      m.redraw();
      return Promise.reject(new Error('tags below minimum'));
    }

    this.submitting = true;
    m.redraw();

    const data: any = { title: this.title.trim(), content: this.body.trim() };
    if (this.tags.length > 0) data.relationships = { tags: this.tags };
    if (tagsAreChangelogProducts(this.tags)) {
      Object.assign(data, changelogAttributes(this.changelogVersion, this.changelogCover, !!this.heroImageFile));
    }

    return app.store
      .createRecord('discussions')
      .save(data)
      .then(async (discussion: any) => {
        // If the user picked a hero image, upload it now that we have an ID.
        // Failures here don't roll the discussion back — we just keep it
        // imageless and surface an alert so the user can retry from the
        // discussion page later.
        if (this.heroImageFile) {
          try {
            const result = await uploadDiscussionHeroImage(discussion.id(), this.heroImageFile);
            // Patch the local store so the next render of the discussion
            // already shows the hero image without a refresh.
            const data = (discussion as any).data;
            if (data?.attributes) {
              data.attributes.heroImagePath = result.heroImagePath;
              data.attributes.heroImageUrl = result.heroImageUrl;
            }
          } catch (err) {
            try {
              app.alerts.show(
                { type: 'error' },
                trans(
                  'ramon-avocado.forum.home.composer_hero_image_upload_failed',
                  'Could not upload the hero image. You can try again on the discussion page.'
                )
              );
            } catch {
              /* alerts may be unavailable in some contexts */
            }
          }
        }

        this.discardDraft();
        this.submitting = false;
        return discussion;
      })
      .catch((err: any) => {
        this.submitting = false;
        m.redraw();
        throw err;
      });
  }
}

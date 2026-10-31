import app from 'flarum/forum/app';
import { trans, uploadDiscussionHeroImage, tagsAreChangelogProducts, changelogAttributes } from '../utils';

/** Contador do menu de rascunhos do fof (`draftCount` do usuário): o delete não devolve o usuário, então desce aqui como no fof. */
const adjustDraftCount = (delta: number): void => {
  const attributes = (app.session.user as any)?.data?.attributes;
  if (!attributes) return;
  attributes.draftCount = Math.max(0, (Number(attributes.draftCount) || 0) + delta);
};

/**
 * Estado do compositor de nova discussão do tema: campos, tags (com o "ignorar
 * requisitos" para quem pode), flags de prévia/envio e o envio em si.
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

  // Imagem do hero opcional, quando uma das tags está em `avocadoHeroImageTags`.
  // Fica só no cliente até o submit(); aí vai para /api/avocado/discussion-hero e
  // o model local é atualizado, para a discussão já abrir com ela.
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

  /** Exigido pelo TextEditor do Flarum: repassa o corpo do compositor. */
  composerProxy = {
    isVisible: () => true,
    fields: { content: () => this.body },
  };

  isValid(): boolean {
    if (!this.title.trim() || !this.body.trim()) return false;
    if (this.tagBypassReqs) return true;
    return this.tagsMeetMinimums();
  }

  /** A seleção atende `minPrimaryTags`/`minSecondaryTags`; sempre true sem tags no fórum. */
  tagsMeetMinimums(): boolean {
    const minP = parseInt(app.forum.attribute('minPrimaryTags') as string) || 0;
    const minS = parseInt(app.forum.attribute('minSecondaryTags') as string) || 0;
    const primary = this.tags.filter((t) => t.position?.() !== null && !t.isChild?.()).length;
    const secondary = this.tags.filter((t) => t.position?.() === null).length;
    const selectableCount = app.store.all('tags').filter(Boolean).length;
    if (selectableCount === 0) return true;
    return primary >= minP && secondary >= minS;
  }

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
   * Envia a discussão e devolve a salva. Rejeita sem mexer no estado se a
   * validação falhar.
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
        // Falha no upload da imagem não desfaz a discussão: ela fica sem imagem e um
        // alerta deixa o usuário tentar de novo na página da discussão.
        if (this.heroImageFile) {
          try {
            const result = await uploadDiscussionHeroImage(discussion.id(), this.heroImageFile);
            // Atualiza o store local para a discussão já abrir com a imagem.
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
              /* alertas podem não existir */
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

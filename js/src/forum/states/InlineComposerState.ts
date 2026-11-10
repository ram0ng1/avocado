import app from 'flarum/forum/app';
import { handleErrorsHere, requestErrorMessage, showRequestError, validationErrors } from '../../common/requestErrors';
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
  /** Por que a última imagem escolhida foi recusada (mostrado junto do chip). */
  heroImageError: string | null = null;

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
  /** O último salvamento do rascunho falhou (o botão mostra um aviso por alguns segundos). */
  draftFailed = false;
  /** Erros de validação do servidor, por campo (`title`, `content`) ou `form`. */
  fieldErrors: Record<string, string> = {};

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
    this.heroImageError = null;
    this.changelogVersion = '';
    this.changelogCover = 'color';
    this.draft = null;
    this.savingDraft = false;
    this.draftJustSaved = false;
    this.draftFailed = false;
    this.fieldErrors = {};
  }

  /** Erro de título ou texto vai para baixo do campo; o resto, para baixo do botão. */
  private showSubmitErrors(error: any): void {
    const errors = validationErrors(error);

    for (const { field, message } of errors) {
      const key = field === 'title' || field === 'content' ? field : 'form';
      this.fieldErrors[key] = this.fieldErrors[key] ? `${this.fieldErrors[key]} ${message}` : message;
    }

    if (!errors.length) {
      this.fieldErrors.form = requestErrorMessage(
        error,
        trans('ramon-avocado.forum.composer.publish_failed', 'Could not publish the discussion. Check your connection and try again.')
      );
    }
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
    const request = isNew ? app.store.createRecord('drafts').save(payload, handleErrorsHere) : this.draft.save(payload, handleErrorsHere);

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
      .catch((error: any) => {
        this.draftFailed = true;
        showRequestError(error, trans('ramon-avocado.forum.composer.draft_failed', 'Could not save the draft. Try again.'));
        setTimeout(() => {
          this.draftFailed = false;
          m.redraw();
        }, 4000);
      })
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
    this.fieldErrors = {};
    m.redraw();

    const data: any = { title: this.title.trim(), content: this.body.trim() };
    if (this.tags.length > 0) data.relationships = { tags: this.tags };
    if (tagsAreChangelogProducts(this.tags)) {
      Object.assign(data, changelogAttributes(this.changelogVersion, this.changelogCover, !!this.heroImageFile));
    }

    return app.store
      .createRecord('discussions')
      .save(data, handleErrorsHere)
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
          } catch (error) {
            app.alerts.show({ type: 'error' }, heroUploadFailedAfterPublish(error));
          }
        }

        this.discardDraft();
        this.submitting = false;
        return discussion;
      })
      .catch((err: any) => {
        this.submitting = false;
        this.showSubmitErrors(err);
        m.redraw();
        throw err;
      });
  }
}

/**
 * A discussão já foi publicada e só a imagem ficou para trás: diz isso, o
 * motivo, e onde adicionar a imagem depois.
 */
export function heroUploadFailedAfterPublish(error: unknown): string {
  return trans(
    'ramon-avocado.forum.cover_image.upload_failed_after_publish',
    'Your discussion was published, but the cover image wasn’t uploaded ({reason}). Add it with the “Add image” button at the top of the discussion.',
    { reason: requestErrorMessage(error, trans('ramon-avocado.forum.cover_image.connection_problem', 'connection problem')) }
  );
}

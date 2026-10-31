import app from 'flarum/forum/app';
import Stream from 'flarum/common/utils/Stream';

// O que o próprio core, o flarum/tags e o tema põem no DiscussionComposer. Qualquer
// outra chave vem de uma extensão (idioma, enquete, campos do Mason, reCAPTCHA…)
// que o compositor inline do tema não sabe desenhar nem enviar.
const KNOWN_HEADER_ITEMS = ['title', 'discussionTitle', 'tags', 'avocadoHeroImage'];
const KNOWN_DATA_KEYS = ['title', 'content', 'relationships'];
const KNOWN_RELATIONSHIPS = ['tags'];

const loadDiscussionComposer = (): Promise<any> => (flarum as any).reg.asyncModuleImport('flarum/forum/components/DiscussionComposer');

/**
 * O fof/discussion-templates preenche o corpo pelo ComposerState do core; só
 * importa quando há de fato um modelo configurado.
 */
function hasDiscussionTemplates(): boolean {
  if (!('fof-discussion-templates' in flarum.extensions)) return false;
  if (app.forum.attribute('fof-discussion-templates.no_tag_template')) return true;

  return app.store.all<any>('tags').some((tag) => !!tag.template?.());
}

/**
 * Monta um DiscussionComposer fora da tela, com um estado falso, e compara o
 * cabeçalho e o `data()` com o que o tema conhece. Os hooks de `oninit`,
 * `headerItems` e `data` das extensões rodam aqui exatamente como no compositor
 * real; se algum deles lançar, a resposta é usar o do core.
 */
function extendedByExtensions(DiscussionComposer: any): boolean {
  const composer: any = {
    fields: { content: Stream(''), title: Stream(''), tags: [] },
    body: { attrs: {} },
    editor: null,
    preventClosingWhen() {},
    bodyMatches: () => true,
    isFullScreen: () => false,
  };

  try {
    const probe = Object.create(DiscussionComposer.prototype);
    probe.oninit({ attrs: { composer, user: app.session.user }, state: probe });

    const header = Object.keys(probe.headerItems().toObject());
    if (header.some((key) => !KNOWN_HEADER_ITEMS.includes(key))) return true;

    const data = probe.data() || {};
    if (Object.keys(data).some((key) => !KNOWN_DATA_KEYS.includes(key))) return true;

    return Object.keys(data.relationships || {}).some((key) => !KNOWN_RELATIONSHIPS.includes(key));
  } catch {
    return true;
  }
}

let cached: Promise<boolean> | null = null;

/**
 * Diz se a nova discussão precisa ir pelo compositor do core em vez do inline
 * do tema. A resposta não muda durante a sessão (depende das extensões ativas
 * e das permissões do usuário), então fica guardada.
 */
export function needsCoreComposer(): Promise<boolean> {
  if (!cached) {
    cached = hasDiscussionTemplates() ? Promise.resolve(true) : loadDiscussionComposer().then(extendedByExtensions, () => false);
  }

  return cached;
}

/** Abre o compositor do core para uma nova discussão, já com as tags escolhidas. */
export function openCoreDiscussionComposer(tags: any[] = []): Promise<void> {
  return app.composer.load(loadDiscussionComposer, { user: app.session.user }).then(() => {
    if (tags.length) (app.composer.fields as any).tags = tags;
    app.composer.show();
    m.redraw();
  });
}

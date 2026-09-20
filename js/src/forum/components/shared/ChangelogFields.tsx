import Component from 'flarum/common/Component';
import { trans, safeCssColor, getChangelogProductIds, CHANGELOG_VERSION_MAX } from '../../utils';
import { COVER_PRESETS, coverGradient, parseCover, resolveCover } from '../../utils/cover';

/** Máximo de tags na capa — espelha o formato aceito pelo servidor (Api\ChangelogFields). */
const MAX_COVER_TAGS = 5;

export interface ChangelogFieldsProps {
  /** As tags escolhidas no compositor — dão as cores que a capa pode usar. */
  tags: any[];
  version: string;
  onVersion: (value: string) => void;
  /** Valor codificado da capa colorida (ver utils/cover); null = sem capa colorida. */
  cover: string | null;
  onCover: (value: string | null) => void;
  /** Uma imagem escolhida vale mais que a cor: o seletor de cor some. */
  hasImage: boolean;
}

/** O produto escolhido e as sub-tags de tipo dele — as únicas tags que fazem sentido como fonte de cor. */
const colorSources = (tags: any[]): any[] => {
  const products = getChangelogProductIds();
  const list = (tags || []).filter(Boolean);
  const product = list.find((t) => products.has(String(t.id?.())));
  if (!product) return [];

  const types = list
    .filter((t) => String(t.parent?.()?.id?.() ?? '') === String(product.id()))
    .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999));

  return [product, ...types].filter((t) => safeCssColor(t.color?.()));
};

export interface CoverPickerAttrs {
  tags: any[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** `hero`: botão no estilo dos controles de imagem do cabeçalho da versão (painel alinhado à direita). */
  variant?: 'chip' | 'hero';
}

/**
 * O chip "Capa na cor da tag" com um painel para escolher de onde vêm as cores:
 * automática (produto → 1º tipo), uma ou várias tags, ou uma predefinição. Fica
 * na linha do chip de imagem; o painel abre por baixo e fecha ao clicar fora ou
 * com Esc.
 */
export class CoverPicker extends Component<CoverPickerAttrs> {
  private open = false;

  /** `CloseWatcher` do painel enquanto ele está aberto (ver setOpen). */
  private watcher: { destroy: () => void; onclose: (() => void) | null } | null = null;

  private setOpen(open: boolean) {
    if (this.open === open) return;
    this.open = open;
    this.watcher?.destroy();
    this.watcher = null;

    // O modal do Flarum 2 fecha com a API CloseWatcher — não é um `keydown`, então
    // stopPropagation não segura. O observador mais novo recebe o Esc primeiro: com o
    // do painel no topo, o Esc fecha só o painel e o "Editar versão" continua aberto.
    // (Criado no clique que abre o painel, tem ativação do usuário e grupo próprio.)
    if (open && 'CloseWatcher' in window) {
      try {
        const watcher = new (window as any).CloseWatcher();
        watcher.onclose = () => {
          this.watcher = null;
          this.open = false;
          m.redraw();
        };
        this.watcher = watcher;
      } catch {
        /* sem suporte/ativação: fica só o keydown abaixo */
      }
    }

    m.redraw();
  }

  private onDocumentClick = (e: Event) => {
    if (this.open && !this.element?.contains(e.target as Node | null)) this.setOpen(false);
  };

  // Em captura e com stopPropagation: o compositor do Flarum também fecha com Esc, e
  // sem isto o mesmo toque fecharia o painel E descartaria o rascunho. Com um
  // CloseWatcher ativo é ele quem fecha o painel (o evento segue sem preventDefault).
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.open) return;
    e.stopPropagation();
    if (!this.watcher) this.setOpen(false);
  };

  oncreate(vnode: any) {
    super.oncreate(vnode);
    document.addEventListener('click', this.onDocumentClick, true);
    document.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('resize', this.place);
    window.addEventListener('scroll', this.place, true);
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    this.watcher?.destroy();
    this.watcher = null;
    document.removeEventListener('click', this.onDocumentClick, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('resize', this.place);
    window.removeEventListener('scroll', this.place, true);
  }

  /**
   * Põe o painel no lugar. Absoluto ele era cortado pelo `overflow: hidden` do
   * cabeçalho da versão e pela borda do compositor; `fixed` escapa dos dois e é
   * mantido dentro da janela: abre por baixo do botão e, se não couber, por cima,
   * com rolagem própria quando nenhum dos lados comporta o painel todo.
   *
   * Feito no DOM (oncreate/onupdate do painel, resize e scroll), não no vnode: é
   * preciso medir o painel, e um ancestral com `transform` — o modal do Flarum —
   * vira o bloco de referência do `fixed`; a diferença entre onde o painel deveria
   * estar e onde caiu corrige isso sem saber quem é o ancestral.
   */
  private place = () => {
    const pop = this.element?.querySelector<HTMLElement>('.AvocadoChangelogField-pop');
    const anchor = this.element?.querySelector('button')?.getBoundingClientRect();
    if (!pop || !anchor) return;

    const margin = 8;
    const width = Math.min(330, window.innerWidth - margin * 2);
    pop.style.width = `${width}px`;
    pop.style.maxHeight = 'none';

    const natural = pop.offsetHeight;
    const below = window.innerHeight - anchor.bottom - margin * 2;
    const above = anchor.top - margin * 2;
    const placeBelow = natural <= below || below >= above;
    const height = Math.min(natural, Math.max(160, placeBelow ? below : above));

    const alignRight = this.attrs.variant === 'hero';
    const left = Math.max(margin, Math.min(alignRight ? anchor.right - width : anchor.left, window.innerWidth - width - margin));
    const top = Math.max(margin, placeBelow ? anchor.bottom + margin : anchor.top - margin - height);

    pop.style.maxHeight = `${height}px`;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    const box = pop.getBoundingClientRect();
    if (Math.abs(box.left - left) > 0.5 || Math.abs(box.top - top) > 0.5) {
      pop.style.left = `${left + (left - box.left)}px`;
      pop.style.top = `${top + (top - box.top)}px`;
    }
  };

  view() {
    const { tags, value, onChange, variant = 'chip' } = this.attrs;
    const hero = variant === 'hero';
    const parsed = parseCover(value);
    const resolved = resolveCover(value, tags);
    const sources = colorSources(tags);
    const chosen = new Set(parsed.mode === 'tags' ? parsed.tagIds : []);
    const auto = resolveCover('color', tags);

    const toggleTag = (id: string) => {
      const current = parsed.mode === 'tags' ? [...parsed.tagIds] : [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id].slice(-MAX_COVER_TAGS);
      onChange(next.length ? `tags:${next.join(',')}` : 'color');
    };

    let label = trans('ramon-avocado.forum.changelog.cover_color', 'Tag colour cover');
    if (parsed.mode === 'off') label = trans('ramon-avocado.forum.changelog.cover_off', 'No cover (tag default)');
    if (parsed.mode === 'preset') label = trans(`ramon-avocado.forum.changelog.cover_preset_${parsed.preset}`, parsed.preset ?? '');
    if (parsed.mode === 'tags') {
      label = trans('ramon-avocado.forum.changelog.cover_tags_count', '{count} tag colours', { count: parsed.tagIds.length });
    }

    return (
      <div className={`AvocadoChangelogField-picker${hero ? ' AvocadoChangelogField-picker--hero' : ''}`}>
        <button
          type="button"
          className={
            hero
              ? 'DiscussionHero-imageBtn AvocadoChangelogField-heroBtn'
              : `AvocadoHome-composerHeroChip AvocadoChangelogField-color${parsed.mode !== 'off' ? ' is-set' : ''}`
          }
          aria-haspopup="dialog"
          aria-expanded={this.open ? 'true' : 'false'}
          onclick={() => this.setOpen(!this.open)}
        >
          <span className="AvocadoChangelogField-swatch" style={resolved?.gradient ? { background: resolved.gradient } : undefined} aria-hidden="true" />
          <span>{hero ? trans('ramon-avocado.forum.changelog.cover_change', 'Cover colour') : label}</span>
          <i className="fas fa-chevron-down AvocadoChangelogField-caret" aria-hidden="true" />
        </button>

        {this.open && (
          <div
            className="AvocadoChangelogField-pop"
            oncreate={this.place}
            onupdate={this.place}
            role="dialog"
            aria-label={trans('ramon-avocado.forum.changelog.cover_title', 'Cover colour')}
          >
            <div className="AvocadoChangelogField-popTitle">{trans('ramon-avocado.forum.changelog.cover_title', 'Cover colour')}</div>

            <button
              type="button"
              className={`AvocadoChangelogField-option${parsed.mode === 'color' ? ' is-active' : ''}`}
              onclick={() => onChange('color')}
            >
              <span className="AvocadoChangelogField-swatch" style={auto?.gradient ? { background: auto.gradient } : undefined} aria-hidden="true" />
              <span className="AvocadoChangelogField-optionText">
                <strong>{trans('ramon-avocado.forum.changelog.cover_auto', 'Automatic')}</strong>
                <small>{trans('ramon-avocado.forum.changelog.cover_auto_help', 'From the product colour to the first change type.')}</small>
              </span>
            </button>

            {sources.length > 0 && (
              <div className="AvocadoChangelogField-group">
                <div className="AvocadoChangelogField-popLabel">{trans('ramon-avocado.forum.changelog.cover_from_tags', 'From tags (pick one or more)')}</div>
                <div className="AvocadoChangelogField-tagList">
                  {sources.map((tag: any) => {
                    const id = String(tag.id());
                    const on = chosen.has(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`AvocadoChangelogField-tagOption${on ? ' is-active' : ''}`}
                        aria-pressed={on ? 'true' : 'false'}
                        onclick={() => toggleTag(id)}
                      >
                        <span className="AvocadoChangelogField-dot" style={{ background: safeCssColor(tag.color?.()) ?? undefined }} aria-hidden="true" />
                        {tag.name()}
                        {on && <i className="fas fa-check" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="AvocadoChangelogField-group">
              <div className="AvocadoChangelogField-popLabel">{trans('ramon-avocado.forum.changelog.cover_presets', 'Presets')}</div>
              <div className="AvocadoChangelogField-presets">
                {COVER_PRESETS.map((preset) => {
                  const name = trans(`ramon-avocado.forum.changelog.cover_preset_${preset.key}`, preset.key);
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`AvocadoChangelogField-preset${parsed.preset === preset.key ? ' is-active' : ''}`}
                      style={{ background: coverGradient([preset.a, preset.b]) ?? undefined }}
                      aria-label={name}
                      aria-pressed={parsed.preset === preset.key ? 'true' : 'false'}
                      onclick={() => onChange(`preset:${preset.key}`)}
                    >
                      <span>{name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button type="button" className="AvocadoChangelogField-off" onclick={() => onChange(null)}>
              <i className="fas fa-ban" aria-hidden="true" />
              {trans('ramon-avocado.forum.changelog.cover_off', 'No cover (tag default)')}
            </button>
          </div>
        )}
      </div>
    );
  }
}

/**
 * Os chips do changelog no compositor, ao lado do chip de imagem do hero: o
 * campo da versão e o seletor da capa colorida. Devolve elementos para o
 * chamador colocar dentro da linha `.AvocadoHome-composerHeroChipRow`, que é a
 * mesma nos dois compositores (modal e inline da home) e no modal de renomear.
 */
export const changelogChips = (props: ChangelogFieldsProps): any[] => {
  const { tags, version, onVersion, cover, onCover, hasImage } = props;
  const chips: any[] = [
    <label key="version" className={`AvocadoHome-composerHeroChip AvocadoChangelogField-version${version.trim() ? ' is-set' : ''}`}>
      <i className="fas fa-code-branch" aria-hidden="true" />
      <input
        type="text"
        className="AvocadoChangelogField-input"
        maxlength={CHANGELOG_VERSION_MAX}
        value={version}
        placeholder={trans('ramon-avocado.forum.changelog.version_placeholder', 'Version (e.g. v2.4.0)')}
        aria-label={trans('ramon-avocado.forum.changelog.version_label', 'Version')}
        oninput={(e: Event) => onVersion((e.target as HTMLInputElement).value)}
        onkeydown={(e: KeyboardEvent) => {
          // Enter aqui não deve enviar o compositor nem pular para o editor.
          if (e.key === 'Enter') e.preventDefault();
          (e as any).redraw = false;
        }}
      />
    </label>,
  ];

  if (!hasImage) {
    chips.push(<CoverPicker key="cover" tags={tags} value={cover} onChange={onCover} />);
  }

  return chips;
};

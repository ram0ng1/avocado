import app from 'flarum/admin/app';
import { extend } from 'flarum/common/extend';
import Stream from 'flarum/common/utils/Stream';
import Button from 'flarum/common/components/Button';
import classList from 'flarum/common/utils/classList';
import extractText from 'flarum/common/utils/extractText';
import textContrastClass from 'flarum/common/helpers/textContrastClass';
import type ItemList from 'flarum/common/utils/ItemList';
import EditTagModal from 'ext:flarum/tags/admin/components/EditTagModal';
import type Mithril from 'mithril';

import { svgIconName, svgIconVnode, tagIconSvgActive } from '../common/tagIconSvg';

/** Espelha SvgIconSanitizer::MAX_BYTES no servidor. */
const MAX_BYTES = 102400;

type Modal = EditTagModal & {
  iconSvg: Stream<string>;
  iconSvgMono: Stream<boolean>;
  iconSvgError: Stream<string | null>;
  /** Nome do arquivo escolhido nesta sessão; vazio quando o SVG veio do servidor. */
  iconSvgName: Stream<string>;
  /** Um arquivo está sendo arrastado por cima da área. */
  iconSvgOver: Stream<boolean>;
};

const trans = (key: string, params: Record<string, unknown> = {}) => app.translator.trans(`ramon-avocado.admin.edit_tag.${key}`, params);

const maxKb = Math.round(MAX_BYTES / 1024);

function looksLikeSvg(code: string): boolean {
  const trimmed = code.trim();

  return /<svg[\s>]/i.test(trimmed) && /<\/svg>$/i.test(trimmed);
}

/** Valida e guarda o SVG lido do arquivo; string vazia remove o ícone. */
function setSvg(this: Modal, code: string, fileName = '') {
  if (!code.trim()) {
    this.iconSvg('');
    this.iconSvgName('');
    this.iconSvgError(null);
    return;
  }

  if (new Blob([code]).size > MAX_BYTES) {
    this.iconSvgError(extractText(trans('svg_too_large', { max: maxKb })));
    return;
  }

  if (!looksLikeSvg(code)) {
    this.iconSvgError(extractText(trans('svg_invalid')));
    return;
  }

  // Arquivo inválido não substitui o ícone que já estava salvo: só mostra o erro.
  this.iconSvg(code);
  this.iconSvgName(fileName);
  this.iconSvgError(null);
}

function readFile(this: Modal, file: File | undefined) {
  if (!file) return;

  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
    this.iconSvgError(extractText(trans('svg_invalid')));
    return;
  }

  file.text().then((text) => {
    setSvg.call(this, text, file.name);
    m.redraw();
  });
}

function pickFile(this: Modal) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.svg,image/svg+xml';
  input.onchange = () => readFile.call(this, input.files?.[0]);
  input.click();
}

function preview(name: string | null, className: string, style: Record<string, string | undefined>): Mithril.Children {
  return (
    <div className={classList('TagIconSvgField-preview', className)} style={style}>
      {name ? svgIconVnode(name) : <i className="far fa-image" aria-hidden="true" />}
    </div>
  );
}

function svgField(this: Modal): Mithril.Children {
  const code = this.iconSvg();
  const hasIcon = !!code.trim();
  const color = this.color() || undefined;
  const name = hasIcon ? svgIconName(code, this.iconSvgMono()) : null;
  const dropProps = {
    ondragover: (e: DragEvent) => {
      e.preventDefault();
      this.iconSvgOver(true);
    },
    ondragleave: () => this.iconSvgOver(false),
    ondrop: (e: DragEvent) => {
      e.preventDefault();
      this.iconSvgOver(false);
      readFile.call(this, e.dataTransfer?.files?.[0]);
    },
  };

  return (
    <div className="Form-group TagIconSvgField">
      <label>{trans('svg_label')}</label>
      <div className="helpText">{trans('svg_text')}</div>

      <div
        className={classList('TagIconSvgField-zone', { 'has-icon': hasIcon, 'is-over': this.iconSvgOver(), 'has-error': !!this.iconSvgError() })}
        {...dropProps}
      >
        <div className="TagIconSvgField-previews">
          {preview(name, classList('TagIconSvgField-preview--onColor', color && textContrastClass(color)), { '--tag-bg': color })}
          {preview(name, 'TagIconSvgField-preview--plain', { '--color': color })}
        </div>

        <div className="TagIconSvgField-info">
          <div className="TagIconSvgField-title">{hasIcon ? this.iconSvgName() || trans('svg_current') : trans('svg_drop_title')}</div>
          <div className="TagIconSvgField-hint">{hasIcon ? trans('svg_replace_hint') : trans('svg_drop_hint', { max: maxKb })}</div>
        </div>

        <div className="TagIconSvgField-actions">
          <Button className="Button" icon="fas fa-upload" onclick={() => pickFile.call(this)}>
            {hasIcon ? trans('svg_replace_button') : trans('svg_upload_button')}
          </Button>
          {hasIcon && (
            <Button className="Button Button--icon" icon="fas fa-trash" aria-label={extractText(trans('svg_remove_button'))} onclick={() => setSvg.call(this, '')} />
          )}
        </div>
      </div>

      {this.iconSvgError() && <div className="TagIconSvgField-error">{this.iconSvgError()}</div>}

      <label className="TagIconSvgField-switch">
        <input type="checkbox" bidi={this.iconSvgMono} />
        <span className="TagIconSvgField-track" aria-hidden="true" />
        <span className="TagIconSvgField-switchText">
          <strong>{trans('svg_mono_title')}</strong>
          <small>{trans('svg_mono_help')}</small>
        </span>
      </label>
    </div>
  );
}

/**
 * Campo de SVG no modal "Editar tag" do flarum/tags. Só age com o switch do tema
 * ligado (`tagIconSvgActive`): desligado, o modal fica exatamente como o core o desenha
 * e o payload de salvar não leva `iconSvg`, que o servidor recusaria.
 *
 * O SVG entra só por arquivo (escolhido ou arrastado): não há campo para colar
 * código. O servidor sanitiza de qualquer jeito, mas um textarea de 100 KB de
 * markup no meio de um modal de tag é ruído para quem só quer trocar o ícone.
 */
export default function extendEditTagModal() {
  extend(EditTagModal.prototype, 'oninit', function (this: EditTagModal) {
    if (!tagIconSvgActive()) return;

    const modal = this as unknown as Modal;

    modal.iconSvg = Stream(this.tag.attribute<string | null>('iconSvg') || '');
    modal.iconSvgMono = Stream(this.tag.attribute<boolean | null>('iconSvgMono') !== false);
    modal.iconSvgError = Stream<string | null>(null);
    modal.iconSvgName = Stream('');
    modal.iconSvgOver = Stream(false);

    // O flarum/tags semeia o campo Font Awesome a partir de tag.icon(), que agora
    // responde com o marcador do SVG quando há um. Devolve a classe guardada.
    this.icon(this.tag.attribute<string | null>('icon') || '');
  });

  extend(EditTagModal.prototype, 'submitData', function (this: EditTagModal, data: Record<string, unknown>) {
    const modal = this as unknown as Modal;

    if (!modal.iconSvg) return;

    data.iconSvg = modal.iconSvg().trim() || null;
    data.iconSvgMono = modal.iconSvgMono();
  });

  extend(EditTagModal.prototype, 'fields', function (this: EditTagModal, items: ItemList<any>) {
    const modal = this as unknown as Modal;

    if (!modal.iconSvg) return;

    // Logo abaixo do campo Font Awesome, acima do checkbox "hidden" (que o
    // flarum/tags põe com a mesma prioridade do campo de ícone).
    if (items.has('hidden')) items.setPriority('hidden', 9);

    items.add('iconSvg', svgField.call(modal), 9.5);
  });
}

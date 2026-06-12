import app from 'flarum/admin/app';
import { AdminComponent, getStr, saveSetting, trans } from '../util';
import { SPINNER_OPTIONS } from '../spinners';

export default class SpinnerPicker extends AdminComponent {
  _customTimer: any = null;
  oninit(vnode: any) {
    super.oninit(vnode);
    this._customTimer = null;
  }

  view() {
    const current = getStr('avocado.loading_spinner_style', 'avocado');
    return (
      <div className="Form-group">
        <label className="AvocadoAdmin-label">{trans('ramon-avocado.admin.settings.loading_spinner_style_label', 'Spinner style')}</label>
        <div className="AvocadoSpinnerPicker">
          {SPINNER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`AvocadoSpinnerOption${current === opt.key ? ' is-selected' : ''}`}
              onclick={() => {
                app.data.settings['avocado.loading_spinner_style'] = opt.key;
                m.redraw();
                saveSetting({ 'avocado.loading_spinner_style': opt.key });
              }}
            >
              <div className="AvocadoSpinnerOption-preview" style={opt.color ? 'color: var(--primary-color)' : ''}>
                {m.trust(opt.svg) /* SVGs estáticos de SPINNER_OPTIONS, do próprio bundle; nosemgrep: flarum-v2-m-trust */}
              </div>
              <span className="AvocadoSpinnerOption-label">{opt.label}</span>
            </button>
          ))}
        </div>
        {current === 'custom' && (
          <div className="AvocadoAdmin-subGroup" style="margin-top:12px">
            <div className="Form-group">
              <label className="AvocadoAdmin-label">{trans('ramon-avocado.admin.settings.spinner_custom_code_label', 'Custom spinner code')}</label>
              <textarea
                className="FormControl AvocadoAdmin-codeField"
                rows={6}
                placeholder='<svg xmlns="http://www.w3.org/2000/svg" ...>...</svg>'
                value={getStr('avocado.loading_spinner_custom')}
                oninput={(e: any) => {
                  const val = e.target.value;
                  app.data.settings['avocado.loading_spinner_custom'] = val;
                  clearTimeout(this._customTimer);
                  this._customTimer = setTimeout(() => saveSetting({ 'avocado.loading_spinner_custom': val }), 800);
                }}
              />
              <p className="helpText">
                {trans('ramon-avocado.admin.settings.spinner_custom_code_help', 'Paste any SVG or HTML to use as the loading spinner.')}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
}

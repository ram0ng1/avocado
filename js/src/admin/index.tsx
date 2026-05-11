// @ts-nocheck — large bootstrap file; typed incrementally
import UploadImageButton from 'flarum/common/components/UploadImageButton';
import Component from 'flarum/common/Component';
import Switch from 'flarum/common/components/Switch';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import { override } from 'flarum/common/extend';

// ─── Translation helper ───────────────────────────────────────────────────────
const trans = (key, fallback) => {
  const out = app.translator?.trans(key);
  return out && out !== key ? out : fallback;
};

// ─── URL helpers ──────────────────────────────────────────────────────────────
const normalizePath = (path) =>
  String(path)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .split('/')
    .filter((seg, i) => {
      if (seg === '.' || seg === '') return i === 0;
      if (seg === '..') return false;
      return true;
    })
    .join('/');

const resolveAssetUrl = (assetPath) => {
  if (!assetPath) return null;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetPath)) return null;
  const normalized = normalizePath(assetPath);
  const base = app.forum.attribute('assetsBaseUrl') || app.forum.attribute('baseUrl') + '/assets';
  return base.replace(/\/+$/, '') + '/' + normalized;
};

// ─── Settings helpers ─────────────────────────────────────────────────────────
const getBool = (key) => {
  const v = app.data.settings[key];
  return v === true || v === 'true' || v === '1' || v === 1;
};

const getStr = (key, def = '') => String(app.data.settings[key] ?? def);

// Direct-save to API (used by all custom controls)
const saveSetting = (payload) => {
  const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
  return app.request({ method: 'POST', url: `${apiUrl}/settings`, body: payload });
};

// ─── AdminToggle ──────────────────────────────────────────────────────────────
// Self-contained boolean toggle: updates app.data.settings + persists immediately.
class AdminToggle extends Component {
  view() {
    const { settingKey, label, help } = this.attrs;
    const value = getBool(settingKey);
    return (
      <div className="Form-group AvocadoAdmin-toggle">
        <Switch
          state={value}
          onchange={(checked) => {
            app.data.settings[settingKey] = checked;
            m.redraw();
            saveSetting({ [settingKey]: checked ? '1' : '0' });
          }}
        >
          {label}
        </Switch>
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}

// ─── AdminSelect ──────────────────────────────────────────────────────────────
class AdminSelect extends Component {
  view() {
    const { settingKey, label, help, options, default: def } = this.attrs;
    const keys = Object.keys(options);
    const value = getStr(settingKey, def ?? keys[0]);
    return (
      <div className="Form-group">
        <label className="AvocadoAdmin-label">{label}</label>
        <div className="AvocadoAdmin-select-wrap">
          <select
            className="FormControl AvocadoAdmin-select"
            value={value}
            onchange={(e) => {
              const val = e.target.value;
              app.data.settings[settingKey] = val;
              m.redraw();
              saveSetting({ [settingKey]: val });
            }}
          >
            {keys.map((k) => (
              <option key={k} value={k}>{options[k]}</option>
            ))}
          </select>
          <i className="fas fa-chevron-down AvocadoAdmin-select-chevron" aria-hidden="true" />
        </div>
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}

// ─── AdminText ────────────────────────────────────────────────────────────────
class AdminText extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this._timer = null;
  }

  view() {
    const { settingKey, label, help, placeholder } = this.attrs;
    const value = getStr(settingKey);
    return (
      <div className="Form-group">
        <label className="AvocadoAdmin-label">{label}</label>
        <input
          className="FormControl"
          type="text"
          value={value}
          placeholder={placeholder || ''}
          oninput={(e) => {
            const val = e.target.value;
            app.data.settings[settingKey] = val;
            clearTimeout(this._timer);
            this._timer = setTimeout(() => saveSetting({ [settingKey]: val }), 600);
          }}
        />
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}

// ─── AdminTextarea ────────────────────────────────────────────────────────────
// Like AdminText but multi-line. Used for HTML/CSS settings (custom hero, etc.).
class AdminTextarea extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this._timer = null;
  }

  view() {
    const { settingKey, label, help, placeholder, rows = 8, className = '' } = this.attrs;
    const value = getStr(settingKey);
    return (
      <div className="Form-group">
        {label && <label className="AvocadoAdmin-label">{label}</label>}
        <textarea
          className={`FormControl ${className}`.trim()}
          rows={rows}
          value={value}
          placeholder={placeholder || ''}
          oninput={(e) => {
            const val = e.target.value;
            app.data.settings[settingKey] = val;
            clearTimeout(this._timer);
            this._timer = setTimeout(() => saveSetting({ [settingKey]: val }), 600);
          }}
        />
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}

// ─── AdminCard ────────────────────────────────────────────────────────────────
// POJO component (Mithril requires view method — arrow functions are React syntax)
const AdminCard = {
  view({ attrs: { title, icon }, children }) {
    return (
      <div className="AvocadoAdmin-card">
        <div className="AvocadoAdmin-card-header">
          {icon && <span className="AvocadoAdmin-card-icon"><i className={icon} aria-hidden="true" /></span>}
          <h3 className="AvocadoAdmin-card-title">{title}</h3>
        </div>
        <div className="AvocadoAdmin-card-body">
          {children}
        </div>
      </div>
    );
  },
};

// ─── Divider between groups of sub-settings ───────────────────────────────────
const SubDivider = { view() { return <div className="AvocadoAdmin-subDivider" />; } };

// ─── SpinnerPicker ────────────────────────────────────────────────────────────
const SPINNER_AVOCADO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="56" height="56" shape-rendering="geometricPrecision"><style>.avl-group{transform-origin:100px 100px;animation:avl-rotate 6s linear infinite forwards}.avl-scale{transform-origin:100px 100px;animation:avl-scale 6s linear infinite forwards}.avl-tl{transform-origin:50px 50px;animation:avl-down 6s linear infinite forwards}.avl-tr{transform-origin:150px 50px;animation:avl-up 6s linear infinite forwards}.avl-bl{transform-origin:50px 150px;animation:avl-down 6s linear infinite forwards}.avl-br{transform-origin:150px 150px;animation:avl-up 6s linear infinite forwards}@keyframes avl-rotate{0%,8.33%{transform:rotate(0deg);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}23.33%,31.66%{transform:rotate(90deg);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}36.66%,45%{transform:rotate(180deg);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}50%,58.33%{transform:rotate(270deg);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}63.33%,100%{transform:rotate(360deg)}}@keyframes avl-scale{0%,8.33%{transform:scale(1);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}11.66%,73.33%{transform:scale(0.74);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}76.66%,100%{transform:scale(1)}}@keyframes avl-down{0%,3.33%{transform:translateY(0)}6.66%,78.33%{transform:translateY(52px)}81.66%,100%{transform:translateY(0)}}@keyframes avl-up{0%,3.33%{transform:translateY(0)}6.66%,78.33%{transform:translateY(-52px)}81.66%,100%{transform:translateY(0)}}</style><g class="avl-group"><g class="avl-scale"><rect class="avl-tl" x="5" y="5" width="90" height="90" rx="6" fill="currentColor"/><rect class="avl-tr" x="105" y="5" width="90" height="90" rx="6" fill="currentColor" opacity="0.75"/><rect class="avl-bl" x="5" y="105" width="90" height="90" rx="6" fill="currentColor" opacity="0.5"/><rect class="avl-br" x="105" y="105" width="90" height="90" rx="6" fill="currentColor" opacity="0.9"/></g></g></svg>';

const SPINNER_ORBITAL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="56" height="56" shape-rendering="geometricPrecision"><style>.avq{animation:2s cubic-bezier(0.45,0,0.55,1) infinite}.avq1{animation-name:avq-tl}.avq2{animation-name:avq-tr}.avq3{animation-name:avq-br}.avq4{animation-name:avq-bl}@keyframes avq-tl{0%,100%{transform:translate(0,0)}25%{transform:translate(0,50px)}50%{transform:translate(50px,50px)}75%{transform:translate(50px,0)}}@keyframes avq-tr{0%,100%{transform:translate(0,0)}25%{transform:translate(-50px,0)}50%{transform:translate(-50px,50px)}75%{transform:translate(0,50px)}}@keyframes avq-br{0%,100%{transform:translate(0,0)}25%{transform:translate(0,-50px)}50%{transform:translate(-50px,-50px)}75%{transform:translate(-50px,0)}}@keyframes avq-bl{0%,100%{transform:translate(0,0)}25%{transform:translate(50px,0)}50%{transform:translate(50px,-60%)}75%{transform:translate(0,-60%)}}</style><rect class="avq avq1" x="0" y="0" width="40" height="40" rx="4" fill="currentColor"/><rect class="avq avq2" x="50" y="0" width="40" height="40" rx="4" fill="currentColor"/><rect class="avq avq3" x="50" y="50" width="40" height="40" rx="4" fill="currentColor"/><rect class="avq avq4" x="0" y="50" width="40" height="40" rx="4" fill="currentColor"/></svg>';

const SPINNER_DITIE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="#4d22b3" viewBox="3.52 1.52 16.96 20.97" width="56" height="56" role="img" aria-label="Carregando"><style>.sw-body{animation:sw-rock 1s ease-in-out infinite;transform-origin:12px 12px}@keyframes sw-rock{0%,100%{transform:translateY(0)}50%{transform:translateY(-0.6px)}}.sw-leg1{animation:sw-leg1 1s ease-in-out infinite;transform-origin:6.5px 18.5px}.sw-leg2{animation:sw-leg2 1s ease-in-out infinite;transform-origin:17.5px 18.5px}@keyframes sw-leg1{0%,100%{transform:rotate(0)}50%{transform:rotate(-8deg)}}@keyframes sw-leg2{0%,100%{transform:rotate(0)}50%{transform:rotate(8deg)}}.sw-hl{animation:sw-hl 1.4s ease-in-out infinite}@keyframes sw-hl{0%,100%{opacity:1}50%{opacity:.4}}</style><g class="sw-body"><path d="M15,2H9A5,5,0,0,0,4,7v9a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V7A5,5,0,0,0,15,2Z" fill="#4d22b3"/><path d="M20,7H4A5,5,0,0,1,9,2h6A5,5,0,0,1,20,7Z" fill="#ff9300"/><circle class="sw-hl" cx="9" cy="12.5" r="1.5" fill="#ff9300"/><circle class="sw-hl" cx="15" cy="12.5" r="1.5" fill="#ff9300"/></g><path class="sw-leg1" d="M6,22A1.25,1.25,0,0,1,5.68,22a1,1,0,0,1-.63-1.27l1.33-4a1,1,0,1,1,1.9.64L7,21.32A1,1,0,0,1,6,22Z" fill="#ff9300"/><path class="sw-leg2" d="M18.32,22A1,1,0,0,0,19,20.68l-1.33-4a1,1,0,0,0-1.9.64l1.33,4A1,1,0,0,0,18,22,1.25,1.25,0,0,0,18.32,22Z" fill="#ff9300"/></svg>';

// css-orbital preview: uses a real div with pseudo-elements (CSS in admin.less)
const SPINNER_CSS_ORBITAL_PREVIEW = '<div class="avs-co"><i></i></div>';

// B2 rotating coffee bean — gradient IDs prefixed avp- to avoid collisions with live spinner
const SPINNER_B2_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="56" height="56" style="animation:b2-tl 2.4s cubic-bezier(.45,0,.55,1) infinite;transform-origin:center"><style>@keyframes b2-tl{0%{transform:rotate(-30deg)}50%{transform:rotate(150deg)}100%{transform:rotate(330deg)}}</style><defs><linearGradient id="avp-b2c" x1="509.97" x2="509.9" y1="544.75" y2="278.81" gradientTransform="matrix(.93679 -.85929 .85927 .93681 -400.21 462.79)" gradientUnits="userSpaceOnUse"><stop stop-color="#3c1a0f" offset="0"/><stop stop-color="#d7bbb3" offset="1"/></linearGradient><linearGradient id="avp-b2d" x1="498.75" x2="498.75" y1="750.29" y2="353.8" gradientTransform="matrix(.93679 -.85929 .85927 .93681 -400.21 462.79)" gradientUnits="userSpaceOnUse"><stop stop-color="#391b0f" offset="0"/><stop stop-color="#5b2318" offset=".10989"/><stop stop-color="#5b2318" offset=".27473"/><stop stop-color="#905036" offset="1"/></linearGradient></defs><path d="M260.23 242.48C470.17 49.91 703.98 47.53 770.09 50.38c54.62 2.3575 100.81 8.0024 121.59 12.397 34.724 7.3432 25.195 7.327 46.702 33.008s34.249 26.987 35.022 68.388c.63801 34.21 5.9807 206.33-60.35 357.28-66.33 150.96-113.03 188.58-173.28 243.85-60.25 55.26-197.57 142.87-350.57 174.11-79.27 16.19-298.03 7.65-312.03-10.34-5.637-8.26-14.161-17.48-20.932-22.5-15.188-16.56-25.367-51.22-26.948-79.87s-13.148-189.89 60.548-346.12c73.692-156.24 170.39-238.1 170.39-238.1z" fill="url(#avp-b2d)" stroke="#391b0f" stroke-width="2"/><path d="M81.755 498.52c-17.329 40.267-29.251 80.502-37.386 118.39 4.8183 9.8888 10.692 21.773 12.387 24.377 2.6562 4.0799 9.8658 7.23 9.8658 7.23s-.24233 5.6715 6.7906 13.339c7.0329 7.6676 100.31 117.63 135.92 158.82 35.608 41.19 60.582 66.049 63.828 69.588 1.8593 2.0271 5.4259 4.4291 8.2525 6.1763 15.543-4.2981 40.828-11.574 59.3-18.331 25.786-9.4319 41.733-15.98 51.254-20.168-.92898-3.5265-2.8187-8.4402-6.4702-10.992-6.06-4.24-101.43-104.63-149.43-160.52-48-55.88-118.77-135.42-122.01-138.95-3.246-3.5389-3.423-13.194-3.423-13.194s-2.9747 3.8179-10.5-5.5704c-7.5251-9.3882-13.348-19.236-15.955-24.447-.62991-1.2589-1.4808-3.3519-2.4226-5.756zM552.33 77.767c7.6396 1.441 16.468 3.7036 22.299 7.0918 10.117 5.8786 7.2293 4.2466 15.934 12.553 6.1574 5.8755 3.6488 6.8 1.6445 6.847 3.4263.19543 12.986.99306 15.66 3.9093 3.246 3.5389 82.226 81.738 133.77 134.38 51.541 52.64 131.27 147.86 134.96 154.25 1.9395 3.3594 5.3564 5.8918 8.1919 7.5795 6.3015-11.345 20.928-38.305 29.718-59.927 6.415-15.779 11.614-29.352 15.137-38.682-.26239-4.2533-.85961-8.2834-2.1944-9.7387-3.246-3.5389-55.746-68.375-93.713-107.4-37.99-39.03-101.25-98.675-108.29-106.34-7.0329-7.6676-17.782-8.1621-17.782-8.1621s-.39445-6.5863-4.1954-9.6282c-7.6255-6.1026-16.851-9.38-24.794-11.164-36.085 3.6608-79.184 10.878-126.37 24.433z" fill="#fff"/><path d="M142.45 452.05c-4.6501-5.1162-5.487-8.0928.88539-18.556 6.3723-10.464 14.698-20.834 21.395-27.856 6.6976-7.022 14.232-11.067 18.93-17.206 4.6977-6.1385 11.721-19.997 18.466-27.996 6.7441-7.9986 19.906-17.159 23.069-21.903 3.1629-4.7434 7.0704-14.835 19.396-26.972 12.325-12.137 20.371-16.648 24.464-20.368 4.0929-3.7202 7.3024-9.4403 19.163-22.089 11.86-12.649 19.86-16.183 26.511-22.228 6.6509-6.0453 4.4191-10.557 20.139-22.043s25.626-13.95 31.766-19.53c6.1394-5.5802 11.488-15.114 23.581-22.368 12.092-7.254 21.394-7.2996 29.486-12.787 8.0926-5.4871 13.395-14.044 21.999-19.996 8.6042-5.9521 33.254-19.948 39.579-19.157 6.3248.79124 10.696 1.4893 15.346 6.6055 4.6501 5.1162-4.7909 8.0918-13.349 13.067-8.5576 4.9754-18.232 12.834-22.325 16.554-4.0929 3.7202-16.372 14.881-22.418 18.508-6.0461 3.627-18.557 9.3927-29.114 15.252-10.557 5.8589-15.395 14.927-25.581 23.251-10.186 8.3238-26.138 14.415-30.277 19.112-4.1395 4.6968-16.558 18.787-22.186 23.903-5.6277 5.1152-18.278 13.811-23.394 18.461-5.1161 4.6503-16.651 20.741-22.744 25.344-6.0927 4.6036-16.232 11.951-23.953 19.903-7.7208 7.952-12.186 19.485-20.419 27.902-8.2324 8.417-18.371 15.764-25.116 23.763-6.7442 7.9986-8.0936 15.765-15.908 25.67-7.814 9.9053-15.953 16.369-23.209 24.833-7.2558 8.4636-12.512 16.044-16.279 23.206-3.7677 7.1618-6.3723 10.464-9.1158 6.4171-2.7435-4.0464-8.7886-10.697-8.7886-10.697z" fill="#eee" stroke="#b8b8b8"/></svg>';

// Flarum logo + chat bubbles — gradient IDs prefixed avp- to avoid collisions
const SPINNER_FLARUM_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -40 200 180" width="72" height="68"><defs><linearGradient x1="50%" y1="100%" x2="50%" y2="0%" id="avp-cs1"><stop stop-color="#D22929" offset="0%"/><stop stop-color="#B71717" offset="100%"/></linearGradient><linearGradient x1="50%" y1="0%" x2="50%" y2="100%" id="avp-cs2"><stop stop-color="#E7762E" offset="0%"/><stop stop-color="#E7562E" offset="100%"/></linearGradient></defs><style>.cs-logo{transform-origin:48px 57px;animation:cs-br 2s ease-in-out infinite}@keyframes cs-br{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.04) rotate(-2deg)}}.cs-bubble{transform-origin:center;transform-box:fill-box;opacity:0}.cs-b1{animation:cs-up1 2.4s ease-out infinite}.cs-b2{animation:cs-up2 2.4s ease-out infinite .4s}.cs-b3{animation:cs-up3 2.4s ease-out infinite .8s}.cs-b4{animation:cs-up4 2.4s ease-out infinite 1.2s}.cs-b5{animation:cs-up5 2.4s ease-out infinite 1.6s}@keyframes cs-up1{0%{transform:translate(0,0) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(-55px,-70px) scale(1);opacity:0}}@keyframes cs-up2{0%{transform:translate(0,0) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(55px,-65px) scale(1);opacity:0}}@keyframes cs-up3{0%{transform:translate(0,0) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(-40px,-80px) scale(.9);opacity:0}}@keyframes cs-up4{0%{transform:translate(0,0) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(40px,-85px) scale(.9);opacity:0}}@keyframes cs-up5{0%{transform:translate(0,0) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(0,-90px) scale(1.1);opacity:0}}.cs-d{animation:cs-tp 1s ease-in-out infinite}.cs-d2{animation-delay:.12s}.cs-d3{animation-delay:.24s}@keyframes cs-tp{0%,60%,100%{opacity:.4}30%{opacity:1}}</style><g class="cs-bubble cs-b1" transform="translate(30,20)"><path d="M0,0 Q0,-4 4,-4 L20,-4 Q24,-4 24,0 L24,8 Q24,12 20,12 L8,12 L4,16 L4,12 Q0,12 0,8 Z" fill="url(#avp-cs2)"/><circle class="cs-d" cx="6" cy="4" r="1.2" fill="#fff"/><circle class="cs-d cs-d2" cx="12" cy="4" r="1.2" fill="#fff"/><circle class="cs-d cs-d3" cx="18" cy="4" r="1.2" fill="#fff"/></g><g class="cs-bubble cs-b2" transform="translate(55,20)"><path d="M24,0 Q24,-4 20,-4 L4,-4 Q0,-4 0,0 L0,8 Q0,12 4,12 L16,12 L20,16 L20,12 Q24,12 24,8 Z" fill="url(#avp-cs1)"/><circle class="cs-d" cx="6" cy="4" r="1.2" fill="#fff"/><circle class="cs-d cs-d2" cx="12" cy="4" r="1.2" fill="#fff"/><circle class="cs-d cs-d3" cx="18" cy="4" r="1.2" fill="#fff"/></g><g class="cs-bubble cs-b3" transform="translate(35,15)"><path d="M0,0 Q0,-4 4,-4 L18,-4 Q22,-4 22,0 L22,7 Q22,11 18,11 L7,11 L3,14 L3,11 Q0,11 0,7 Z" fill="url(#avp-cs2)"/><circle class="cs-d" cx="6" cy="3.5" r="1" fill="#fff"/><circle class="cs-d cs-d2" cx="11" cy="3.5" r="1" fill="#fff"/><circle class="cs-d cs-d3" cx="16" cy="3.5" r="1" fill="#fff"/></g><g class="cs-bubble cs-b4" transform="translate(52,15)"><path d="M22,0 Q22,-4 18,-4 L4,-4 Q0,-4 0,0 L0,7 Q0,11 4,11 L15,11 L19,14 L19,11 Q22,11 22,7 Z" fill="url(#avp-cs1)"/><circle class="cs-d" cx="6" cy="3.5" r="1" fill="#fff"/><circle class="cs-d cs-d2" cx="11" cy="3.5" r="1" fill="#fff"/><circle class="cs-d cs-d3" cx="16" cy="3.5" r="1" fill="#fff"/></g><g class="cs-bubble cs-b5" transform="translate(40,10)"><path d="M0,0 Q0,-4 4,-4 L22,-4 Q26,-4 26,0 L26,9 Q26,13 22,13 L10,13 L5,17 L5,13 Q0,13 0,9 Z" fill="url(#avp-cs2)"/><circle class="cs-d" cx="7" cy="4" r="1.3" fill="#fff"/><circle class="cs-d cs-d2" cx="13" cy="4" r="1.3" fill="#fff"/><circle class="cs-d cs-d3" cx="19" cy="4" r="1.3" fill="#fff"/></g><g class="cs-logo"><path d="M.025,75.93 L.002,5.16 C.001,2.31 1.96,1.23 4.37,2.73 L55.16,34.48 L55.16,113.78 L7.58,84.90 C.99,81.31 .03,79.08 .025,75.93 Z" fill="url(#avp-cs1)"/><path d="M5.18,0 C2.32,0 0,2.31 0,5.18 L0,75.85 C.14,78.28 .02,80.81 7.73,84.96 C7.73,84.96 .18,77.62 12.07,77.58 L96.54,77.58 L96.54,0 L5.18,0 Z" fill="url(#avp-cs2)"/></g></svg>';

// Pl3 pulse gradient — gradient IDs prefixed avp- to avoid collisions
const SPINNER_PL3_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="56" height="56" style="animation:avs-pl3 1.2s ease-in-out infinite"><style>@keyframes avs-pl3{0%,100%{transform:scale(1)}15%{transform:scale(1.12)}30%{transform:scale(.95)}45%{transform:scale(1.06)}60%{transform:scale(1)}}</style><defs><linearGradient id="avp-g3c" x1="509.97" x2="509.9" y1="544.75" y2="278.81" gradientTransform="matrix(.93679 -.85929 .85927 .93681 -400.21 462.79)" gradientUnits="userSpaceOnUse"><stop stop-color="#3c1a0f" offset="0"/><stop stop-color="#d7bbb3" offset="1"/></linearGradient><linearGradient id="avp-g3d" x1="498.75" x2="498.75" y1="750.29" y2="353.8" gradientTransform="matrix(.93679 -.85929 .85927 .93681 -400.21 462.79)" gradientUnits="userSpaceOnUse"><stop stop-color="#391b0f" offset="0"/><stop stop-color="#5b2318" offset=".10989"/><stop stop-color="#5b2318" offset=".27473"/><stop stop-color="#905036" offset="1"/></linearGradient></defs><path d="M260.23 242.48C470.17 49.91 703.98 47.53 770.09 50.38c54.62 2.3575 100.81 8.0024 121.59 12.397 34.724 7.3432 25.195 7.327 46.702 33.008s34.249 26.987 35.022 68.388c.63801 34.21 5.9807 206.33-60.35 357.28-66.33 150.96-113.03 188.58-173.28 243.85-60.25 55.26-197.57 142.87-350.57 174.11-79.27 16.19-298.03 7.65-312.03-10.34-5.637-8.26-14.161-17.48-20.932-22.5-15.188-16.56-25.367-51.22-26.948-79.87s-13.148-189.89 60.548-346.12c73.692-156.24 170.39-238.1 170.39-238.1z" fill="url(#avp-g3d)" stroke="#391b0f" stroke-width="2"/><path d="M81.755 498.52c-17.329 40.267-29.251 80.502-37.386 118.39 4.8183 9.8888 10.692 21.773 12.387 24.377 2.6562 4.0799 9.8658 7.23 9.8658 7.23s-.24233 5.6715 6.7906 13.339c7.0329 7.6676 100.31 117.63 135.92 158.82 35.608 41.19 60.582 66.049 63.828 69.588 1.8593 2.0271 5.4259 4.4291 8.2525 6.1763 15.543-4.2981 40.828-11.574 59.3-18.331 25.786-9.4319 41.733-15.98 51.254-20.168-.92898-3.5265-2.8187-8.4402-6.4702-10.992-6.06-4.24-101.43-104.63-149.43-160.52-48-55.88-118.77-135.42-122.01-138.95-3.246-3.5389-3.423-13.194-3.423-13.194s-2.9747 3.8179-10.5-5.5704c-7.5251-9.3882-13.348-19.236-15.955-24.447-.62991-1.2589-1.4808-3.3519-2.4226-5.756zM552.33 77.767c7.6396 1.441 16.468 3.7036 22.299 7.0918 10.117 5.8786 7.2293 4.2466 15.934 12.553 6.1574 5.8755 3.6488 6.8 1.6445 6.847 3.4263.19543 12.986.99306 15.66 3.9093 3.246 3.5389 82.226 81.738 133.77 134.38 51.541 52.64 131.27 147.86 134.96 154.25 1.9395 3.3594 5.3564 5.8918 8.1919 7.5795 6.3015-11.345 20.928-38.305 29.718-59.927 6.415-15.779 11.614-29.352 15.137-38.682-.26239-4.2533-.85961-8.2834-2.1944-9.7387-3.246-3.5389-55.746-68.375-93.713-107.4-37.99-39.03-101.25-98.675-108.29-106.34-7.0329-7.6676-17.782-8.1621-17.782-8.1621s-.39445-6.5863-4.1954-9.6282c-7.6255-6.1026-16.851-9.38-24.794-11.164-36.085 3.6608-79.184 10.878-126.37 24.433z" fill="#fff"/><path d="M142.45 452.05c-4.6501-5.1162-5.487-8.0928.88539-18.556 6.3723-10.464 14.698-20.834 21.395-27.856 6.6976-7.022 14.232-11.067 18.93-17.206 4.6977-6.1385 11.721-19.997 18.466-27.996 6.7441-7.9986 19.906-17.159 23.069-21.903 3.1629-4.7434 7.0704-14.835 19.396-26.972 12.325-12.137 20.371-16.648 24.464-20.368 4.0929-3.7202 7.3024-9.4403 19.163-22.089 11.86-12.649 19.86-16.183 26.511-22.228 6.6509-6.0453 4.4191-10.557 20.139-22.043s25.626-13.95 31.766-19.53c6.1394-5.5802 11.488-15.114 23.581-22.368 12.092-7.254 21.394-7.2996 29.486-12.787 8.0926-5.4871 13.395-14.044 21.999-19.996 8.6042-5.9521 33.254-19.948 39.579-19.157 6.3248.79124 10.696 1.4893 15.346 6.6055 4.6501 5.1162-4.7909 8.0918-13.349 13.067-8.5576 4.9754-18.232 12.834-22.325 16.554-4.0929 3.7202-16.372 14.881-22.418 18.508-6.0461 3.627-18.557 9.3927-29.114 15.252-10.557 5.8589-15.395 14.927-25.581 23.251-10.186 8.3238-26.138 14.415-30.277 19.112-4.1395 4.6968-16.558 18.787-22.186 23.903-5.6277 5.1152-18.278 13.811-23.394 18.461-5.1161 4.6503-16.651 20.741-22.744 25.344-6.0927 4.6036-16.232 11.951-23.953 19.903-7.7208 7.952-12.186 19.485-20.419 27.902-8.2324 8.417-18.371 15.764-25.116 23.763-6.7442 7.9986-8.0936 15.765-15.908 25.67-7.814 9.9053-15.953 16.369-23.209 24.833-7.2558 8.4636-12.512 16.044-16.279 23.206-3.7677 7.1618-6.3723 10.464-9.1158 6.4171-2.7435-4.0464-8.7886-10.697-8.7886-10.697z" fill="#eee" stroke="#b8b8b8"/></svg>';

// Custom spinner placeholder preview
const SPINNER_CUSTOM_PREVIEW = '<div style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;font-size:28px;color:var(--muted-color)"><i class="fas fa-code"></i></div>';

const SPINNER_OPTIONS = [
  { key: 'avocado',     label: 'Avocado',       svg: SPINNER_AVOCADO_SVG,          color: true  },
  { key: 'orbital',     label: 'Orbital',        svg: SPINNER_ORBITAL_SVG,          color: true  },
  { key: 'css-orbital', label: 'Orbital (CSS)',  svg: SPINNER_CSS_ORBITAL_PREVIEW,  color: true  },
  { key: 'ditie',       label: 'ditie.online',   svg: SPINNER_DITIE_SVG,            color: false },
  { key: 'b2',          label: 'Giratório',      svg: SPINNER_B2_SVG,               color: false },
  { key: 'flarum',      label: 'Flarum',         svg: SPINNER_FLARUM_SVG,           color: false },
  { key: 'pl3',         label: 'Pulso',          svg: SPINNER_PL3_SVG,              color: false },
  { key: 'custom',      label: 'Personalizado',  svg: SPINNER_CUSTOM_PREVIEW,       color: false },
];

class SpinnerPicker extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this._customTimer = null;
  }

  view() {
    const current = getStr('avocado.loading_spinner_style', 'avocado');
    return (
      <div className="Form-group">
        <label className="AvocadoAdmin-label">
          {trans('ramon-avocado.admin.settings.loading_spinner_style_label', 'Spinner style')}
        </label>
        <div className="AvocadoSpinnerPicker">
          {SPINNER_OPTIONS.map(opt => (
            <button
              key={opt.key}
              className={`AvocadoSpinnerOption${current === opt.key ? ' is-selected' : ''}`}
              onclick={() => {
                app.data.settings['avocado.loading_spinner_style'] = opt.key;
                m.redraw();
                saveSetting({ 'avocado.loading_spinner_style': opt.key });
              }}
            >
              <div
                className="AvocadoSpinnerOption-preview"
                style={opt.color ? 'color: var(--primary-color)' : ''}
              >
                {m.trust(opt.svg)}
              </div>
              <span className="AvocadoSpinnerOption-label">{opt.label}</span>
            </button>
          ))}
        </div>
        {current === 'custom' && (
          <div className="AvocadoAdmin-subGroup" style="margin-top:12px">
            <div className="Form-group">
              <label className="AvocadoAdmin-label">
                {trans('ramon-avocado.admin.settings.spinner_custom_code_label', 'Custom spinner code')}
              </label>
              <textarea
                className="FormControl AvocadoAdmin-codeField"
                rows={6}
                placeholder="<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; ...>...</svg>"
                value={getStr('avocado.loading_spinner_custom')}
                oninput={(e) => {
                  const val = e.target.value;
                  app.data.settings['avocado.loading_spinner_custom'] = val;
                  clearTimeout(this._customTimer);
                  this._customTimer = setTimeout(
                    () => saveSetting({ 'avocado.loading_spinner_custom': val }),
                    800
                  );
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

// ─── AdminTagPicker ───────────────────────────────────────────────────────────
// Multi-select tag picker that matches the AvocadoHome-tagPickerTrigger style
// from the forum composer. Saves as a JSON array.
class AdminTagPicker extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.open       = false;
    this.search     = '';
    this.saving     = false;
    this.tagsLoaded = false;
    this.tags       = [];
    this.selected   = new Set();
    this._saveTimer = null;

    // Load initial selection — supports both JSON array and legacy plain string
    try {
      const raw = app.data.settings[this.attrs.settingKey];
      if (raw) {
        const parsed = JSON.parse(raw);
        (Array.isArray(parsed) ? parsed : [parsed])
          .map(String).filter(Boolean).forEach((id) => this.selected.add(id));
      }
    } catch (_) {
      const raw = String(app.data.settings[this.attrs.settingKey] || '').trim();
      if (raw) this.selected.add(raw);
    }

    this._onDocClick = (e) => {
      if (this.element && !this.element.contains(e.target)) {
        if (this.open) { this.open = false; m.redraw(); }
      }
    };

    app.store.find('tags').then((result) => {
      this.tags = (Array.isArray(result) ? result : [])
        .filter((t) => t && t.id?.() && !t.parent?.())
        .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999));
      this.tagsLoaded = true;
      m.redraw();
    }).catch(() => { this.tagsLoaded = true; m.redraw(); });
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    this.element = vnode.dom;
    document.addEventListener('click', this._onDocClick, true);
  }

  onremove(vnode) {
    super.onremove(vnode);
    document.removeEventListener('click', this._onDocClick, true);
  }

  toggle(id) {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    m.redraw();
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.persist(), 350);
  }

  persist() {
    this.saving = true;
    m.redraw();
    const value = JSON.stringify([...this.selected]);
    saveSetting({ [this.attrs.settingKey]: value }).then(() => {
      app.data.settings[this.attrs.settingKey] = value;
      this.saving = false;
      m.redraw();
    }).catch(() => { this.saving = false; m.redraw(); });
  }

  view() {
    const { label, help, placeholder } = this.attrs;
    const selectedTags = this.tags.filter((t) => this.selected.has(String(t.id?.())));
    const query        = this.search.toLowerCase();
    const filteredTags = this.tags.filter((t) =>
      !query || (t.name?.() || '').toLowerCase().includes(query)
    );

    return (
      <div className="Form-group">
        <label className="AvocadoAdmin-label AvocadoAdmin-label--saving">
          {label}
          {this.saving && <span className="AvocadoAdmin-savingDot" aria-hidden="true" />}
        </label>

        <div className="AvocadoAdmin-tagPicker">
          {/* ── Trigger ── */}
          <button
            type="button"
            className={`AvocadoAdmin-tagPickerTrigger${this.open ? ' is-open' : ''}`}
            onclick={(e) => { e.stopPropagation(); this.open = !this.open; this.search = ''; m.redraw(); }}
          >
            <i className="fas fa-tag" aria-hidden="true" />

            {selectedTags.length > 0
              ? selectedTags.map((tag) => {
                  const color = tag.color?.() || 'var(--primary-color)';
                  return (
                    <span
                      key={String(tag.id?.())}
                      className="AvocadoAdmin-tagChip"
                      style={{ '--tag-color': color }}
                      onclick={(e) => { e.stopPropagation(); this.toggle(String(tag.id?.())); }}
                    >
                      {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                      {tag.name?.()}
                      <i className="fas fa-times AvocadoAdmin-tagChipRemove" aria-hidden="true" />
                    </span>
                  );
                })
              : <span className="AvocadoAdmin-tagPickerPlaceholder">
                  {placeholder || trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select tags…')}
                </span>
            }

            <i className={`fas fa-chevron-${this.open ? 'up' : 'down'} AvocadoAdmin-tagPickerChevron`} aria-hidden="true" />
          </button>

          {/* ── Dropdown ── */}
          {this.open && (
            <div className="AvocadoAdmin-tagPickerDropdown">
              <div className="AvocadoAdmin-tagPickerSearch">
                <i className="fas fa-search" aria-hidden="true" />
                <input
                  type="text"
                  value={this.search}
                  placeholder={trans('ramon-avocado.admin.search_tags', 'Search tags…')}
                  oninput={(e) => { this.search = e.target.value; m.redraw(); }}
                  onclick={(e) => e.stopPropagation()}
                />
              </div>

              {!this.tagsLoaded
                ? <span className="AvocadoAdmin-tagPickerEmpty">{trans('ramon-avocado.admin.loading', 'Loading…')}</span>
                : filteredTags.length === 0
                  ? <span className="AvocadoAdmin-tagPickerEmpty">{trans('ramon-avocado.admin.settings.featured_tags_empty', 'No tags found.')}</span>
                  : (
                    <ul className="AvocadoAdmin-tagPickerList">
                      {filteredTags.map((tag) => {
                        const id         = String(tag.id?.() || '');
                        if (!id) return null;
                        const color      = tag.color?.() || '#8f9097';
                        const icon       = tag.icon?.();
                        const isSelected = this.selected.has(id);
                        return (
                          <li
                            key={id}
                            className={`AvocadoAdmin-tagPickerItem${isSelected ? ' is-selected' : ''}`}
                            onclick={(e) => { e.stopPropagation(); this.toggle(id); }}
                          >
                            <span className="AvocadoAdmin-tagPickerItem-icon" style={{ background: color }}>
                              {icon && <i className={icon} aria-hidden="true" />}
                            </span>
                            <span className="AvocadoAdmin-tagPickerItem-name">{tag.name?.()}</span>
                            {isSelected && <i className="fas fa-check AvocadoAdmin-tagPickerItem-check" aria-hidden="true" />}
                          </li>
                        );
                      })}
                    </ul>
                  )
              }
            </div>
          )}
        </div>

        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}

// ─── AdminGroupPicker ─────────────────────────────────────────────────────────
class AdminGroupPicker extends Component {
  groups = [];
  loaded = false;

  oninit(vnode) {
    super.oninit(vnode);
    app.store.find('groups').then((groups) => {
      this.groups = groups;
      this.loaded = true;
      m.redraw();
    }).catch(() => { this.loaded = true; m.redraw(); });
  }

  getSelected() {
    try { return JSON.parse(getStr(this.attrs.settingKey, '[]') || '[]'); }
    catch { return []; }
  }

  toggle(id) {
    const sel = this.getSelected();
    const idx = sel.indexOf(String(id));
    if (idx >= 0) sel.splice(idx, 1); else sel.push(String(id));
    const val = JSON.stringify(sel);
    app.data.settings[this.attrs.settingKey] = val;
    m.redraw();
    saveSetting({ [this.attrs.settingKey]: val });
  }

  view() {
    const { label, help } = this.attrs;
    const selected = this.getSelected().map(String);
    // Filter out Guests (id=2) and Members (id=3) — show only named/custom groups
    const groups = this.groups.filter((g) => g.id() !== '2' && g.id() !== '3');

    return (
      <div className="Form-group">
        {label && <label className="AvocadoAdmin-label">{label}</label>}
        {!this.loaded ? (
          <p className="helpText">{trans('ramon-avocado.admin.loading', 'Loading…')}</p>
        ) : !groups.length ? (
          <p className="helpText">{trans('ramon-avocado.admin.settings.team_groups_empty', 'No groups found.')}</p>
        ) : (
          <div className="AvocadoAdmin-tagPickerList">
            {groups.map((group) => {
              const id       = String(group.id());
              const name     = group.namePlural?.() || group.nameSingular?.() || `Group ${id}`;
              const color    = group.color?.() || '#8f9097';
              const icon     = group.icon?.() || 'fas fa-users';
              const isSelected = selected.includes(id);
              return (
                <li
                  key={id}
                  className={`AvocadoAdmin-tagPickerItem${isSelected ? ' is-selected' : ''}`}
                  onclick={() => this.toggle(id)}
                >
                  <span className="AvocadoAdmin-tagPickerItem-icon" style={{ background: color }}>
                    <i className={icon} aria-hidden="true" />
                  </span>
                  <span className="AvocadoAdmin-tagPickerItem-name">{name}</span>
                  {isSelected && <i className="fas fa-check AvocadoAdmin-tagPickerItem-check" aria-hidden="true" />}
                </li>
              );
            })}
          </div>
        )}
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

// All settings use auto-saving components — the native Save button is unnecessary
// and confusing, so suppress it for this extension page only.
override(ExtensionPage.prototype, 'submitButton', function (original) {
  if (this.extension?.id === 'ramon-avocado') return null;
  return original();
});

app.initializers.add('ramon-avocado', (app) => {
  const reg = app.registry.for('ramon-avocado');

  // ── Logo ───────────────────────────────────────────────────────────────────
  reg.registerSetting(() => (
    <AdminCard title={trans('ramon-avocado.admin.settings.section_logo', 'Logo')} icon="fas fa-image">
      <AdminToggle
        settingKey="avocado.logo_enabled"
        label={trans('ramon-avocado.admin.settings.logo_enabled_label', 'Enable custom SVG logo')}
        help={trans('ramon-avocado.admin.settings.logo_enabled_help', 'Replace the default forum logo with the uploaded SVG file.')}
      />
      {getBool('avocado.logo_enabled') && (
        <>
          <SubDivider />
          <div className="Form-group">
            <label className="AvocadoAdmin-label">{trans('ramon-avocado.admin.settings.logo_svg_label', 'Custom Logo (SVG)')}</label>
            <UploadImageButton
              name="avocado-logo"
              routePath="avocado/logo-svg"
              value={app.data.settings['avocado.logo_svg']}
              url={resolveAssetUrl(app.data.settings['avocado.logo_svg'])}
            />
            <p className="helpText">
              {trans('ramon-avocado.admin.settings.logo_svg_help', 'Upload an SVG file to replace the forum logo in the header.')}
            </p>
          </div>
        </>
      )}
      <SubDivider />
      <AdminToggle
        settingKey="avocado.custom_loading_spinner"
        label={trans('ramon-avocado.admin.settings.custom_loading_spinner_label', 'Custom loading spinner')}
        help={trans('ramon-avocado.admin.settings.custom_loading_spinner_help', 'Replace the default text loading indicator with an animated SVG spinner.')}
      />
      {getBool('avocado.custom_loading_spinner') && (
        <div className="AvocadoAdmin-subGroup">
          {m(SpinnerPicker)}
        </div>
      )}
    </AdminCard>
  ), 135)

  // ── Homepage ───────────────────────────────────────────────────────────────
  .registerSetting(() => {
    const showcaseSelected = !!getStr('avocado.showcase_tag');
    return (
      <AdminCard title={trans('ramon-avocado.admin.settings.section_homepage', 'Homepage')} icon="fas fa-home">

        {/* Featured categories */}
        <AdminTagPicker
          settingKey="avocado.featured_tags"
          label={trans('ramon-avocado.admin.settings.featured_tags_label', 'Featured Categories')}
          help={trans('ramon-avocado.admin.settings.featured_tags_help', 'Selected categories appear highlighted on the homepage and categories page.')}
          placeholder={trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select categories…')}
        />

        <SubDivider />

        {/* Showcase / portfolio — master toggle */}
        <AdminToggle
          settingKey="avocado.showcase_enabled"
          label={trans('ramon-avocado.admin.settings.showcase_enabled_label', 'Enable Showcase / Portfolio section')}
          help={trans('ramon-avocado.admin.settings.showcase_enabled_help', 'Show a showcase slider on the homepage with discussions from selected tags.')}
        />

        {/* All showcase settings — only visible when enabled */}
        {getBool('avocado.showcase_enabled') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminTagPicker
              settingKey="avocado.showcase_tag"
              label={trans('ramon-avocado.admin.settings.showcase_tag_label', 'Showcase / Portfolio Tags')}
              help={trans('ramon-avocado.admin.settings.showcase_tag_help', 'Discussions from these tags appear in the showcase slider on the homepage.')}
              placeholder={trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select tags…')}
            />
            {showcaseSelected && (
              <>
                <AdminText
                  settingKey="avocado.showcase_heading"
                  label={trans('ramon-avocado.admin.settings.showcase_heading_label', 'Showcase Section Title')}
                  help={trans('ramon-avocado.admin.settings.showcase_heading_help', 'Custom title for the showcase section. Leave empty to use default.')}
                />
                <AdminSelect
                  settingKey="avocado.showcase_count"
                  label={trans('ramon-avocado.admin.settings.showcase_count_label', 'Number of Showcase Items')}
                  help={trans('ramon-avocado.admin.settings.showcase_count_help', 'Display 1 to 5 discussion cards in the showcase section.')}
                  options={{ '1': '1', '2': '2', '3': '3', '4': '4', '5': '5' }}
                  default="5"
                />
                <AdminSelect
                  settingKey="avocado.showcase_image_style"
                  label={trans('ramon-avocado.admin.settings.showcase_image_style_label', 'Card Image Style')}
                  help={trans('ramon-avocado.admin.settings.showcase_image_style_help', 'Choose between compact or full-height image display.')}
                  options={{
                    'default': trans('ramon-avocado.admin.settings.showcase_image_style_default', 'Default (Compact)'),
                    'full':    trans('ramon-avocado.admin.settings.showcase_image_style_full', 'Full Image'),
                  }}
                  default="default"
                />
              </>
            )}
          </div>
        )}

        <SubDivider />

        {/* Custom section titles — overrides the locale defaults when set */}
        <div className="AvocadoAdmin-subGroup">
          <h4>{trans('ramon-avocado.admin.settings.section_titles_heading', 'Section titles')}</h4>
          <p className="helpText">
            {trans(
              'ramon-avocado.admin.settings.section_titles_help',
              'Override the homepage section titles. Leave any field empty to use the language pack default.'
            )}
          </p>
          <AdminText
            settingKey="avocado.categories_heading"
            label={trans('ramon-avocado.admin.settings.categories_heading_label', 'Categories Section Title')}
            placeholder={trans('ramon-avocado.forum.home.categories_heading', 'Categories')}
          />
          <AdminText
            settingKey="avocado.popular_heading"
            label={trans('ramon-avocado.admin.settings.popular_heading_label', 'Popular Discussions Title')}
            placeholder={trans('ramon-avocado.forum.home.popular_heading', 'Popular discussions')}
          />
          <AdminText
            settingKey="avocado.following_heading"
            label={trans('ramon-avocado.admin.settings.following_heading_label', 'Following Discussions Title')}
            placeholder={trans('ramon-avocado.forum.home.following_heading', 'Following')}
          />
        </div>

        <SubDivider />

        {/* General homepage toggles */}
        <div className="AvocadoAdmin-subGroup">
          <AdminToggle
            settingKey="avocado.show_online_users"
            label={trans('ramon-avocado.admin.settings.show_online_users_label', 'Show Online Users section')}
            help={trans('ramon-avocado.admin.settings.show_online_users_help', 'Display currently online users between Categories and Popular Discussions.')}
          />
          <AdminToggle
            settingKey="avocado.show_online_count"
            label={trans('ramon-avocado.admin.settings.show_online_count_label', 'Show online count text')}
            help={trans('ramon-avocado.admin.settings.show_online_count_help', 'Show the "X online" label next to the online user avatars.')}
          />
        </div>
        <AdminToggle
          settingKey="avocado.show_guest_cta"
          label={trans('ramon-avocado.admin.settings.show_guest_cta_label', 'Show Login / Sign Up buttons in hero banner')}
          help={trans('ramon-avocado.admin.settings.show_guest_cta_help', 'Display call-to-action buttons inside the homepage hero banner for guests.')}
        />
        <AdminToggle
          settingKey="avocado.custom_default_avatar"
          label={trans('ramon-avocado.admin.settings.custom_default_avatar_label', 'Use custom default avatar')}
          help={trans('ramon-avocado.admin.settings.custom_default_avatar_help', 'Show a person silhouette icon instead of the initial letter when no avatar is uploaded.')}
        />
        <AdminToggle
          settingKey="avocado.show_auth_buttons"
          label={trans('ramon-avocado.admin.settings.show_auth_buttons_label', 'Show Login / Sign Up buttons in header for guests')}
          help={trans('ramon-avocado.admin.settings.show_auth_buttons_help', 'Display Log In and Sign Up pill buttons in the header for guests.')}
        />

        <SubDivider />

        {/* Banner image */}
        <div className="Form-group">
          <label className="AvocadoAdmin-label">{trans('ramon-avocado.admin.settings.banner_image_label', 'Banner Image')}</label>
          <UploadImageButton
            name="avocado-banner"
            routePath="avocado/banner"
            value={app.data.settings['avocado.hero_image']}
            url={resolveAssetUrl(app.data.settings['avocado.hero_image'])}
          />
          <p className="helpText">
            {trans('ramon-avocado.admin.settings.banner_image_help', 'Upload the hero banner image shown at the top of the forum homepage.')}
          </p>
        </div>
        {app.data.settings['avocado.hero_image'] && (
          <AdminText
            settingKey="avocado.hero_image_position"
            label={trans('ramon-avocado.admin.settings.hero_image_position_label', 'Hero Image Position')}
            help={trans('ramon-avocado.admin.settings.hero_image_position_help', "CSS background-position value, e.g. 'center top' or 'center 20%'.")}
            placeholder="center top"
          />
        )}

        <SubDivider />

        {/* Custom hero HTML — replaces the inner content of the hero banner when enabled */}
        <AdminToggle
          settingKey="avocado.custom_hero_enabled"
          label={trans('ramon-avocado.admin.settings.custom_hero_enabled_label', 'Use custom hero content (HTML)')}
          help={trans('ramon-avocado.admin.settings.custom_hero_enabled_help', 'Replace the default hero content (icon, title, description, Login/Sign Up buttons) with your own HTML. The hero banner wrapper, background image and overlay stay intact. Shown to guests only — same as the default hero.')}
        />
        {getBool('avocado.custom_hero_enabled') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminTextarea
              settingKey="avocado.custom_hero_html"
              label={trans('ramon-avocado.admin.settings.custom_hero_html_label', 'Custom hero HTML')}
              help={trans('ramon-avocado.admin.settings.custom_hero_html_help', "HTML injected inside the hero banner overlay (replaces .AvocadoHome-heroBannerContent). Inline '<style>' tags are supported.")}
              placeholder={'<div class="AvocadoHome-heroBannerContent">\n  <h1 class="AvocadoHome-heroBannerTitle">Welcome!</h1>\n  <p class="AvocadoHome-heroBannerDesc">Anything you want — links, images, buttons.</p>\n</div>'}
              rows={10}
              className="AvocadoAdmin-codeField"
            />
          </div>
        )}

        <SubDivider />

        {/* Guest post CTA */}
        <AdminToggle
          settingKey="avocado.show_post_cta"
          label={trans('ramon-avocado.admin.settings.show_post_cta_label', 'Show Join CTA after first post for guests')}
          help={trans('ramon-avocado.admin.settings.show_post_cta_help', 'Display a Log In / Sign Up card after the first post, visible only to guests.')}
        />
        {getBool('avocado.show_post_cta') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminSelect
              settingKey="avocado.post_cta_position"
              label={trans('ramon-avocado.admin.settings.post_cta_position_label', 'CTA position (after which post number)')}
              help={trans('ramon-avocado.admin.settings.post_cta_position_help', 'Insert the CTA banner between this post number and the next one.')}
              options={{
                '1': trans('ramon-avocado.admin.settings.post_cta_position_1', 'After post #1'),
                '2': trans('ramon-avocado.admin.settings.post_cta_position_2', 'After post #2'),
                '3': trans('ramon-avocado.admin.settings.post_cta_position_3', 'After post #3'),
                '4': trans('ramon-avocado.admin.settings.post_cta_position_4', 'After post #4'),
                '5': trans('ramon-avocado.admin.settings.post_cta_position_5', 'After post #5'),
              }}
              default="1"
            />
          </div>
        )}
      </AdminCard>
    );
  }, 115)

  // ── Login & Registration ───────────────────────────────────────────────────
  .registerSetting(() => (
    <AdminCard title={trans('ramon-avocado.admin.settings.section_auth', 'Login & Registration')} icon="fas fa-key">
      <div className="Form-group">
        <label className="AvocadoAdmin-label">{trans('ramon-avocado.admin.settings.auth_image_label', 'Auth Modal Image')}</label>
        <UploadImageButton
          name="avocado-auth"
          routePath="avocado/auth-image"
          value={app.data.settings['avocado.auth_image']}
          url={resolveAssetUrl(app.data.settings['avocado.auth_image'])}
        />
        <p className="helpText">
          {trans('ramon-avocado.admin.settings.auth_image_help', 'Background image shown in the right panel of login, sign up, and forgot password modals.')}
        </p>
      </div>
    </AdminCard>
  ), 90)

  // ── Search ─────────────────────────────────────────────────────────────────
  .registerSetting(() => (
    <AdminCard title={trans('ramon-avocado.admin.settings.section_search', 'Search')} icon="fas fa-search">
      <AdminToggle
        settingKey="avocado.search_v1"
        label={trans('ramon-avocado.admin.settings.search_v1_label', 'Enable V1 search bar style')}
        help={trans('ramon-avocado.admin.settings.search_v1_help', 'Show the inline search dropdown instead of the V2 modal.')}
      />
    </AdminCard>
  ), 55)

  // ── Colored ───────────────────────────────────────────────────────────────
  .registerSetting(() => (
    <AdminCard title={trans('ramon-avocado.admin.settings.section_colored', 'Colored')} icon="fas fa-palette">
      <AdminToggle
        settingKey="avocado.colored_enabled"
        label={trans('ramon-avocado.admin.settings.colored_enabled_label', 'Enable colored accents')}
        help={trans('ramon-avocado.admin.settings.colored_enabled_help', 'Apply the active tag or discussion color to primary buttons, links, and other UI accents across the forum.')}
      />
      {getBool('avocado.colored_enabled') && (
        <div className="AvocadoAdmin-subGroup">
          <AdminSelect
            settingKey="avocado.colored_border_style"
            label={trans('ramon-avocado.admin.settings.colored_border_style_label', 'Discussion card border style')}
            help={trans('ramon-avocado.admin.settings.colored_border_style_help', 'Add a colored border to discussion cards using the primary tag color.')}
            options={{
              'none': trans('ramon-avocado.admin.settings.colored_border_style_none', 'None'),
              'left': trans('ramon-avocado.admin.settings.colored_border_style_left', 'Left border'),
              'full': trans('ramon-avocado.admin.settings.colored_border_style_full', 'Full border'),
            }}
            default="none"
          />
        </div>
      )}
    </AdminCard>
  ), 50)

  // ── Posts ──────────────────────────────────────────────────────────────────
  .registerSetting(() => (
    <AdminCard title={trans('ramon-avocado.admin.settings.section_posts', 'Posts')} icon="fas fa-comment-alt">
      <AdminToggle
        settingKey="avocado.show_share"
        label={trans('ramon-avocado.admin.settings.show_share_label', 'Show Share button on posts')}
        help={trans('ramon-avocado.admin.settings.show_share_help', 'Add a Share action button to each post.')}
      />
      <AdminToggle
        settingKey="avocado.show_action_icons"
        label={trans('ramon-avocado.admin.settings.show_action_icons_label', 'Show icons on Like and Reply buttons')}
        help={trans('ramon-avocado.admin.settings.show_action_icons_help', 'Display Font Awesome icons on the Like and Reply action buttons.')}
      />
      <AdminToggle
        settingKey="avocado.fixed_avatar_effect"
        label={trans('ramon-avocado.admin.settings.fixed_avatar_effect_label', 'Enable fixed avatar effect in discussion posts')}
        help={trans('ramon-avocado.admin.settings.fixed_avatar_effect_help', 'Keep the post avatar sticky while reading long comments on desktop.')}
      />
      <AdminToggle
        settingKey="avocado.threads_style"
        label={trans('ramon-avocado.admin.settings.threads_style_label', 'Enable Threads-style discussion layout')}
        help={trans('ramon-avocado.admin.settings.threads_style_help', 'Display the OP post as a card and indent replies with a left border, like the Threads app.')}
      />

      <SubDivider />

      <AdminToggle
        settingKey="avocado.hero_decoration_icon"
        label={trans('ramon-avocado.admin.settings.hero_decoration_icon_label', 'Show secondary tag icon on discussion hero')}
        help={trans('ramon-avocado.admin.settings.hero_decoration_icon_help', 'Display the secondary tag icon as a large decorative element on the right side of the discussion header.')}
      />
      {getBool('avocado.hero_decoration_icon') && (
        <div className="AvocadoAdmin-subGroup">
          <AdminSelect
            settingKey="avocado.hero_decoration_icon_count"
            label={trans('ramon-avocado.admin.settings.hero_decoration_icon_count_label', 'Number of decoration icons')}
            help={trans('ramon-avocado.admin.settings.hero_decoration_icon_count_help', '1 icon uses the first child tag. 2 icons also shows the second child tag icon, offset to the left.')}
            options={{
              '1': trans('ramon-avocado.admin.settings.hero_decoration_icon_count_one', '1 icon (first child tag)'),
              '2': trans('ramon-avocado.admin.settings.hero_decoration_icon_count_two', '2 icons (first and second child tag)'),
            }}
            default="1"
          />
          <AdminText
            settingKey="avocado.hero_decoration_icon_opacity"
            label={trans('ramon-avocado.admin.settings.hero_decoration_icon_opacity_label', 'Icon opacity (0–100)')}
            help={trans('ramon-avocado.admin.settings.hero_decoration_icon_opacity_help', 'Opacity of the decoration icon as a percentage. 100 = fully opaque.')}
            placeholder="15"
          />
          {getStr('avocado.hero_decoration_icon_count', '1') === '2' && (
            <>
              <AdminToggle
                settingKey="avocado.hero_deco_divider"
                label={trans('ramon-avocado.admin.settings.hero_deco_divider_label', 'Show divider between decoration icons')}
                help={trans('ramon-avocado.admin.settings.hero_deco_divider_help', 'Display an icon in the gap between the two decoration icons (e.g. a "vs" symbol for sport sites).')}
              />
              {getBool('avocado.hero_deco_divider') && (
                <AdminText
                  settingKey="avocado.hero_deco_divider_icon"
                  label={trans('ramon-avocado.admin.settings.hero_deco_divider_icon_label', 'Divider icon class')}
                  help={trans('ramon-avocado.admin.settings.hero_deco_divider_icon_help', 'Font Awesome class for the divider icon, e.g. "fas fa-times" or "fas fa-circle".')}
                  placeholder="fas fa-times"
                />
              )}
            </>
          )}
        </div>
      )}

      <SubDivider />

      <AdminToggle
        settingKey="avocado.hide_links_for_guests"
        label={trans('ramon-avocado.admin.settings.hide_links_for_guests_label', 'Hide links for guests')}
        help={trans('ramon-avocado.admin.settings.hide_links_for_guests_help', 'Prevent guests from following links in posts. Clicking shows a Login / Sign Up prompt instead.')}
      />
    </AdminCard>
  ), 45)

  // ── Discussion hero image ────────────────────────────────────────────────────
  // Picks which tags trigger an "upload an image" prompt in the composer.
  // Each discussion stores its own image (column added by the migration), and
  // it's rendered as the discussion hero background + as the first showcase
  // image. The setting is a JSON array of tag IDs (same shape as featured_tags)
  // and is read on the forum side via `app.forum.attribute('avocadoHeroImageTags')`.
  .registerSetting(() => (
    <AdminCard
      title={trans('ramon-avocado.admin.settings.section_hero_image_tags', 'Hero image on discussions')}
      icon="fas fa-image"
    >
      <AdminTagPicker
        settingKey="avocado.hero_image_tags"
        label={trans('ramon-avocado.admin.settings.hero_image_tags_label', 'Tags that ask for a hero image')}
        help={trans('ramon-avocado.admin.settings.hero_image_tags_help', 'When the user adds one of these tags to a new discussion, the composer reveals an optional image upload field. The uploaded image is shown as the discussion header background and as the first image in the homepage showcase.')}
        placeholder={trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select tags…')}
      />
    </AdminCard>
  ), 42)

  // ── Team Page ────────────────────────────────────────────────────────────────
  .registerSetting(() => (
    <AdminCard title={trans('ramon-avocado.admin.settings.section_team', 'Team Page')} icon="fas fa-users">
      <AdminToggle
        settingKey="avocado.team_page_enabled"
        label={trans('ramon-avocado.admin.settings.team_enabled_label', 'Enable Team page')}
        help={trans('ramon-avocado.admin.settings.team_enabled_help', 'Show a /team page listing members of the selected groups.')}
      />
      {getBool('avocado.team_page_enabled') && (
        <div className="AvocadoAdmin-subGroup">
          <AdminText
            settingKey="avocado.team_page_title"
            label={trans('ramon-avocado.admin.settings.team_title_label', 'Page title')}
            placeholder="Our Team"
          />
          <AdminText
            settingKey="avocado.team_page_description"
            label={trans('ramon-avocado.admin.settings.team_desc_label', 'Page description')}
            placeholder={trans('ramon-avocado.admin.settings.team_desc_placeholder', 'Meet the people behind the community.')}
          />
          {m(AdminGroupPicker, {
            settingKey: 'avocado.team_page_groups',
            label: trans('ramon-avocado.admin.settings.team_groups_label', 'Groups to display'),
            help: trans('ramon-avocado.admin.settings.team_groups_help', 'Members of the selected groups will appear on the Team page.'),
          })}
        </div>
      )}
    </AdminCard>
  ), 38);
});

/*
 * Layout primitives for the settings page. Both are POJO components (Mithril
 * requires a `view` method — arrow functions are React syntax). Cast to `any`
 * so TS treats them as valid JSX elements: Mithril's JSX intrinsic types insist
 * on a class- or function-component shape, but Mithril accepts any object with a
 * `view()` method at runtime.
 */

// `disabled`: o card continua à vista, mas apagado e sem interação — para
// opções que só valem com outra ligada. `inert` tira o miolo do foco, do clique
// e do leitor de tela de uma vez (campos nativos e os componentes do tema).
export const AdminCard: any = {
  view({ attrs: { title, icon, disabled }, children }: any) {
    return (
      <div className={`AvocadoAdmin-card${disabled ? ' is-disabled' : ''}`}>
        <div className="AvocadoAdmin-card-header">
          {icon && (
            <span className="AvocadoAdmin-card-icon">
              <i className={icon} aria-hidden="true" />
            </span>
          )}
          <h3 className="AvocadoAdmin-card-title">{title}</h3>
        </div>
        <div className="AvocadoAdmin-card-body" inert={!!disabled}>
          {children}
        </div>
      </div>
    );
  },
};

// Divider between groups of sub-settings.
export const SubDivider: any = {
  view() {
    return <div className="AvocadoAdmin-subDivider" />;
  },
};

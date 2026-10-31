/*
 * Componentes POJO: o Mithril só exige um objeto com `view()`, mas os tipos JSX
 * pedem classe ou função, daí o cast para `any`.
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

export const SubDivider: any = {
  view() {
    return <div className="AvocadoAdmin-subDivider" />;
  },
};

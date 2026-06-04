/*
 * Layout primitives for the settings page. Both are POJO components (Mithril
 * requires a `view` method — arrow functions are React syntax). Cast to `any`
 * so TS treats them as valid JSX elements: Mithril's JSX intrinsic types insist
 * on a class- or function-component shape, but Mithril accepts any object with a
 * `view()` method at runtime.
 */

export const AdminCard: any = {
  view({ attrs: { title, icon }, children }: any) {
    return (
      <div className="AvocadoAdmin-card">
        <div className="AvocadoAdmin-card-header">
          {icon && (
            <span className="AvocadoAdmin-card-icon">
              <i className={icon} aria-hidden="true" />
            </span>
          )}
          <h3 className="AvocadoAdmin-card-title">{title}</h3>
        </div>
        <div className="AvocadoAdmin-card-body">{children}</div>
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

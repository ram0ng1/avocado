import app from 'flarum/admin/app';
import Button from 'flarum/common/components/Button';
import Dropdown from 'flarum/common/components/Dropdown';
import { AdminComponent, saveSetting, trans } from '../util';
import { OTHER_NETWORK, OTHER_NETWORK_ICON, SOCIAL_NETWORKS, detectNetwork, networkOf, parseFooterList } from '../../common/footerContent';
import type { FooterLinkItem, FooterSocialItem } from '../../common/footerContent';

/**
 * Listas editáveis do rodapé (links e redes sociais), gravadas como JSON na
 * própria opção. Enquanto a opção nunca foi gravada a lista mostra os
 * `defaults`; a primeira edição grava.
 */

const SAVE_DELAY = 500;

/** Estado e gravação comuns às duas listas. */
abstract class FooterList<T> extends AdminComponent {
  private timer: any = null;

  protected abstract fields(): (keyof T & string)[];
  protected abstract blank(): T;

  protected items(): T[] {
    return parseFooterList<T>(app.data.settings[this.attrs.settingKey], this.fields()) ?? (this.attrs.defaults as T[] | undefined) ?? [];
  }

  protected commit(items: T[]): void {
    const { settingKey } = this.attrs;
    const value = JSON.stringify(items);
    app.data.settings[settingKey] = value;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => saveSetting({ [settingKey]: value }), SAVE_DELAY);
  }

  protected patch(index: number, change: Partial<T>): void {
    this.commit(this.items().map((item, i) => (i === index ? { ...item, ...change } : item)));
  }

  protected move(index: number, by: number): void {
    const items = this.items().slice();
    const target = index + by;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    this.commit(items);
  }

  protected remove(index: number): void {
    this.commit(this.items().filter((_, i) => i !== index));
  }

  protected add(): void {
    this.commit([...this.items(), this.blank()]);
  }

  protected rowButtons(index: number, total: number) {
    const button = (icon: string, label: string, onclick: () => void, disabled = false) => (
      <Button
        className="Button Button--icon AvocadoAdmin-listBtn"
        icon={icon}
        aria-label={label}
        title={label}
        onclick={onclick}
        disabled={disabled}
      />
    );

    return (
      <div className="AvocadoAdmin-listActions">
        {button('fas fa-arrow-up', trans('ramon-avocado.admin.settings.footer_list_up', 'Move up'), () => this.move(index, -1), index === 0)}
        {button(
          'fas fa-arrow-down',
          trans('ramon-avocado.admin.settings.footer_list_down', 'Move down'),
          () => this.move(index, 1),
          index === total - 1
        )}
        {button('fas fa-trash-alt', trans('ramon-avocado.admin.settings.footer_list_remove', 'Remove'), () => this.remove(index))}
      </div>
    );
  }

  protected frame(rows: any[], addLabel: string) {
    const { label, help } = this.attrs;

    return (
      <div className="Form-group">
        {label && <label className="AvocadoAdmin-label">{label}</label>}
        <div className="AvocadoAdmin-list">
          {rows}
          <Button className="Button AvocadoAdmin-listAdd" icon="fas fa-plus" onclick={() => this.add()}>
            {addLabel}
          </Button>
        </div>
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}

export class AdminLinkList extends FooterList<FooterLinkItem> {
  protected fields(): (keyof FooterLinkItem)[] {
    return ['label', 'url'];
  }

  protected blank(): FooterLinkItem {
    return { label: '', url: '' };
  }

  view() {
    const items = this.items();

    const rows = items.map((item, index) => (
      <div className="AvocadoAdmin-listRow" key={index}>
        <input
          className="FormControl AvocadoAdmin-listLabel"
          type="text"
          value={item.label}
          placeholder={trans('ramon-avocado.admin.settings.footer_list_label_placeholder', 'Label')}
          aria-label={trans('ramon-avocado.admin.settings.footer_list_label_placeholder', 'Label')}
          oninput={(e: any) => this.patch(index, { label: e.target.value })}
        />
        <input
          className="FormControl AvocadoAdmin-listUrl"
          type="text"
          value={item.url}
          placeholder={trans('ramon-avocado.admin.settings.footer_list_url_placeholder', '/tags or https://…')}
          aria-label={trans('ramon-avocado.admin.settings.footer_list_url_placeholder', '/tags or https://…')}
          oninput={(e: any) => this.patch(index, { url: e.target.value })}
        />
        {this.rowButtons(index, items.length)}
      </div>
    ));

    return this.frame(rows, trans('ramon-avocado.admin.settings.footer_list_add', 'Add link'));
  }
}

export class AdminSocialList extends FooterList<FooterSocialItem> {
  protected fields(): (keyof FooterSocialItem)[] {
    return ['network', 'url'];
  }

  protected blank(): FooterSocialItem {
    return { network: OTHER_NETWORK, url: '' };
  }

  view() {
    const items = this.items();
    const otherName = trans('ramon-avocado.admin.settings.footer_social_other', 'Other site');

    const rows = items.map((item, index) => {
      const network = networkOf(item.network);

      return (
        <div className="AvocadoAdmin-listRow" key={index}>
          <Dropdown
            className="AvocadoAdmin-listNetwork"
            buttonClassName="Button"
            icon={network?.icon ?? OTHER_NETWORK_ICON}
            label={network?.name ?? otherName}
            accessibleToggleLabel={trans('ramon-avocado.admin.settings.footer_social_network', 'Network')}
          >
            {[
              ...SOCIAL_NETWORKS.map((option) => (
                <Button
                  key={option.key}
                  icon={option.icon}
                  active={option.key === item.network}
                  onclick={() => this.patch(index, { network: option.key })}
                >
                  {option.name}
                </Button>
              )),
              <Button key={OTHER_NETWORK} icon={OTHER_NETWORK_ICON} active={!network} onclick={() => this.patch(index, { network: OTHER_NETWORK })}>
                {otherName}
              </Button>,
            ]}
          </Dropdown>
          <input
            className="FormControl AvocadoAdmin-listUrl"
            type="text"
            value={item.url}
            placeholder="https://…"
            aria-label={trans('ramon-avocado.admin.settings.footer_social_url', 'Link')}
            oninput={(e: any) => {
              const url = e.target.value;
              // Colar o link numa linha ainda sem rede escolhe a rede pelo endereço.
              const detected = network ? null : detectNetwork(url);
              this.patch(index, detected && detected !== OTHER_NETWORK ? { url, network: detected } : { url });
            }}
          />
          {this.rowButtons(index, items.length)}
        </div>
      );
    });

    return this.frame(rows, trans('ramon-avocado.admin.settings.footer_social_add', 'Add network'));
  }
}

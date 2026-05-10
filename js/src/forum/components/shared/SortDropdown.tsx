import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';

export interface SortOption {
  key: string;
  label: string | (() => string);
  sort?: string;
}

export interface SortDropdownAttrs extends ComponentAttrs {
  options: SortOption[];
  currentKey: string;
  onChange: (key: string) => void;
}

/**
 * SortDropdown — reusable sort picker used by AllDiscussionsPage, TagPage,
 * AvocadoDiscussionsSearchPage, and AvocadoPostsSearchPage.
 */
export default class SortDropdown extends Component<SortDropdownAttrs> {
  private open: boolean = false;

  view() {
    const { options, currentKey, onChange } = this.attrs;
    const current = options.find((o) => o.key === currentKey) || options[0];
    const label   = typeof current?.label === 'function' ? current.label() : (current?.label ?? currentKey);

    return (
      <div className="AvocadoDiscussions-sortWrap">
        <button
          className={`AvocadoDiscussions-sortTrigger${this.open ? ' is-open' : ''}`}
          onclick={() => { this.open = !this.open; m.redraw(); }}
        >
          {label}
          <i className={`fas fa-chevron-${this.open ? 'up' : 'down'}`} aria-hidden="true" />
        </button>
        {this.open && (
          <div className="AvocadoDiscussions-sortDropdown">
            {options.map((option) => {
              const optLabel = typeof option.label === 'function' ? option.label() : option.label;
              return (
                <button
                  key={option.key}
                  className={`AvocadoDiscussions-sortOption${currentKey === option.key ? ' is-active' : ''}`}
                  onclick={() => {
                    this.open = false;
                    onChange(option.key);
                  }}
                >
                  <span className="AvocadoDiscussions-sortOption-check">
                    {currentKey === option.key && <i className="fas fa-check" aria-hidden="true" />}
                  </span>
                  {optLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
}

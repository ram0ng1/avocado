/**
 * Regras do changelog que não dependem de tela: de onde vêm a versão, o produto
 * e os tipos de uma entrada. Uma entrada é uma discussão numa tag de produto.
 */
import app from 'flarum/forum/app';

/** O número da versão como foi digitado no campo do compositor ("v2.4.0", "2.0.0-beta.1"), ou null. */
export const entryVersion = (discussion: any): string | null => {
  const value = discussion?.attribute?.('changelogVersion');
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const parseIdList = (raw: unknown): string[] => {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

/** IDs das tags marcadas como produto no admin, na ordem em que foram salvas. */
export const changelogProductIds = (): string[] => parseIdList(app.forum?.attribute('avocadoChangelogTags'));

const byPosition = (a: any, b: any): number => (a.position?.() ?? 9999) - (b.position?.() ?? 9999);

/** As tags de produto que já estão no store, na ordem do fórum. */
export const changelogProducts = (): any[] =>
  changelogProductIds()
    .map((id) => app.store.getById('tags', id))
    .filter(Boolean)
    .sort(byPosition);

const tagIds = (discussion: any): string[] => ((discussion?.tags?.() || []) as any[]).filter(Boolean).map((t) => String(t.id?.()));

/** A tag de produto da entrada — a primeira que casa com a lista do admin. */
export const entryProduct = (discussion: any, products: any[]): any | null => {
  const ids = new Set(tagIds(discussion));
  return products.find((p) => ids.has(String(p.id?.()))) ?? null;
};

/** Os tipos da entrada: as sub-tags do produto que a discussão carrega. */
export const entryTypes = (discussion: any, product: any | null): any[] => {
  if (!product) return [];
  const productId = String(product.id?.());
  return ((discussion?.tags?.() || []) as any[])
    .filter((t) => t && String(t.parent?.()?.id?.() ?? '') === productId)
    .sort(byPosition);
};

/** As sub-tags do produto, que viram os filtros de tipo da página. */
export const productTypes = (product: any | null): any[] => {
  if (!product) return [];
  return ((product.children?.() || []) as any[]).filter(Boolean).sort(byPosition);
};

/**
 * Para onde um link de tag deve apontar: uma tag de produto (ou uma sub-tag de
 * tipo) não tem página própria, o changelog já a mostra. Devolve o nome e os
 * parâmetros da rota do changelog, ou null para uma tag comum.
 *
 * É o lado "dentro do app" do redirecionamento: aqui os links já saem certos e
 * o Mithril nem pede `/t/...` ao servidor. Quem chega de fora por `/t/...` é
 * atendido pelo 302 do Middleware\RedirectChangelogTags.
 */
export const changelogTagTarget = (slug: unknown): { name: string; params: Record<string, string> } | null => {
  if (typeof slug !== 'string' || !slug || !app.forum?.attribute('avocadoChangelogEnabled')) return null;

  const products = new Set(changelogProductIds());
  if (!products.size) return null;

  const tag = (app.store.all('tags') as any[]).find((t) => t?.slug?.() === slug);
  if (!tag) return null;

  if (products.has(String(tag.id()))) {
    return { name: 'avocado-changelog.product', params: { product: slug } };
  }

  const parent = tag.parent?.();
  if (parent && products.has(String(parent.id()))) {
    return { name: 'avocado-changelog.product', params: { product: parent.slug(), type: slug } };
  }

  return null;
};

// ─── Datas ────────────────────────────────────────────────────────────────────

const locale = (): string | undefined => {
  const value = (app as any).data?.locale;
  return typeof value === 'string' && value ? value.replace('_', '-') : undefined;
};

const format = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  try {
    return new Intl.DateTimeFormat(locale(), options).format(date);
  } catch {
    // Locale que o Intl não conhece: melhor a formatação padrão do navegador do que nenhuma.
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
};

export const monthLabel = (date: Date): string => format(date, { month: 'long', year: 'numeric' });

export const dayLabel = (date: Date): string => format(date, { day: '2-digit', month: 'short' });

export const monthKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth()}`;

export interface MonthGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Agrupa mantendo a ordem de entrada (já vem do mais novo para o mais antigo). */
export const groupByMonth = <T>(items: T[], dateOf: (item: T) => Date | null): MonthGroup<T>[] => {
  const groups: MonthGroup<T>[] = [];
  items.forEach((item) => {
    const date = dateOf(item);
    const key = date ? monthKey(date) : 'unknown';
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: date ? monthLabel(date) : '', items: [item] });
    }
  });
  return groups;
};

import app from 'flarum/forum/app';
import Avatar from 'flarum/common/components/Avatar';
import { trans, displayName, userRoute, safeCssUrl, safeCssColor, hexLuminance, getDiscussionHeroImageUrl, canEditDiscussionHero } from '../../utils';
import { CoverPicker } from './ChangelogFields';
import { changelogProducts, entryProduct, entryTypes, entryVersion, dayLabel } from '../../utils/changelog';
import { resolveCover } from '../../utils/cover';

/**
 * O cabeçalho da página de uma versão do changelog — no lugar do hero de
 * discussão, que fala de "posts" e "participantes". Mostra de onde a versão veio
 * (voltar ao changelog, produto, tipos), o número, a data, o título e o autor,
 * sobre a capa que a versão escolheu: a imagem ou o degradê das cores. Sem
 * nenhuma das duas o cabeçalho volta ao padrão da tag — a cor dela, chapada, com
 * o texto claro ou escuro conforme a luminância, como o hero de discussão do tema.
 *
 * É a única coisa que muda na página: a navegação lateral (responder, seguir,
 * editar…), os comentários e a caixa de resposta continuam os da discussão — por
 * isso o cabeçalho não tem menu de ações próprio.
 *
 * `imageControls` são os botões de trocar/remover a imagem que o hero de
 * discussão já monta (só para quem pode renomear). Com `loading` o cabeçalho é o
 * do skeleton da página: os mesmos dados (já estão no store quando se vem da lista
 * do changelog), sem os botões de edição.
 */
export const renderReleaseHero = (discussion: any, tags: any[], imageControls: any, loading = false) => {
  const product = entryProduct(discussion, changelogProducts());
  const types = entryTypes(discussion, product);
  const version = entryVersion(discussion);
  const created = discussion.createdAt?.() as Date | undefined;
  const author = discussion.user?.();

  const image = getDiscussionHeroImageUrl(discussion);
  const cover = image ? null : resolveCover(discussion.attribute?.('changelogCover'), tags);
  const gradient = image ? null : (cover?.gradient ?? null);

  // Sem imagem e sem cores escolhidas: o padrão da tag. A cor é a do produto (a tag
  // principal, a mesma que o hero de discussão usaria); sem cor nela, a do primeiro
  // tipo e, por fim, a primária do fórum — a mesma escada do hero do tema.
  const tagColor = safeCssColor(product?.color?.()) ?? safeCssColor(types[0]?.color?.()) ?? null;
  const lightTag = !!tagColor && /^#[0-9a-f]{6}$/i.test(tagColor) && hexLuminance(tagColor) > 0.35;
  const icon: string | null = cover?.icon ?? types[0]?.icon?.() ?? product?.icon?.() ?? null;

  const backHref = product ? app.route('avocado-changelog.product', { product: product.slug() }) : app.route('avocado-changelog');

  // O botão de cor só faz sentido sem imagem (a imagem vale mais); some junto com
  // o de imagem para quem não pode editar. Salva direto na versão, como o de imagem.
  const canEdit = !loading && canEditDiscussionHero(discussion);
  const coverButton =
    canEdit && !image ? (
      <CoverPicker
        variant="hero"
        tags={tags}
        value={discussion.attribute?.('changelogCover') ?? null}
        onChange={(value: string | null) => {
          discussion
            .save({ changelogCover: value })
            .then(() => m.redraw())
            .catch(() => m.redraw());
        }}
      />
    ) : null;

  const style: Record<string, string> = image
    ? { backgroundImage: safeCssUrl(image) }
    : gradient
      ? { background: gradient }
      : { '--release-color': tagColor ?? 'var(--primary-color)' };
  const heroClass = [
    'ReleaseHero',
    image ? 'ReleaseHero--image' : gradient ? 'ReleaseHero--gradient' : 'ReleaseHero--tag',
    !image && !gradient && lightTag ? 'ReleaseHero--lightTag' : '',
    loading ? 'ReleaseHero--loading' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header
      key="avocado-release-hero"
      className={heroClass}
      style={style}
      // A classe do <html> segue o cabeçalho: existe enquanto a página mostra uma
      // versão e some quando ele sai. A remoção confere no tick seguinte se outro
      // cabeçalho de versão entrou no lugar (skeleton → página, versão → versão):
      // o Mithril não garante a ordem entre o onremove de um e o oncreate do outro.
      oncreate={() => document.documentElement.classList.add('avocado-release')}
      onremove={() =>
        setTimeout(() => {
          if (!document.querySelector('.ReleaseHero')) document.documentElement.classList.remove('avocado-release');
        }, 0)
      }
    >
      <div className="container">
        <div className="ReleaseHero-inner">
          {!loading && (coverButton || imageControls) && (
            <div className="ReleaseHero-tools">
              {coverButton}
              {imageControls}
            </div>
          )}

          <nav className="ReleaseHero-nav">
            <a
              className="ReleaseHero-back"
              href={backHref}
              onclick={(e: MouseEvent) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                m.route.set(backHref);
              }}
            >
              <i className="fas fa-arrow-left" aria-hidden="true" />
              <span>{trans('ramon-avocado.forum.changelog.title', 'Changelog')}</span>
            </a>

            <div className="ReleaseHero-labels">
              {product && (
                <span className="ReleaseHero-label">
                  {product.icon?.() && <i className={product.icon()} aria-hidden="true" />}
                  {product.name()}
                </span>
              )}
              {types.map((tag: any) => (
                <span key={tag.id()} className="ReleaseHero-label ReleaseHero-label--type">
                  {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                  {tag.name()}
                </span>
              ))}
            </div>
          </nav>

          <div className="ReleaseHero-when">
            {version && <span className="ReleaseHero-version">{version}</span>}
            {created && (
              <time className="ReleaseHero-date" dateTime={created.toISOString()}>
                {dayLabel(created)} {created.getFullYear()}
              </time>
            )}
          </div>

          <h1 className="ReleaseHero-title">{discussion.title?.()}</h1>

          <div className="ReleaseHero-foot">
            {author && (
              <a
                className="ReleaseHero-author"
                href={userRoute(author)}
                onclick={(e: MouseEvent) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  m.route.set(userRoute(author));
                }}
              >
                <Avatar user={author} />
                <span>{displayName(author)}</span>
              </a>
            )}

          </div>

          {icon && <i className={`ReleaseHero-icon ${icon}`} aria-hidden="true" />}
        </div>
      </div>
    </header>
  );
};

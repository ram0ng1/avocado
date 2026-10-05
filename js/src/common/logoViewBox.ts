/**
 * Recorte do logo SVG: o viewBox justo em volta do que o arquivo desenha, com
 * 3% de folga. Ferramentas de exportação costumam deixar margem no viewBox, e o
 * logo sairia menor que a altura do header.
 *
 * Precisa de getBBox (geometria real de path, texto e transform), então só roda
 * no navegador. O admin mede uma vez e grava em `avocado.logo_svg_viewbox`
 * (Support\LogoViewBox no PHP), e o servidor embute o logo já recortado; o
 * fórum só mede por conta própria no fallback — logo novo ainda sem medida.
 * Um único código para os dois lados garante o mesmo número.
 */

/** Setting com `{ path, viewBox }` — o caminho amarra a medida ao arquivo medido. */
export const LOGO_VIEWBOX_SETTING = 'avocado.logo_svg_viewbox';

export function measureTightViewBox(svgEl: Element): string | null {
  // Fora da tela, mas no DOM: getBBox exige o elemento renderizado.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:2000px;height:2000px;overflow:hidden;';
  document.body.appendChild(probe);
  probe.appendChild(svgEl);

  let tightViewBox: string | null = null;
  try {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    svgEl.querySelectorAll<SVGGraphicsElement>('path,rect,circle,ellipse,polygon,polyline,line,text,image,use').forEach((el) => {
      if (el.closest('defs')) return;
      try {
        const b = el.getBBox();
        if (b.width > 0 && b.height > 0) {
          x0 = Math.min(x0, b.x);
          y0 = Math.min(y0, b.y);
          x1 = Math.max(x1, b.x + b.width);
          y1 = Math.max(y1, b.y + b.height);
        }
      } catch (_) {}
    });
    if (isFinite(x0)) {
      const pad = (x1 - x0) * 0.03; // 3% padding
      tightViewBox = `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;
    }
  } catch (_) {}

  document.body.removeChild(probe);

  return tightViewBox;
}

/** Busca o SVG pela URL, faz o parse em XML e mede. Null se não for um SVG. */
export async function fetchAndMeasure(url: string): Promise<string | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  const svgEl = new DOMParser().parseFromString(await r.text(), 'image/svg+xml').documentElement;
  if (svgEl.nodeName !== 'svg') return null;
  return measureTightViewBox(svgEl);
}

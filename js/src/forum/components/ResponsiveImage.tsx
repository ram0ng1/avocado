// @ts-nocheck
/**
 * ResponsiveImage — renders optimized images with AVIF/WebP/JPEG sources,
 * GIF-to-video conversion, LQIP placeholder, and lazy loading.
 */

export interface ResponsiveImageAttrs {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  /** 'high' = LCP candidate (eager), 'low' = always lazy, 'auto' = observer-lazy */
  priority?: 'high' | 'low' | 'auto';
  className?: string;
  style?: Record<string, any>;
  onclick?: ((e: Event) => void) | null;
}

const LQIP_PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 150'%3E%3Crect fill='%23f0f0f0' width='400' height='150'/%3E%3C/svg%3E`;

export default class ResponsiveImage {
  view(vnode: { attrs: ResponsiveImageAttrs }) {
    const {
      src,
      alt       = '',
      width     = 400,
      height    = 150,
      priority  = 'auto',
      className = '',
      style     = {},
      onclick   = null,
    } = vnode.attrs;

    if (!src) return null;

    const isLcp = priority === 'high';
    const isGif = src.toLowerCase().endsWith('.gif');

    return isGif
      ? this.renderVideo(src, alt, width, height, isLcp, className, style, onclick)
      : this.renderPicture(src, alt, width, height, isLcp, className, style, onclick);
  }

  private buildParams(src: string, width: number, height: number, format: string, quality: number) {
    return `?url=${encodeURIComponent(src)}&width=${width}&height=${height}&format=${format}&quality=${quality}`;
  }

  private renderPicture(
    src: string, alt: string, width: number, height: number,
    isLcp: boolean, className: string, style: Record<string, any>, onclick: ((e: Event) => void) | null
  ) {
    const base    = '/api/avocado/optimize-image';
    const avifUrl = base + this.buildParams(src, width, height, 'avif', 75);
    const webpUrl = base + this.buildParams(src, width, height, 'webp', 80);
    const jpegUrl = base + this.buildParams(src, width, height, 'jpeg', 85);
    const lqipStyle = { backgroundImage: `url('${LQIP_PLACEHOLDER}')`, backgroundSize: 'cover', backgroundPosition: 'center' };

    return m('picture', { className: `AvocadoResponsiveImage ${className}`, style, onclick }, [
      m('source', { srcset: avifUrl, type: 'image/avif' }),
      m('source', { srcset: webpUrl, type: 'image/webp' }),
      m('img', {
        src: jpegUrl, alt, width, height,
        loading:       isLcp ? 'eager'  : 'lazy',
        fetchpriority: isLcp ? 'high'   : 'auto',
        decoding: 'async',
        className: 'AvocadoResponsiveImage-img',
        style: lqipStyle,
        oncreate: (v: any) => this.setupLazyLoad(v, isLcp),
      }),
    ]);
  }

  private renderVideo(
    src: string, alt: string, width: number, height: number,
    isLcp: boolean, className: string, style: Record<string, any>, onclick: ((e: Event) => void) | null
  ) {
    const base     = '/api/avocado/optimize-image';
    const mp4Url   = `${base}?url=${encodeURIComponent(src)}&format=mp4`;
    const webmUrl  = `${base}?url=${encodeURIComponent(src)}&format=webm`;
    const lqipStyle = { backgroundImage: `url('${LQIP_PLACEHOLDER}')`, backgroundSize: 'cover', backgroundPosition: 'center' };

    return m('figure', { className: `AvocadoResponsiveImage AvocadoResponsiveImage--video ${className}`, style }, [
      m('video', {
        width, height, autoplay: true, muted: true, loop: true, playsinline: true,
        preload: isLcp ? 'auto' : 'metadata',
        className: 'AvocadoResponsiveImage-video',
        style: lqipStyle,
        onclick,
        oncreate: (v: any) => this.setupVideoLazyLoad(v, isLcp),
      }, [
        m('source', { src: webmUrl, type: 'video/webm' }),
        m('source', { src: mp4Url,  type: 'video/mp4'  }),
        m('img',    { src, alt, width, height }),
      ]),
      alt ? m('figcaption', { className: 'AvocadoResponsiveImage-caption' }, alt) : null,
    ]);
  }

  private setupLazyLoad(vnode: any, isLcp: boolean) {
    if (isLcp) return;
    const img = vnode.dom as HTMLImageElement;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) observer.disconnect();
    }, { rootMargin: '100px' });
    observer.observe(img);
  }

  private setupVideoLazyLoad(vnode: any, isLcp: boolean) {
    if (isLcp) { vnode.dom.preload = 'auto'; return; }
    const video = vnode.dom as HTMLVideoElement;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        video.preload = 'auto';
        video.play().catch(() => {});
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(video);
  }
}

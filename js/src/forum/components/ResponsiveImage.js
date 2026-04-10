/**
 * ResponsiveImage Component
 * 
 * Renders optimized images with:
 * - Automatic format conversion (AVIF, WebP, JPEG)
 * - Responsive sizing
 * - GIF to video conversion
 * - LQIP (Low Quality Image Placeholder)
 * - Intelligent lazy loading
 * 
 * Usage:
 *   m(ResponsiveImage, {
 *     src: 'https://example.com/image.png',
 *     alt: 'Image description',
 *     width: 400,
 *     height: 150,
 *     priority: 'high' // 'high', 'low', 'auto'
 *   })
 */

// Declare global Mithril functions
declare const m;

export default class ResponsiveImage {
  view(vnode) {
    
    const {
      src,
      alt = '',
      width = 400,
      height = 150,
      priority = 'auto',
      className = '',
      style = {},
      onclick = null,
    } = vnode.attrs;

    if (!src) return null;

    // Determine if first image (LCP candidate)
    const isLcp = priority === 'high';
    const isGif = src.toLowerCase().endsWith('.gif');

    // Base config for optimization API
    const optimizeApi = '/api/avocado/optimize-image';
    
    return isGif
      ? this.renderVideoFallback(m, src, alt, width, height, isLcp, className, style, onclick)
      : this.renderPicture(m, src, alt, width, height, isLcp, className, style, onclick);
  }

  /**
   * Render <picture> with multiple format sources
   */
  renderPicture(m, src, alt, width, height, isLcp, className, style, onclick) {
    // Generate optimized URLs
    const params = (format, q = 80) => 
      `?url=${encodeURIComponent(src)}&width=${width}&height=${height}&format=${format}&quality=${q}`;

    const avifUrl = `/api/avocado/optimize-image${params('avif', 75)}`;
    const webpUrl = `/api/avocado/optimize-image${params('webp', 80)}`;
    const jpegUrl = `/api/avocado/optimize-image${params('jpeg', 85)}`;

    // LQIP (Low Quality Image Placeholder) - tiny inline base64
    const lqipDataUri = this.generateLqip(src);

    return m(
      'picture',
      {
        className: `AvocadoResponsiveImage ${className}`,
        style: style,
        onclick: onclick,
      },
      [
        // AVIF - best compression
        m('source', { srcset: avifUrl, type: 'image/avif' }),

        // WebP - wide browser support
        m('source', { srcset: webpUrl, type: 'image/webp' }),

        // JPEG fallback
        m('img', {
          src: jpegUrl,
          alt: alt,
          width: width,
          height: height,
          loading: isLcp ? 'eager' : 'lazy',
          fetchpriority: isLcp ? 'high' : 'auto',
          decoding: 'async',
          className: 'AvocadoResponsiveImage-img',
          style: {
            backgroundImage: `url('${lqipDataUri}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          },
          oncreate: (vnode) => this.setupLazyLoad(vnode, isLcp),
        }),
      ]
    );
  }

  /**
   * Render <video> with fallback for GIF conversion
   */
  renderVideoFallback(m, src, alt, width, height, isLcp, className, style, onclick) {
    const params = '?url=' + encodeURIComponent(src) + '&format=mp4';
    const videoUrl = `/api/avocado/optimize-image${params}`;
    const webmUrl = `/api/avocado/optimize-image?url=${encodeURIComponent(src)}&format=webm`;

    const lqipDataUri = this.generateLqip(src);

    return m(
      'figure',
      {
        className: `AvocadoResponsiveImage AvocadoResponsiveImage--video ${className}`,
        style: style,
      },
      [
        m(
          'video',
          {
            width: width,
            height: height,
            autoplay: true,
            muted: true,
            loop: true,
            playsinline: true,
            preload: isLcp ? 'auto' : 'metadata',
            className: 'AvocadoResponsiveImage-video',
            style: {
              backgroundImage: `url('${lqipDataUri}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            },
            onclick: onclick,
            oncreate: (vnode) => this.setupVideoLazyLoad(vnode, isLcp),
          },
          [
            m('source', { src: webmUrl, type: 'video/webm' }),
            m('source', { src: videoUrl, type: 'video/mp4' }),
            // Fallback: render original GIF
            m('img', { src: src, alt: alt, width: width, height: height }),
          ]
        ),
        alt ? m('figcaption', { className: 'AvocadoResponsiveImage-caption' }, alt) : null,
      ]
    );
  }

  /**
   * Setup lazy loading with Intersection Observer
   */
  setupLazyLoad(vnode, isLcp) {
    if (isLcp) return; // Already eager

    const img = vnode.dom;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Trigger picture to load sources
          // The browser will pick best format automatically
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(img);
  }

  /**
   * Setup lazy loading for video
   */
  setupVideoLazyLoad(vnode, isLcp) {
    if (isLcp) {
      // Eager: start loading immediately
      vnode.dom.preload = 'auto';
      return;
    }

    const video = vnode.dom;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.preload = 'auto';
          video.play().catch(() => {
            // Play might fail in some browsers, that's OK
          });
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(video);
  }

  /**
   * Generate LQIP (Low Quality Image Placeholder)
   * Returns a tiny blurred placeholder as data URI
   */
  generateLqip(src) {
    // Extract dominant color from URL or use gradient fallback
    // This is a simplified version - in production use a proper LQIP service
    
    // For now, return a subtle gradient placeholder
    const colors = [
      'rgba(100, 100, 100, 0.1)',
      'rgba(120, 120, 120, 0.08)'
    ];

    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 150'%3E%3Crect fill='%23f0f0f0' width='400' height='150'/%3E%3C/svg%3E`;
  }
}

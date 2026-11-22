/** Runs only after an explicit Save in the active tab; never receives credentials. */
export function captureLoadedPage() {
  const root = document.querySelector('article') || document.querySelector('main') || document.body;
  if (!root) throw new Error('This page has no readable document.');
  const clone = root.cloneNode(true);
  const originalImages = Array.from(root.querySelectorAll('img'));
  clone.querySelectorAll('img').forEach((img, index) => {
    const original = originalImages[index];
    if (original?.currentSrc) img.setAttribute('src', original.currentSrc);
  });
  clone
    .querySelectorAll(
      'script,style,noscript,iframe,form,input,textarea,select,button,nav,footer,[contenteditable]',
    )
    .forEach((node) => node.remove());
  clone.querySelectorAll('img').forEach((img) => {
    const src =
      img.getAttribute('src') && !img.getAttribute('src').startsWith('data:')
        ? img.getAttribute('src')
        : img.getAttribute('data-src') || img.getAttribute('data-original');
    if (src)
      try {
        img.setAttribute('src', new URL(src, document.baseURI).href);
      } catch {
        img.remove();
      }
    // Keep responsive/lazy candidates for server extraction when currentSrc is empty.
  });
  clone.querySelectorAll('[href]').forEach((node) => {
    try {
      const url = new URL(node.getAttribute('href'), document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol)) node.removeAttribute('href');
      else node.setAttribute('href', url.href);
    } catch {
      node.removeAttribute('href');
    }
  });
  const head = document.createElement('head'),
    title = document.createElement('title');
  title.textContent = document.title;
  head.append(title);
  // Keep the bounded public metadata used to classify product bookmarks.
  const metaNames = [
    'og:type',
    'og:title',
    'og:description',
    'og:site_name',
    'product:brand',
    'product:color',
    'product:category',
    'product:price:amount',
    'product:price:currency',
  ];
  for (const key of metaNames) {
    const source = document.querySelector(`meta[property="${key}"],meta[name="${key}"]`);
    const content = source?.getAttribute('content');
    if (content) {
      const meta = document.createElement('meta');
      meta.setAttribute('property', key);
      meta.setAttribute('content', content.slice(0, 500));
      head.append(meta);
    }
  }
  function productNode(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 5) return null;
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 50)) {
        const product = productNode(entry, depth + 1);
        if (product) return product;
      }
      return null;
    }
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (
      types.some(
        (type) => typeof type === 'string' && (type === 'Product' || type.endsWith('/Product')),
      )
    )
      return value;
    return productNode(value['@graph'], depth + 1) || productNode(value.mainEntity, depth + 1);
  }
  const string = (value) =>
    typeof value === 'string'
      ? value.slice(0, 500)
      : typeof value === 'number'
        ? String(value)
        : undefined;
  for (const source of Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  ).slice(0, 20)) {
    if ((source.textContent || '').length > 150000) continue;
    let product;
    try {
      product = productNode(JSON.parse(source.textContent || ''));
    } catch {
      continue;
    }
    if (!product) continue;
    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    const image = Array.isArray(product.image) ? product.image[0] : product.image;
    const metadata = {
      '@type': 'Product',
      name: string(product.name),
      description: string(product.description),
      brand: string(product.brand?.name ?? product.brand),
      color: string(product.color),
      category: string(product.category),
      image: string(image?.url ?? image),
      offers: {
        price: string(offer?.price),
        priceCurrency: string(offer?.priceCurrency),
        seller: string(offer?.seller?.name ?? offer?.seller),
      },
    };
    const script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.textContent = JSON.stringify(metadata).replaceAll('<', '\\u003c');
    head.append(script);
    break;
  }
  for (const source of document.querySelectorAll(
    'meta[property="og:image"],meta[name="twitter:image"]',
  )) {
    try {
      const url = new URL(source.getAttribute('content'), document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const meta = source.cloneNode(false);
      meta.setAttribute('content', url.href);
      head.append(meta);
      // Preserve a displayed lead photo above <article>, not a social-only card.
      const shown = Array.from(document.querySelectorAll('img')).find((img) => {
        if (root.contains(img)) return false;
        return [
          img.currentSrc,
          img.getAttribute('src'),
          img.getAttribute('data-src'),
          img.getAttribute('data-breeze'),
        ].some((value) => {
          if (!value) return false;
          try {
            return new URL(value, document.baseURI).href === url.href;
          } catch {
            return false;
          }
        });
      });
      if (shown && !clone.querySelector('[data-am-lead]')) {
        const image = document.createElement('img');
        image.setAttribute('src', url.href);
        image.setAttribute('alt', shown.getAttribute('alt') || '');
        image.setAttribute('data-am-lead', '');
        clone.prepend(image);
      }
    } catch {
      /* Invalid image metadata is optional. */
    }
  }
  const html = `<!doctype html><html>${head.outerHTML}<body>${clone.outerHTML}</body></html>`;
  if (new TextEncoder().encode(html).byteLength > 400000)
    throw new Error('This page is too large for browser capture.');
  return { html, documentUrl: document.URL };
}

/** Isolated-world function: preserve one social post, never a personalized feed. */
export function captureSocialPost() {
  const url = new URL(document.URL),
    host = url.hostname.replace(/^www\./, '');
  const platforms = {
    'instagram.com': 'Instagram',
    'x.com': 'X',
    'twitter.com': 'X',
    'mobile.twitter.com': 'X',
    'facebook.com': 'Facebook',
    'm.facebook.com': 'Facebook',
    'web.facebook.com': 'Facebook',
    'reddit.com': 'Reddit',
    'old.reddit.com': 'Reddit',
    'new.reddit.com': 'Reddit',
    'pinterest.com': 'Pinterest',
    'pinterest.co.uk': 'Pinterest',
    'uk.pinterest.com': 'Pinterest',
    'tiktok.com': 'TikTok',
  };
  const platform = platforms[host];
  if (!platform) return null;
  const path = url.pathname;
  const individual =
    platform === 'Instagram'
      ? /\/(reel|reels|p|tv)\/[\w-]+/.test(path)
      : platform === 'X'
        ? /\/status\/\d+/.test(path)
        : platform === 'Reddit'
          ? /\/comments\/[\w]+/.test(path)
          : platform === 'Pinterest'
            ? /\/pin\/\d+/.test(path)
            : platform === 'TikTok'
              ? /\/@[^/]+\/video\/\d+/.test(path)
              : /\/(reel|videos|posts|permalink)\//.test(path) ||
                ['v', 'story_fbid', 'fbid'].some((k) => url.searchParams.has(k));
  if (!individual) return null;
  function meta(name) {
    return (
      document
        .querySelector(`meta[property="${name}"],meta[name="${name}"]`)
        ?.getAttribute('content')
        ?.trim() || ''
    );
  }
  const selectors = {
    X: 'article[data-testid="tweet"]',
    Instagram: 'article',
    Reddit: 'shreddit-post, .thing.link',
    Facebook: '[role="dialog"], [role="article"]:not([aria-label])',
    Pinterest: '[data-test-id="pin-closeup"], [data-test-id="closeup-body"]',
    TikTok: '[data-e2e="browse-video"], [data-e2e="detail-video"]',
  };
  const candidates = Array.from(document.querySelectorAll(selectors[platform]));
  const id =
    path.match(/\/(?:status|comments|pin|reels?|p|tv|video|videos|posts)\/([\w-]+)/)?.[1] ||
    url.searchParams.get('v') ||
    url.searchParams.get('story_fbid');
  function matches(node) {
    return (
      Array.from(node.querySelectorAll('a[href]')).some((a) => {
        try {
          return id && new URL(a.getAttribute('href'), url).pathname.split('/').includes(id);
        } catch {
          return false;
        }
      }) ||
      node.getAttribute('post-id') === `t3_${id}` ||
      node.getAttribute('id') === `thing_t3_${id}`
    );
  }
  // Instagram navigation can leave another post's Open Graph tags in the document.
  if (platform === 'Instagram' && meta('og:url')) {
    const metaId = new URL(meta('og:url'), url).pathname.match(/\/(?:reels?|p|tv)\/([\w-]+)/)?.[1];
    if (metaId && id && metaId !== id)
      throw new Error(
        'Refresh this Instagram page, then save again. Instagram still has details from the previous post.',
      );
  }
  // A single detail container is safe; multiple feed candidates require an exact post match.
  const root = candidates.find(matches) || (candidates.length === 1 ? candidates[0] : null);
  const clone = root?.cloneNode(true);
  clone
    ?.querySelectorAll(
      'script,style,nav,form,input,textarea,button,[contenteditable],shreddit-comment,[data-testid="reply"],.comments,[role="article"][aria-label]',
    )
    .forEach((n) => n.remove());
  const textSelectors = {
    X: '[data-testid="tweetText"]',
    Instagram: 'h1',
    Reddit: '[slot="text-body"],.usertext-body',
    Facebook: '[data-ad-preview="message"], [data-ad-comet-preview="message"]',
    Pinterest: '[data-test-id="pin-description"]',
    TikTok: '[data-e2e="browse-video-desc"], [data-e2e="video-desc"]',
  };
  const text =
    Array.from(clone?.querySelectorAll(textSelectors[platform]) || [])
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 30000) || meta('og:description').slice(0, 30000);
  let title = (
    clone?.querySelector('h1,[slot="title"]')?.textContent ||
    meta('og:title') ||
    document.title
  )
    .trim()
    .slice(0, 300);
  const author = (
    clone?.querySelector(
      '[data-testid="User-Name"], [data-e2e="browse-username"], [slot="authorName"]',
    )?.textContent ||
    root?.getAttribute('author') ||
    meta('author')
  )
    .trim()
    .slice(0, 200);
  const images = [];
  function add(src, alt = '') {
    if (!src) return;
    try {
      const u = new URL(src, url);
      if (
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        images.some((i) => i.url === u.href)
      )
        return;
      images.push({ url: u.href, alt: alt.slice(0, 500) });
    } catch {}
  }
  // Preserve only images in the selected post; exclude avatars and tiny controls.
  for (const img of Array.from(root?.querySelectorAll('img') || [])) {
    if (images.length >= 12) break;
    if (
      img.closest('shreddit-comment,[data-testid="reply"],.comments,[role="article"][aria-label]')
    )
      continue;
    if (/profile_images\//.test(img.getAttribute('src') || '')) continue;
    if (
      platform === 'Pinterest' &&
      !img.closest(
        '[data-test-id="closeup-image"], [data-test-id="closeup-image-main"], [role="region"][aria-label="Pin image"]',
      ) &&
      /75x75/.test(img.getAttribute('src') || '')
    )
      continue;
    if (/avatar|profile picture/i.test(img.getAttribute('alt') || '')) continue;
    const width = img.naturalWidth || Number(img.getAttribute('width'));
    if (width && width < 100) continue;
    add(
      img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src'),
      img.getAttribute('alt') || '',
    );
  }
  if (!images.length && meta('og:image')) add(meta('og:image'));
  if (!title || /^(\(\d+\)\s*)?(Pinterest|Facebook|Instagram|TikTok)$/i.test(title))
    title = (text || images[0]?.alt || `${platform} post`).slice(0, 180);
  const video =
    Boolean(root?.querySelector('video')) ||
    /video/i.test(meta('og:type')) ||
    /\/(reels?|tv|videos?|watch)(?:\/|$)/.test(path);
  if (!text && !images.length) return null;
  return { documentUrl: document.URL, social: { platform, title, author, text, images, video } };
}

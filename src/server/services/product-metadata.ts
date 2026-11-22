import { parseHTML } from 'linkedom';
import { normalizeUrl } from '@/server/services/extract';
import { captureTags } from '@/server/services/saved-content';

type SchemaNode = Record<string, unknown>;

function schemaNodes(value: unknown): SchemaNode[] {
  if (Array.isArray(value)) return value.flatMap(schemaNodes);
  if (!value || typeof value !== 'object') return [];
  const node = value as SchemaNode;
  return [node, ...schemaNodes(node['@graph']), ...schemaNodes(node.mainEntity)];
}

function hasType(node: SchemaNode, name: string) {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.some(
    (type) => typeof type === 'string' && (type === name || type.endsWith('/' + name)),
  );
}

function field(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number')
    return String(value).trim().slice(0, 300);
  if (value && typeof value === 'object' && !Array.isArray(value))
    return field((value as SchemaNode).name);
  return '';
}

function plainText(value: string) {
  return (
    parseHTML(`<span>${value.replaceAll('<', '&lt;')}</span>`).document.querySelector('span')
      ?.textContent || ''
  );
}

export function readProductMetadata(html: string, url: string) {
  const { document } = parseHTML(html);
  const meta = (key: string) =>
    document
      .querySelector(`meta[property="${key}"],meta[name="${key}"]`)
      ?.getAttribute('content')
      ?.trim() || '';
  const products = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  ).flatMap((script) => {
    try {
      return schemaNodes(JSON.parse(script.textContent || '')).filter((node) =>
        hasType(node, 'Product'),
      );
    } catch {
      return [];
    }
  });
  const product = products.find((node) => node.url === url) || products[0];
  if (!product && !/^product(?:\.|$)/i.test(meta('og:type'))) return null;

  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const offer = offers && typeof offers === 'object' ? (offers as SchemaNode) : {};
  const title = plainText(
    field(product?.name) || meta('og:title') || document.title || new URL(url).hostname,
  );
  const retailer =
    field(offer.seller) || meta('og:site_name') || new URL(url).hostname.replace(/^www\./, '');
  const brand = field(product?.brand) || meta('product:brand');
  const color =
    field(product?.color) ||
    meta('product:color') ||
    title.match(
      /\b(?:navy blue|light blue|dark blue|burgundy|maroon|black|white|beige|grey|gray|blue|green|red|orange|pink|purple|yellow|brown)\b/i,
    )?.[0] ||
    '';
  const category =
    field(product?.category) ||
    meta('product:category') ||
    title.match(
      /\b(?:t-shirt|dress shirt|shirt|jacket|sneakers|shoes|sweater|jeans|trousers|backpack|headphones|camera)\b/i,
    )?.[0] ||
    '';
  const priceAmount = field(offer.price) || meta('product:price:amount');
  const currency = field(offer.priceCurrency) || meta('product:price:currency');
  const rawImage = Array.isArray(product?.image) ? product.image[0] : product?.image;
  const imageValue =
    field(rawImage) || field((rawImage as SchemaNode | undefined)?.url) || meta('og:image');
  let image: string | undefined;
  try {
    if (imageValue) image = normalizeUrl(new URL(imageValue, url).href);
  } catch {
    /* Optional image */
  }

  return {
    title: title.slice(0, 300),
    url,
    domain: new URL(url).hostname,
    excerpt: plainText(field(product?.description) || meta('og:description')).slice(0, 300),
    image,
    retailer,
    brand,
    color,
    price: [currency, priceAmount].filter(Boolean).join(' '),
    tags: ['product', category, brand, color, ...captureTags(title)],
  };
}

export interface ProductImageManifest {
  files: string[];
  bySku: Record<string, string>;
}

const EMPTY_MANIFEST: ProductImageManifest = {
  files: [],
  bySku: {},
};

export function normalizeSkuLookupKey(sku: string): string {
  return sku
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, '');
}

export async function fetchProductImageManifest(): Promise<ProductImageManifest> {
  try {
    const res = await fetch('/images/products/manifest.json', { cache: 'no-cache' });
    if (!res.ok) return EMPTY_MANIFEST;
    const data = (await res.json()) as Partial<ProductImageManifest>;
    return {
      files: Array.isArray(data.files) ? data.files : [],
      bySku: data.bySku && typeof data.bySku === 'object' ? data.bySku : {},
    };
  } catch {
    return EMPTY_MANIFEST;
  }
}

export function resolveProductImageUrl(
  sku: string | undefined,
  explicitImageValue: string | undefined,
  manifest: ProductImageManifest,
  rowSpecHint?: string
): string | undefined {
  const direct = (explicitImageValue || '').trim();
  if (
    direct &&
    (/^(https?:\/\/|data:image\/|\/)/i.test(direct) ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(direct))
  ) {
    if (
      direct.startsWith('/') ||
      direct.startsWith('http://') ||
      direct.startsWith('https://') ||
      direct.startsWith('data:')
    ) {
      return direct;
    }
    return `/images/products/${direct.replace(/^\.?\//, '')}`;
  }

  const rawSku = (sku || '').trim();
  if (rawSku) {
    const exactUpper = rawSku.toUpperCase();
    if (manifest.bySku[exactUpper]) return manifest.bySku[exactUpper];

    const compact = normalizeSkuLookupKey(rawSku);
    if (compact && manifest.bySku[compact]) return manifest.bySku[compact];
  }

  if (!rawSku && rowSpecHint && /64\*20/.test(rowSpecHint) && /10\*35\*0\.25/.test(rowSpecHint)) {
    const row116File = manifest.files.find((f) => /^Row116_.*K6/i.test(f));
    if (row116File) {
      return `/images/products/${encodeURIComponent(row116File)}`;
    }
  }

  return undefined;
}

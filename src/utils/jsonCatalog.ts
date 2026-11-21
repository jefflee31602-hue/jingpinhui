import {
  CatalogDataset,
  CatalogItem,
  ColumnField,
  CurrencyCode,
  Language,
} from '../types/quote';
import {
  detectColumnMapping,
  normalizeHeader,
  parsePriceCell,
} from './excelParser';

function looksLikeImagePath(val: string): boolean {
  const s = val.trim().toLowerCase();
  if (!s) return false;
  return (
    s.startsWith('data:image/') ||
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('/') ||
    /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/.test(s)
  );
}

function cleanMultilineText(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) {
    const joined = val.map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ');
    return joined || undefined;
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.raw === 'string') {
      return cleanMultilineText(obj.raw);
    }
    const joined = Object.entries(obj)
      .filter(([k, v]) => k !== 'raw' && v !== undefined && v !== null && String(v).trim() !== '')
      .map(([k, v]) => `${k}: ${String(v).trim()}`)
      .join(' · ');
    return joined || undefined;
  }
  const str = String(val)
    .replace(/\s*\|\s*/g, ' ')
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ')
    .trim();
  if (!str || str === '/' || str === '-') return undefined;
  return str;
}

function cleanSkuText(val: unknown): string {
  return String(val ?? '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDividerOrEmptyRow(
  row: Record<string, unknown>,
  sku: string,
  factoryRaw: unknown,
  retailRaw: unknown,
  specRaw: unknown,
  materialRaw: unknown
): boolean {
  const hasPrice =
    (factoryRaw !== undefined && factoryRaw !== null && String(factoryRaw).trim() !== '') ||
    (retailRaw !== undefined && retailRaw !== null && String(retailRaw).trim() !== '');
  const hasSpec =
    (specRaw !== undefined && specRaw !== null && String(specRaw).trim() !== '') ||
    Boolean(row.parsed_specs && typeof row.parsed_specs === 'object') ||
    Boolean(row.description && typeof row.description === 'object');
  const hasMaterial =
    materialRaw !== undefined && materialRaw !== null && String(materialRaw).trim() !== '';

  if (!hasPrice && !hasSpec && !hasMaterial) {
    return true;
  }
  if (/报价表$|quotation$/i.test(sku) && !hasPrice) {
    return true;
  }
  return false;
}

function detectInlineHeaderMap(
  row: Record<string, unknown>
): Record<string, ColumnField> | null {
  const values = Object.values(row).map((v) => String(v ?? '').trim());
  const hasImgHeader = values.some((v) => v === '图片/名称' || v === 'Image / Name');
  const hasSkuHeader = values.some((v) => normalizeHeader(v) === '产品型号' || normalizeHeader(v) === 'model');
  const hasPriceHeader = values.some((v) => {
    const n = normalizeHeader(v);
    return n.includes('出厂单价') || n.includes('exwunitprice');
  });

  if (!hasImgHeader && !(hasSkuHeader && hasPriceHeader)) {
    return null;
  }

  const map: Record<string, ColumnField> = {};
  Object.entries(row).forEach(([key, rawLabel]) => {
    const label = String(rawLabel ?? '').trim();
    const detected = detectColumnMapping([label]);
    const matchedField = (Object.keys(detected) as ColumnField[])[0];
    if (matchedField) {
      map[key] = matchedField;
    }
  });
  return map;
}

function inferCurrency(
  obj: Record<string, unknown> | null,
  allRows: Record<string, unknown>[],
  lang: Language
): CurrencyCode {
  if (
    obj &&
    typeof obj.currency === 'string' &&
    ['CNY', 'USD', 'EUR', 'HKD'].includes(obj.currency.toUpperCase())
  ) {
    return obj.currency.toUpperCase() as CurrencyCode;
  }

  for (const row of allRows.slice(0, 15)) {
    for (const [k, v] of Object.entries(row)) {
      const upperK = k.toUpperCase();
      const strV = typeof v === 'string' ? v : '';
      if (upperK.includes('USD') || strV.includes('$')) {
        return 'USD';
      }
      if (upperK.includes('人民币') || strV.includes('¥') || strV.includes('￥')) {
        return 'CNY';
      }
    }
  }

  return lang === 'en' ? 'USD' : 'CNY';
}

/**
 * Parses JSON quotation catalogs exported from Excel — supporting both:
 * 1) Nested sectioned schema: { source_file, vendor_header, address_contact, sections: [{ section, items }], custom_pricing }
 * 2) Flat arrays / { items } / { data }
 */
export function parseRawJsonToCatalog(
  rawJson: unknown,
  lang: Language,
  fileName: string = lang === 'zh' ? 'quotes-zh.json' : 'quotes-en.json',
  isSample: boolean = false
): CatalogDataset {
  interface SectionGroup {
    sectionName: string;
    rows: Record<string, unknown>[];
  }

  const sectionGroups: SectionGroup[] = [];
  let topObj: Record<string, unknown> | null = null;

  if (Array.isArray(rawJson)) {
    const rows = rawJson.filter(
      (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
    );
    if (rows.length > 0) {
      sectionGroups.push({
        sectionName: lang === 'zh' ? 'LED 产品报价表' : 'LED Product Catalog',
        rows,
      });
    }
  } else if (rawJson && typeof rawJson === 'object') {
    topObj = rawJson as Record<string, unknown>;
    if (Array.isArray(topObj.sections)) {
      topObj.sections.forEach((sec) => {
        if (!sec || typeof sec !== 'object') return;
        const secObj = sec as Record<string, unknown>;
        const secName = String(
          secObj.section_title ||
            secObj.section ||
            (lang === 'zh' ? '产品系列' : 'Product Series')
        ).trim();
        const rawList = Array.isArray(secObj.products)
          ? secObj.products
          : Array.isArray(secObj.items)
          ? secObj.items
          : [];
        const rows = rawList.filter(
          (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
        );
        if (rows.length > 0) {
          sectionGroups.push({ sectionName: secName, rows });
        }
      });
    } else if (Array.isArray(topObj.products)) {
      const rows = topObj.products.filter(
        (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
      );
      if (rows.length > 0) {
        sectionGroups.push({
          sectionName: lang === 'zh' ? 'LED 产品报价表' : 'LED Product Catalog',
          rows,
        });
      }
    } else if (Array.isArray(topObj.items)) {
      const rows = topObj.items.filter(
        (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
      );
      if (rows.length > 0) {
        sectionGroups.push({
          sectionName: lang === 'zh' ? 'LED 产品报价表' : 'LED Product Catalog',
          rows,
        });
      }
    } else if (Array.isArray(topObj.data)) {
      const rows = topObj.data.filter(
        (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
      );
      if (rows.length > 0) {
        sectionGroups.push({
          sectionName: lang === 'zh' ? 'LED 产品报价表' : 'LED Product Catalog',
          rows,
        });
      }
    }
  }

  const allRawRows = sectionGroups.flatMap((g) => g.rows);
  if (allRawRows.length === 0) {
    throw new Error('JSON does not contain quotation items.');
  }

  const currency = inferCurrency(topObj, allRawRows, lang);
  const resolvedFileName =
    topObj && typeof topObj.source_file === 'string' && topObj.source_file.trim()
      ? topObj.source_file.trim()
      : fileName;

  const vendorHeader =
    topObj && typeof topObj.vendor_header === 'string' && topObj.vendor_header.trim()
      ? topObj.vendor_header.trim()
      : undefined;

  const addressContact =
    topObj && typeof topObj.address_contact === 'string' && topObj.address_contact.trim()
      ? topObj.address_contact.trim()
      : undefined;

  const customPricing: string[][] | undefined =
    topObj && Array.isArray(topObj.custom_pricing)
      ? topObj.custom_pricing
          .filter((row): row is unknown[] => Array.isArray(row))
          .map((row) => row.map((cell) => String(cell ?? '').trim()).filter(Boolean))
          .filter((row) => row.length > 0)
      : undefined;

  const items: CatalogItem[] = [];
  const categories = new Set<string>();
  let globalIdx = 0;

  sectionGroups.forEach((group) => {
    let activeInlineMap: Record<string, ColumnField> | null = null;

    group.rows.forEach((row) => {
      const maybeHeaderMap = detectInlineHeaderMap(row);
      if (maybeHeaderMap) {
        activeInlineMap = maybeHeaderMap;
        return; // Skip embedded header row and apply remap to subsequent shifted rows
      }

      // Build normalized key lookup for irregular Excel spacing/typos (e.g. "Mate rial", "Descripion", "产品 型号")
      const normMap = new Map<string, unknown>();
      Object.entries(row).forEach(([k, v]) => {
        if (k === 'parsed_specs') return;
        const nk = normalizeHeader(k);
        if (nk && !normMap.has(nk) && v !== undefined && v !== null && String(v).trim() !== '') {
          normMap.set(nk, v);
        }
      });

      const getFromInline = (field: ColumnField): unknown => {
        if (!activeInlineMap) return undefined;
        for (const [k, f] of Object.entries(activeInlineMap)) {
          if (f === field && row[k] !== undefined && String(row[k]).trim() !== '') {
            return row[k];
          }
        }
        // Handle subtle column shift in tail rows (K12-11 .. Y4-1) where col_6->col_7, col_12->col_13, price->col_19
        if (field === 'spec' && row['col_7'] !== undefined && String(row['col_7']).trim() !== '') {
          return row['col_7'];
        }
        if (field === 'individualBox' && row['col_13'] !== undefined && String(row['col_13']).trim() !== '') {
          return row['col_13'];
        }
        if (field === 'certifications' && row['col_19'] !== undefined && String(row['col_19']).trim() !== '') {
          return row['col_19'];
        }
        return undefined;
      };

      const pickVal = (field: ColumnField, normCandidates: string[], rawFallbackKeys?: string[]): unknown => {
        const inlineVal = getFromInline(field);
        if (inlineVal !== undefined) return inlineVal;

        // If an inline shifted header is active, avoid reading the hijacked key (e.g. 裸装纸箱信息 is now color, 出厂单价 is now certs)
        const hijackedKeys = activeInlineMap ? new Set(Object.keys(activeInlineMap)) : null;

        for (const [origKey, val] of Object.entries(row)) {
          if (origKey === 'parsed_specs') continue;
          if (hijackedKeys && hijackedKeys.has(origKey) && activeInlineMap![origKey] !== field) {
            continue;
          }
          const nk = normalizeHeader(origKey);
          if (
            normCandidates.some((cand) => nk === cand || nk.startsWith(cand)) &&
            val !== undefined &&
            val !== null &&
            String(val).trim() !== ''
          ) {
            return val;
          }
        }

        if (!activeInlineMap && rawFallbackKeys) {
          for (const rk of rawFallbackKeys) {
            if (row[rk] !== undefined && row[rk] !== null && String(row[rk]).trim() !== '') {
              return row[rk];
            }
          }
        }
        return undefined;
      };

      const skuRaw = pickVal('sku', ['产品型号', 'model', 'sku', '型号', 'code', 'itemno']);
      const nameOrImgRaw = pickVal('name', ['图片名称', 'imagename', '产品名称', '品名', 'productname', 'name', 'title']);
      const explicitNameRaw = pickVal('name', ['产品名称', '名称', 'productname', 'name']);
      const imageRaw = pickVal('imageUrl', ['商品图片', '产品图片', 'productimage', 'imageurl', 'image', 'img', 'photo', 'picture', '图片链接']);
      const specRaw = pickVal('spec', ['产品信息', 'productinfo', 'descripion', 'description', 'spec', 'specs', '规格', '规格参数']);
      const materialRaw = pickVal('material', ['材料', 'material', '材质', '面料']);
      const colorRaw = pickVal('color', ['颜色', 'color', 'colour']);
      const indivBoxRaw = pickVal('individualBox', ['独立纸箱信息', 'cartoninformation', 'individualcartoninfo', 'individualbox']);
      const bulkBoxRaw = pickVal('bulkBox', ['裸装纸箱信息', 'cartonwithoutouterpackaging', 'bulkcartoninfo', 'bulkbox'], ['col_12']);
      const certRaw = pickVal('certifications', ['认证', 'certification', 'certifications', 'certs']);
      const catRaw = pickVal('category', ['分类', '类别', 'category', 'series']);
      const unitRaw = pickVal('unit', ['单位', 'unit']);
      const factoryRaw = pickVal('unitPrice', ['出厂单价人民币', '出厂单价', 'exwunitpriceusd', 'exwunitprice', 'factoryunitprice', 'unitprice', 'factoryprice', 'price']);
      const retailRaw = pickVal('retailPrice', ['国内零售价格', 'retailpricelessthan10pcsusd', 'retailpricefororderslessthan10pcs', 'retailprice', '零售价'], ['col_15']);
      const packagingNoteRaw = row['packagingNote'] ?? row['包装说明'];
      const boxSurchargeRaw = row['boxSurcharge'];
      const retailThresholdRaw = row['retailThreshold'];
      const moqRaw = pickVal('moq', ['起订量', 'moq']);
      const leadRaw = pickVal('leadTime', ['交期', 'leadtime']);
      const notesRaw = pickVal('notes', ['备注', 'notes', 'note']);

      const cleanSku = cleanSkuText(skuRaw);
      if (isDividerOrEmptyRow(row, cleanSku, factoryRaw, retailRaw, specRaw, materialRaw)) {
        return;
      }

      globalIdx += 1;
      const sku =
        cleanSku ||
        (lang === 'zh' ? `无标型号-${globalIdx}` : `MODEL-${globalIdx}`);

      let resolvedName = '';
      let resolvedImage = imageRaw ? String(imageRaw).trim() : '';

      if (nameOrImgRaw && typeof nameOrImgRaw === 'object') {
        const obj = nameOrImgRaw as Record<string, unknown>;
        resolvedName = String(obj.name || obj.title || obj.label || '').trim();
        if (!resolvedImage) {
          resolvedImage = String(obj.image || obj.imageUrl || obj.url || obj.src || '').trim();
        }
      } else if (nameOrImgRaw !== undefined && nameOrImgRaw !== null) {
        const str = String(nameOrImgRaw).replace(/\s+/g, ' ').trim();
        if (looksLikeImagePath(str)) {
          if (!resolvedImage) resolvedImage = str;
        } else {
          resolvedName = str;
        }
      }

      if (!resolvedName && explicitNameRaw && !activeInlineMap) {
        resolvedName = String(explicitNameRaw).replace(/\s+/g, ' ').trim();
      }
      if (!resolvedName) {
        resolvedName = sku;
      }

      const factoryParsed = parsePriceCell(
        typeof factoryRaw === 'number' || typeof factoryRaw === 'string' ? factoryRaw : undefined
      );
      const retailParsed = parsePriceCell(
        typeof retailRaw === 'number' || typeof retailRaw === 'string' ? retailRaw : undefined
      );

      // Build clean parsedSpecs if present
      let parsedSpecs: Record<string, string> | undefined;
      if (row.parsed_specs && typeof row.parsed_specs === 'object') {
        const entries: [string, string][] = [];
        Object.entries(row.parsed_specs as Record<string, unknown>).forEach(([pk, pv]) => {
          if (pk === 'raw' || pv === undefined || pv === null) return;
          const s = String(pv).replace(/\s+/g, ' ').trim();
          if (s) entries.push([pk, s]);
        });
        if (entries.length > 0) {
          parsedSpecs = Object.fromEntries(entries);
        }
      }

      const category = String(
        catRaw || group.sectionName || (lang === 'zh' ? 'LED 智能产品' : 'LED Smart Products')
      ).trim();
      categories.add(category);

      const cleanSpec =
        cleanMultilineText(specRaw) ||
        (parsedSpecs
          ? Object.values(parsedSpecs).join(' · ')
          : '');

      const resolvedMoq = moqRaw
        ? Math.max(1, Number(moqRaw) || 1)
        : factoryParsed.moq ?? 1;

      items.push({
        id: `${lang}-json-${globalIdx}-${sku.replace(/\s+/g, '')}`,
        sku,
        name: resolvedName,
        spec: cleanSpec,
        material: cleanMultilineText(materialRaw),
        color: cleanMultilineText(colorRaw),
        individualBox: cleanMultilineText(indivBoxRaw),
        bulkBox: cleanMultilineText(bulkBoxRaw),
        certifications: cleanMultilineText(certRaw),
        category,
        unit: String(unitRaw || (lang === 'zh' ? '个' : 'pcs')).trim(),
        unitPrice: factoryParsed.value || retailParsed.value,
        retailPrice: retailParsed.value > 0 ? retailParsed.value : undefined,
        retailThreshold:
          typeof retailThresholdRaw === 'number'
            ? retailThresholdRaw
            : retailParsed.value > 0
            ? 10
            : undefined,
        boxSurcharge:
          typeof boxSurchargeRaw === 'number'
            ? boxSurchargeRaw
            : factoryParsed.boxSurcharge,
        packagingNote: packagingNoteRaw
          ? String(packagingNoteRaw).trim()
          : factoryParsed.extraNote,
        imageUrl: resolvedImage || undefined,
        moq: resolvedMoq,
        leadTime: leadRaw ? String(leadRaw).trim() : undefined,
        notes: notesRaw ? String(notesRaw).trim() : undefined,
        sheetName: group.sectionName,
        parsedSpecs,
      });
    });
  });

  if (items.length === 0) {
    throw new Error('No valid quotation rows parsed from JSON.');
  }

  return {
    lang,
    fileName: resolvedFileName,
    importedAt: new Date().toISOString().slice(0, 10),
    currency,
    items,
    sheetNames: Array.from(categories),
    isSample,
    vendorHeader,
    addressContact,
    customPricing,
  };
}

export function exportCatalogToJson(dataset: CatalogDataset): void {
  const isZh = dataset.lang === 'zh';
  const sym = dataset.currency === 'USD' ? '$' : '¥';
  const rows = dataset.items.map((item) =>
    isZh
      ? {
          产品型号: item.sku,
          '图片/名称': item.name,
          商品图片: item.imageUrl || '',
          材料: item.material || '',
          产品信息: item.spec.replace(/\s*·\s*/g, '\n'),
          颜色: item.color || '',
          独立纸箱信息: (item.individualBox || '').replace(/\s*·\s*/g, '\n'),
          裸装纸箱信息: (item.bulkBox || '').replace(/\s*·\s*/g, '\n'),
          '国内零售价格（10PCS以下）（人民币）':
            item.retailPrice !== undefined ? `${item.retailPrice}${sym}` : '',
          '出厂单价（人民币）': item.packagingNote
            ? `（${item.unitPrice}${sym}）${item.packagingNote}`
            : `${item.unitPrice}${sym}`,
          认证: (item.certifications || '').replace(/\s*·\s*/g, '\n'),
        }
      : {
          Model: item.sku,
          'Image / Name': item.name,
          'Product Image': item.imageUrl || '',
          Material: item.material || '',
          Descripion: item.spec.replace(/\s*·\s*/g, '\n'),
          Color: item.color || '',
          'Carton information': (item.individualBox || '').replace(/\s*·\s*/g, '\n'),
          'Carton without outer packaging': (item.bulkBox || '').replace(/\s*·\s*/g, '\n'),
          'Retail Price (For orders less than 10 PCS) (USD)':
            item.retailPrice !== undefined ? `${item.retailPrice}` : '',
          'EXW UNIT PRICE(USD)': item.packagingNote
            ? `(${sym}${item.unitPrice}) ${item.packagingNote}`
            : `(${sym}${item.unitPrice})`,
          certification: (item.certifications || '').replace(/\s*·\s*/g, '\n'),
        }
  );

  const blob = new Blob([JSON.stringify(rows, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = isZh ? 'quotes-zh.json' : 'quotes-en.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

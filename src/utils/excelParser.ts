import * as XLSX from 'xlsx';
import {
  CatalogDataset,
  CatalogItem,
  ClientInfo,
  ColumnField,
  ColumnMapping,
  CompanyProfile,
  CurrencyCode,
  Language,
  QuoteLineItem,
  QuoteSettings,
} from '../types/quote';

export interface ParsedExcelPreview {
  fileName: string;
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  rows: Record<string, string>[];
  mapping: ColumnMapping;
  allSheetRows: Array<{ sheetName: string; headers: string[]; rows: Record<string, string>[] }>;
}

const FIELD_KEYWORDS: Record<ColumnField, string[]> = {
  sku: [
    '产品型号',
    '型号',
    'sku',
    'model',
    'code',
    'partno',
    'partnumber',
    'itemno',
    'itemcode',
    '编码',
    '编号',
    '货号',
    '物料号',
    '料号',
  ],
  name: [
    '图片名称',
    '图片/名称',
    'imagename',
    '产品名称',
    '品名',
    '名称',
    '商品名称',
    'name',
    'product',
    'productname',
    'item',
    'itemname',
    'title',
  ],
  material: ['材料', '材质', '面料', 'material', 'fabric'],
  spec: [
    '产品信息',
    '规格参数',
    '规格',
    '参数',
    '型号规格',
    '配置',
    '技术参数',
    'spec',
    'specification',
    'specifications',
    'details',
    'productinfo',
    'description',
    'descripion',
  ],
  color: ['颜色', '色号', 'color', 'colour'],
  individualBox: [
    '独立纸箱信息',
    '独立纸箱',
    '独立箱规',
    '彩盒纸箱',
    'individualbox',
    'individualcarton',
    'individualcartoninfo',
    'cartoninformation',
    'giftboxcarton',
  ],
  bulkBox: [
    '裸装纸箱信息',
    '裸装纸箱',
    '裸装箱规',
    'bulkbox',
    'bulkcarton',
    'bulkcartoninfo',
    'cartonwithoutouterpackaging',
  ],
  retailPrice: [
    '国内零售价格10pcs以下人民币',
    '国内零售价格',
    '国内零售价',
    '零售价格',
    '零售价',
    '10pcs以下',
    'retailpricefororderslessthan10pcsusd',
    'retailpricefororderslessthan10pcs',
    'retailprice10pcs',
    'retailprice',
    'retail',
  ],
  unitPrice: [
    '出厂单价人民币',
    '出厂单价',
    '出厂价格',
    '出厂价',
    '批发单价',
    '单价',
    '价格',
    '含税单价',
    '未税单价',
    '报价',
    'exwunitpriceusd',
    'exwunitprice',
    'factoryunitprice',
    'factoryprice',
    'unitprice',
    'price',
    'rate',
    'cost',
  ],
  certifications: ['认证', '资质认证', '证书', 'certification', 'certifications', 'certs'],
  category: ['类别', '分类', '品类', '系列', '大类', 'category', 'group', 'type', 'series'],
  unit: ['单位', '计量单位', '计价单位', 'unit', 'uom'],
  moq: ['起订量', '最小起订量', '最低起订', 'moq', 'minqty', 'minimum'],
  leadTime: ['交期', '货期', '交货期', '交货周期', 'leadtime', 'delivery'],
  notes: ['备注', '说明', '注释', 'notes', 'note', 'remark', 'remarks'],
  imageUrl: [
    '商品图片',
    '产品图片',
    '图片链接',
    '图片url',
    '主图',
    'productimage',
    'image',
    'imageurl',
    'photo',
  ],
};

export function normalizeHeader(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[\s_\-()（）/\\:：[\]、，,]+/g, '');
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const usedHeaders = new Set<string>();

  const fieldOrder: ColumnField[] = [
    'sku',
    'name',
    'material',
    'spec',
    'color',
    'individualBox',
    'bulkBox',
    'retailPrice',
    'unitPrice',
    'certifications',
    'category',
    'unit',
    'moq',
    'leadTime',
    'notes',
    'imageUrl',
  ];

  // First pass: exact normalized match
  for (const field of fieldOrder) {
    const keywords = FIELD_KEYWORDS[field];
    for (const h of headers) {
      if (usedHeaders.has(h)) continue;
      const norm = normalizeHeader(h);
      if (keywords.some((kw) => norm === normalizeHeader(kw))) {
        mapping[field] = h;
        usedHeaders.add(h);
        break;
      }
    }
  }

  // Second pass: substring contains match
  for (const field of fieldOrder) {
    if (mapping[field]) continue;
    const keywords = FIELD_KEYWORDS[field];
    for (const h of headers) {
      if (usedHeaders.has(h)) continue;
      const norm = normalizeHeader(h);
      if (!norm) continue;
      if (
        keywords.some((kw) => {
          const nkw = normalizeHeader(kw);
          return norm.includes(nkw) || nkw.includes(norm);
        })
      ) {
        mapping[field] = h;
        usedHeaders.add(h);
        break;
      }
    }
  }

  return mapping;
}

/**
 * Extracts primary numeric price, optional MOQ, packaging note, and carton surcharge
 * from real B2B cells like:
 * - "(175¥) 纺布包装 无独立纸箱 需要独立纸箱+4 元" -> value: 175, boxSurcharge: 4
 * - "MOQ:500 (285￥) 无纺布包装..." -> value: 285, moq: 500
 * - "（$11.4) Non-woven pack, no carton. + $0.5for carton." -> value: 11.4, boxSurcharge: 0.5
 * - "70¥ 12V+4 元" -> value: 70
 */
export function parsePriceCell(raw: string | number | undefined): {
  value: number;
  extraNote?: string;
  boxSurcharge?: number;
  moq?: number;
} {
  if (typeof raw === 'number') {
    return { value: Number.isFinite(raw) ? raw : 0 };
  }
  const text = String(raw || '').trim();
  if (!text) return { value: 0 };

  const cleanCommas = text.replace(/,/g, '');

  // Extract MOQ if embedded in price cell, e.g., "MOQ:500 (285￥)" or "MOQ: 300PCS"
  const moqMatch = cleanCommas.match(/\bMOQ\s*[:：]?\s*(\d+)\s*(?:PCS)?/i);
  const moq = moqMatch ? Math.max(1, parseInt(moqMatch[1], 10)) : undefined;

  // Priority 1: Parenthesized price with optional currency symbol e.g. "(285￥)", "（$11.4)"
  const parenPriceMatch = cleanCommas.match(
    /[（(]\s*[$¥￥€£]?\s*(\d+(?:\.\d+)?)\s*[$¥￥€£]?\s*[)）]/
  );
  // Priority 2: Explicit currency-tagged number e.g. "298¥", "$11.4", "85 ¥"
  const currencyPrefixMatch = cleanCommas.match(/[$€£]\s*(\d+(?:\.\d+)?)/);
  const currencySuffixMatch = cleanCommas.match(/(\d+(?:\.\d+)?)\s*[¥￥]/);

  let value = 0;
  if (parenPriceMatch) {
    value = parseFloat(parenPriceMatch[1]);
  } else if (currencyPrefixMatch) {
    value = parseFloat(currencyPrefixMatch[1]);
  } else if (currencySuffixMatch) {
    value = parseFloat(currencySuffixMatch[1]);
  } else {
    const withoutMoq = cleanCommas.replace(/\bMOQ\s*[:：]?\s*\d+\s*(?:PCS)?/gi, '');
    const fallbackMatch = withoutMoq.match(/(\d+(?:\.\d+)?)/);
    value = fallbackMatch ? parseFloat(fallbackMatch[1]) : 0;
  }

  // Detect "+4 元", "+3.5 元", or "+ $0.5for carton" box surcharge
  const cnSurcharge = cleanCommas.match(/纸\s*箱\s*[+＋]\s*(\d+(?:\.\d+)?)/);
  const enSurcharge = cleanCommas.match(
    /[+＋]\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:for\s*)?(?:carton|box)/i
  );
  const boxSurcharge = cnSurcharge
    ? parseFloat(cnSurcharge[1])
    : enSurcharge
    ? parseFloat(enSurcharge[1])
    : undefined;

  // Strip MOQ token & primary price token to isolate clean packaging/variant note
  const stripped = text
    .replace(/\bMOQ\s*[:：]?\s*\d+\s*(?:PCS)?/gi, '')
    .replace(/[（(]\s*[$¥￥€£]?\s*\d+(?:[.,]\d+)?\s*[$¥￥€£]?\s*[)）]/, '')
    .replace(/^\s*[$€£]?\s*\d+(?:[.,]\d+)?\s*[¥￥$€£元]*\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    value: Number.isFinite(value) ? value : 0,
    extraNote: stripped.length > 1 ? stripped : undefined,
    boxSurcharge,
    moq,
  };
}

function parseSimpleNumber(raw: string | number | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const match = String(raw || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function findHeaderRowIndex(matrix: unknown[][]): number {
  let bestIdx = 0;
  let bestScore = -1;

  const limit = Math.min(matrix.length, 20);
  const allKeywords = Object.values(FIELD_KEYWORDS)
    .flat()
    .map((kw) => normalizeHeader(kw));

  for (let i = 0; i < limit; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    const nonEmptyCells = row.filter((cell) => String(cell ?? '').trim().length > 0);
    if (nonEmptyCells.length < 2) continue;

    let keywordHits = 0;
    for (const cell of nonEmptyCells) {
      const norm = normalizeHeader(String(cell));
      if (norm && allKeywords.some((kw) => norm === kw || norm.includes(kw))) {
        keywordHits += 2;
      }
    }

    const score = keywordHits * 3 + nonEmptyCells.length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

export async function parseExcelFilePreview(file: File): Promise<ParsedExcelPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const allSheetRows: Array<{ sheetName: string; headers: string[]; rows: Record<string, string>[] }> = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (!matrix || matrix.length < 2) continue;

    const headerIdx = findHeaderRowIndex(matrix);
    const rawHeaderRow = matrix[headerIdx] || [];

    const headers: string[] = [];
    const seen = new Map<string, number>();

    rawHeaderRow.forEach((cell, idx) => {
      let label = String(cell ?? '').replace(/\s+/g, ' ').trim();
      if (!label) label = `Column_${idx + 1}`;
      const count = seen.get(label) || 0;
      seen.set(label, count + 1);
      headers.push(count > 0 ? `${label} (${count + 1})` : label);
    });

    const rows: Record<string, string>[] = [];
    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const rowArr = matrix[r];
      if (!Array.isArray(rowArr)) continue;
      const hasAnyValue = rowArr.some((c) => String(c ?? '').trim() !== '');
      if (!hasAnyValue) continue;

      const record: Record<string, string> = {};
      headers.forEach((h, cIdx) => {
        record[h] = String(rowArr[cIdx] ?? '').trim();
      });
      rows.push(record);
    }

    if (rows.length > 0) {
      allSheetRows.push({ sheetName, headers, rows });
    }
  }

  if (allSheetRows.length === 0) {
    throw new Error('No tabular rows found in Excel workbook.');
  }

  const firstSheet = allSheetRows[0];
  const mapping = detectColumnMapping(firstSheet.headers);

  return {
    fileName: file.name,
    sheetNames: allSheetRows.map((s) => s.sheetName),
    selectedSheet: '__ALL__',
    headers: firstSheet.headers,
    rows: firstSheet.rows,
    mapping,
    allSheetRows,
  };
}

export function buildCatalogFromPreview(
  preview: ParsedExcelPreview,
  mapping: ColumnMapping,
  lang: Language,
  currency: CurrencyCode,
  sheetFilter: string = '__ALL__'
): CatalogDataset {
  const items: CatalogItem[] = [];
  const targetSheets =
    sheetFilter === '__ALL__'
      ? preview.allSheetRows
      : preview.allSheetRows.filter((s) => s.sheetName === sheetFilter);

  targetSheets.forEach((sheetData, sIdx) => {
    const effectiveMapping =
      sheetFilter === '__ALL__' && sIdx > 0
        ? { ...detectColumnMapping(sheetData.headers), ...mapping }
        : mapping;

    sheetData.rows.forEach((row, rIdx) => {
      const rawName = effectiveMapping.name ? row[effectiveMapping.name] : '';
      const skuVal = effectiveMapping.sku ? row[effectiveMapping.sku] : '';
      const rawFactoryPrice = effectiveMapping.unitPrice ? row[effectiveMapping.unitPrice] : '';
      const rawRetailPrice = effectiveMapping.retailPrice ? row[effectiveMapping.retailPrice] : '';

      const cleanName = (rawName || '').replace(/\s+/g, ' ').trim();
      const cleanSku = (skuVal || '').replace(/\s+/g, ' ').trim();
      if (!cleanName && !cleanSku) return;
      if (/^(total|subtotal|合计|总计|小计)$/i.test(cleanName)) return;

      const factoryParsed = parsePriceCell(rawFactoryPrice);
      const retailParsed = parsePriceCell(rawRetailPrice);

      const specRaw = effectiveMapping.spec ? row[effectiveMapping.spec] : '';
      const cleanSpec = specRaw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' · ');

      const materialVal = effectiveMapping.material
        ? row[effectiveMapping.material]?.replace(/\s+/g, ' ').trim()
        : undefined;
      const colorVal = effectiveMapping.color
        ? row[effectiveMapping.color]?.replace(/\s+/g, ' ').trim()
        : undefined;
      const individualBoxVal = effectiveMapping.individualBox
        ? row[effectiveMapping.individualBox]?.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(' · ')
        : undefined;
      const bulkBoxVal = effectiveMapping.bulkBox
        ? row[effectiveMapping.bulkBox]?.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(' · ')
        : undefined;
      const certVal = effectiveMapping.certifications
        ? row[effectiveMapping.certifications]?.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(' · ')
        : undefined;

      const categoryVal = effectiveMapping.category ? row[effectiveMapping.category] : '';
      const unitVal = effectiveMapping.unit ? row[effectiveMapping.unit] : '';
      const moqRaw = effectiveMapping.moq ? row[effectiveMapping.moq] : '';
      const leadVal = effectiveMapping.leadTime ? row[effectiveMapping.leadTime] : '';
      const notesVal = effectiveMapping.notes ? row[effectiveMapping.notes] : '';
      const imageVal = effectiveMapping.imageUrl ? row[effectiveMapping.imageUrl] : '';

      const fallbackCategory =
        sheetData.sheetName || (lang === 'zh' ? '常规产品' : 'General');

      const displayName =
        cleanName || (cleanSku ? (lang === 'zh' ? `产品 ${cleanSku}` : `Model ${cleanSku}`) : '');

      items.push({
        id: `${lang}-${sIdx}-${rIdx}-${Date.now()}`,
        sku: cleanSku || `ITEM-${String(items.length + 1).padStart(3, '0')}`,
        name: displayName,
        spec: cleanSpec,
        material: materialVal || undefined,
        color: colorVal || undefined,
        individualBox: individualBoxVal || undefined,
        bulkBox: bulkBoxVal || undefined,
        certifications: certVal || undefined,
        category: categoryVal || fallbackCategory,
        unit: unitVal || (lang === 'zh' ? '个' : 'pcs'),
        unitPrice: factoryParsed.value || retailParsed.value,
        retailPrice: retailParsed.value > 0 ? retailParsed.value : undefined,
        retailThreshold: retailParsed.value > 0 ? 10 : undefined,
        packagingNote: factoryParsed.extraNote,
        boxSurcharge: factoryParsed.boxSurcharge,
        imageUrl: imageVal || undefined,
        moq: moqRaw ? Math.max(1, Math.round(parseSimpleNumber(moqRaw))) : factoryParsed.moq,
        leadTime: leadVal || undefined,
        notes: notesVal || undefined,
        sheetName: sheetData.sheetName,
      });
    });
  });

  return {
    lang,
    fileName: preview.fileName,
    importedAt: new Date().toISOString().slice(0, 10),
    currency,
    items,
    sheetNames: preview.sheetNames,
    rawHeaders: preview.headers,
    isSample: false,
  };
}

export function downloadCatalogTemplate(dataset: CatalogDataset, lang: Language): void {
  const isZh = lang === 'zh';
  const rows = dataset.items.map((item) =>
    isZh
      ? {
          产品型号: item.sku,
          '图片/名称': item.name,
          材料: item.material ?? '',
          产品信息: item.spec,
          颜色: item.color ?? '',
          独立纸箱信息: item.individualBox ?? '',
          裸装纸箱信息: item.bulkBox ?? '',
          '国内零售价格（10PCS以下）（人民币）': item.retailPrice ?? '',
          '出厂单价（人民币）': item.packagingNote
            ? `(${item.unitPrice}¥) ${item.packagingNote}`
            : item.unitPrice,
          认证: item.certifications ?? '',
        }
      : {
          'Model / SKU': item.sku,
          'Product Name': item.name,
          Material: item.material ?? '',
          'Product Info / Specs': item.spec,
          Color: item.color ?? '',
          'Individual Carton': item.individualBox ?? '',
          'Bulk Carton': item.bulkBox ?? '',
          'Retail Price (<10PCS)': item.retailPrice ?? '',
          'Factory Unit Price': item.packagingNote
            ? `(${item.unitPrice}) ${item.packagingNote}`
            : item.unitPrice,
          Certifications: item.certifications ?? '',
        }
  );

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, isZh ? '报价表' : 'Price List');
  const filename = isZh ? '中文报价单模板.xlsx' : 'English_Quotation_Template.xlsx';
  XLSX.writeFile(workbook, filename);
}

export function exportConfiguredQuoteExcel(params: {
  lang: Language;
  company: CompanyProfile;
  client: ClientInfo;
  settings: QuoteSettings;
  lines: QuoteLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
}): void {
  const { lang, company, client, settings, lines, subtotal, discountAmount, taxAmount, grandTotal } = params;
  const isZh = lang === 'zh';

  const headerRows = [
    [isZh ? company.nameZh : company.nameEn],
    [
      isZh
        ? `地址：${company.addressZh} | 联系人：${company.contactPersonZh} | 电话：${company.phone}`
        : `Address: ${company.addressEn} | Contact: ${company.contactPersonEn} | Tel: ${company.phone}`,
    ],
    [
      isZh ? '报价单号:' : 'Quote No:',
      settings.quoteNumber,
      isZh ? '报价日期:' : 'Issue Date:',
      settings.issueDate,
    ],
    [
      isZh ? '客户公司:' : 'Client:',
      client.companyName || '-',
      isZh ? '客户联系人:' : 'Attention:',
      client.contactName || '-',
    ],
    [],
    isZh
      ? ['序号', '产品型号', '产品名称', '材料/颜色', '规格与认证', '单位', '数量', '单价', '小计']
      : ['#', 'Model / SKU', 'Product Name', 'Material / Color', 'Specs & Certs', 'Unit', 'Qty', 'Unit Price', 'Amount'],
  ];

  const itemRows = lines.map((line, i) => [
    i + 1,
    line.sku,
    line.name,
    [line.material, line.color].filter(Boolean).join(' / ') || '-',
    [line.spec, line.certifications].filter(Boolean).join(' | '),
    line.unit,
    line.quantity,
    line.unitPrice,
    Number((line.unitPrice * line.quantity).toFixed(2)),
  ]);

  const summaryRows = [
    [],
    ['', '', '', '', '', '', '', isZh ? '商品小计' : 'Subtotal', Number(subtotal.toFixed(2))],
    ['', '', '', '', '', '', '', isZh ? '折扣减免' : 'Discount', Number((-discountAmount).toFixed(2))],
    ['', '', '', '', '', '', '', isZh ? `税费 (${settings.taxRate}%)` : `Tax (${settings.taxRate}%)`, Number(taxAmount.toFixed(2))],
    ['', '', '', '', '', '', '', isZh ? '运费' : 'Shipping', Number(settings.shippingFee.toFixed(2))],
    ['', '', '', '', '', '', '', isZh ? `总计 (${settings.currency})` : `Grand Total (${settings.currency})`, Number(grandTotal.toFixed(2))],
  ];

  const aoa = [...headerRows, ...itemRows, ...summaryRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 26 },
    { wch: 18 },
    { wch: 38 },
    { wch: 8 },
    { wch: 8 },
    { wch: 12 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, isZh ? '报价明细' : 'Quotation');
  XLSX.writeFile(wb, `${settings.quoteNumber}_${lang.toUpperCase()}.xlsx`);
}

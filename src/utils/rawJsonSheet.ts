import { CatalogDataset, ColumnField, Language } from '../types/quote';
import { detectColumnMapping, normalizeHeader } from './excelParser';

export interface RawTableColumn {
  key: string;
  label: string;
  role: 'sku' | 'material' | 'spec' | 'color' | 'box' | 'retail' | 'factory' | 'cert' | 'other';
}

export interface RawTableBlock {
  id: string;
  sectionTitle: string;
  columns: RawTableColumn[];
  rows: Array<Record<string, string>>;
}

export interface RawQuotationDoc {
  lang: Language;
  fileName: string;
  vendorHeader?: string;
  addressContact?: string;
  tables: RawTableBlock[];
  customPricing?: string[][];
}

const STRUCTURED_LABEL_MAP: Record<string, string> = {
  model: 'Model',
  material: 'Material',
  description: 'Description',
  color: 'Color',
  carton_information: 'Carton information',
  carton_without_outer_packaging: 'Carton without outer packaging',
  retail_price_less_than_10pcs_usd: 'Retail Price (<10 PCS) (USD)',
  exw_unit_price_usd: 'EXW UNIT PRICE (USD)',
  certification: 'Certification',
};

function cleanDisplayLabel(rawKey: string): string {
  const mapped = STRUCTURED_LABEL_MAP[rawKey];
  if (mapped) return mapped;

  // Collapse awkward PDF/Excel wrap spaces inside Chinese or single words while keeping natural spacing
  return rawKey
    .replace(/\s+/g, ' ')
    .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
    .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
    .replace(/Carton informatio n/gi, 'Carton information')
    .replace(/Mate rial/gi, 'Material')
    .replace(/certifica\s*tion/gi, 'certification')
    .replace(/certificat\s*ion/gi, 'certification')
    .trim();
}

function inferRole(keyOrLabel: string): RawTableColumn['role'] {
  const n = normalizeHeader(keyOrLabel);
  if (n.includes('型号') || n === 'model' || n === 'sku') return 'sku';
  if (n.includes('材料') || n.includes('material')) return 'material';
  if (n.includes('产品信息') || n.includes('descrip') || n.includes('spec')) return 'spec';
  if (n.includes('颜色') || n.includes('color')) return 'color';
  if (n.includes('纸箱') || n.includes('carton') || n.includes('box')) return 'box';
  if (n.includes('零售') || n.includes('retail')) return 'retail';
  if (n.includes('出厂单价') || n.includes('exwunitprice') || n.includes('unitprice')) return 'factory';
  if (n.includes('认证') || n.includes('cert')) return 'cert';
  return 'other';
}

function formatRawCellValue(key: string, val: unknown): string {
  if (val === undefined || val === null) return '';

  if (Array.isArray(val)) {
    return val
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .join(' ');
  }

  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.raw === 'string' && obj.raw.trim()) {
      return obj.raw.replace(/\s*\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return Object.entries(obj)
      .filter(([k, v]) => k !== 'raw' && v !== undefined && v !== null && String(v).trim() !== '')
      .map(([k, v]) => `${k}: ${String(v).trim()}`)
      .join(' · ');
  }

  if (typeof val === 'number') {
    if (/usd/i.test(key)) {
      return `$${val}`;
    }
    return String(val);
  }

  return String(val)
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDividerRow(row: Record<string, unknown>): boolean {
  const entries = Object.entries(row).filter(([k]) => k !== 'parsed_specs' && k !== 'row');
  if (entries.length === 0) return true;
  if (entries.length === 1) {
    const val = String(entries[0][1] ?? '').trim();
    if (/报价表$|quotation$/i.test(val) || !val) return true;
  }
  const hasPriceOrSpec = entries.some(([k, v]) => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'object') return true;
    const s = String(v).trim();
    if (!s) return false;
    const n = normalizeHeader(k);
    return (
      n.includes('单价') ||
      n.includes('price') ||
      n.includes('信息') ||
      n.includes('descrip') ||
      n.includes('材料') ||
      n.includes('material') ||
      k.startsWith('col_')
    );
  });
  return !hasPriceOrSpec && !row.parsed_specs && !row.description;
}

function detectInlineHeaderMap(
  row: Record<string, unknown>
): Record<string, { label: string; field?: ColumnField }> | null {
  const values = Object.values(row).map((v) => String(v ?? '').trim());
  const hasImgHeader = values.some((v) => v === '图片/名称' || v === 'Image / Name');
  const hasSkuHeader = values.some(
    (v) => normalizeHeader(v) === '产品型号' || normalizeHeader(v) === 'model'
  );
  const hasPriceHeader = values.some((v) => {
    const n = normalizeHeader(v);
    return n.includes('出厂单价') || n.includes('exwunitprice');
  });

  if (!hasImgHeader && !(hasSkuHeader && hasPriceHeader)) {
    return null;
  }

  const map: Record<string, { label: string; field?: ColumnField }> = {};
  Object.entries(row).forEach(([key, rawVal]) => {
    const label = cleanDisplayLabel(String(rawVal ?? ''));
    if (!label || label === '图片/名称' || label === 'Image / Name') return;
    const detected = detectColumnMapping([label]);
    const field = (Object.keys(detected) as ColumnField[])[0];
    map[key] = { label, field };
  });
  return map;
}

/**
 * Converts the user's raw JSON (with sections[], custom_pricing[][], etc.)
 * directly into structured table blocks aligned to the exact Excel/JSON column headers.
 */
export function buildRawQuotationDoc(
  rawJson: unknown,
  lang: Language,
  fallbackFileName: string
): RawQuotationDoc {
  if (!rawJson || typeof rawJson !== 'object') {
    throw new Error('Invalid JSON structure.');
  }

  // Array root fallback
  if (Array.isArray(rawJson)) {
    const rows = rawJson.filter(
      (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
    );
    const keys = Array.from(
      new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== 'parsed_specs')))
    );
    const columns: RawTableColumn[] = keys.map((k) => ({
      key: k,
      label: cleanDisplayLabel(k),
      role: inferRole(k),
    }));
    return {
      lang,
      fileName: fallbackFileName,
      tables: [
        {
          id: `${lang}-sec-0`,
          sectionTitle: lang === 'zh' ? '产品报价表' : 'Product Quotation',
          columns,
          rows: rows.map((r) => {
            const out: Record<string, string> = {};
            columns.forEach((c) => {
              out[c.key] = String(r[c.key] ?? '').trim();
            });
            return out;
          }),
        },
      ],
    };
  }

  const obj = rawJson as Record<string, unknown>;
  const fileName =
    typeof obj.source_file === 'string' && obj.source_file.trim()
      ? obj.source_file.trim()
      : fallbackFileName;
  const rawSections: Array<{
    section: string;
    supplier?: Record<string, unknown>;
    items: Record<string, unknown>[];
  }> = Array.isArray(obj.sections)
    ? obj.sections
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .map((s) => ({
          section: String(
            s.section_title || s.section || (lang === 'zh' ? '产品报价' : 'Quotation')
          ).trim(),
          supplier:
            s.supplier && typeof s.supplier === 'object'
              ? (s.supplier as Record<string, unknown>)
              : undefined,
          items: Array.isArray(s.products)
            ? s.products.filter(
                (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
              )
            : Array.isArray(s.items)
            ? s.items.filter(
                (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
              )
            : [],
        }))
    : [
        {
          section: lang === 'zh' ? '产品报价' : 'Quotation',
          items: Array.isArray(obj.products)
            ? obj.products.filter(
                (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
              )
            : Array.isArray(obj.items)
            ? obj.items.filter(
                (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
              )
            : Array.isArray(obj.data)
            ? obj.data.filter(
                (r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')
              )
            : [],
        },
      ];

  const firstSupplier = rawSections.find((s) => s.supplier)?.supplier;
  const vendorHeader =
    typeof obj.vendor_header === 'string' && obj.vendor_header.trim()
      ? obj.vendor_header.trim()
      : firstSupplier && typeof firstSupplier.company === 'string' && firstSupplier.company.trim()
      ? firstSupplier.company.trim()
      : undefined;
  const addressContact =
    typeof obj.address_contact === 'string' && obj.address_contact.trim()
      ? obj.address_contact.trim()
      : firstSupplier
      ? [
          firstSupplier.address ? `Address: ${String(firstSupplier.address).trim()}` : '',
          firstSupplier.contact ? `Contact: ${String(firstSupplier.contact).trim()}` : '',
          firstSupplier.phone ? `Phone: ${String(firstSupplier.phone).trim()}` : '',
        ]
          .filter(Boolean)
          .join(' ') || undefined
      : undefined;

  let customPricing: string[][] | undefined = Array.isArray(obj.custom_pricing)
    ? obj.custom_pricing
        .filter((r): r is unknown[] => Array.isArray(r))
        .map((r) => r.map((c) => String(c ?? '').trim()).filter(Boolean))
        .filter((r) => r.length > 0)
    : undefined;

  if (!customPricing && obj.custom_extra_pricing && typeof obj.custom_extra_pricing === 'object') {
    const cep = obj.custom_extra_pricing as Record<string, unknown>;
    const rows: string[][] = [
      ['Custom extra pricing', 'Category', 'Option / Scope', 'Rate (USD)'],
    ];
    if (cep.custom_logo && typeof cep.custom_logo === 'object') {
      const logo = cep.custom_logo as Record<string, unknown>;
      if (logo.crystal_label_usd_per_pcs !== undefined) {
        rows.push([
          'Custom logo',
          'Crystal label',
          'Per pcs',
          `$${String(logo.crystal_label_usd_per_pcs)}/pcs`,
        ]);
      }
      if (logo.printed_label !== undefined) {
        rows.push(['Custom logo', 'Printed label', 'Standard', String(logo.printed_label)]);
      }
    }
    if (cep.custom_color_box && typeof cep.custom_color_box === 'object') {
      const box = cep.custom_color_box as Record<string, unknown>;
      const SCOPE_LABELS: Record<string, string> = {
        hard_bag_soft_bag_side_bag_luggage: 'Hard Bag / Soft Bag / Side Bag / Luggage',
        thigh_bag_shoulder_bag_hat_scooter_screen_helmet_tail_light:
          'Thigh Bag / Shoulder Bag / Hat / Scooter / Screen / Helmet / Tail Light',
      };
      Object.entries(box).forEach(([groupKey, groupVal]) => {
        if (!groupVal || typeof groupVal !== 'object') return;
        const scopeLabel = SCOPE_LABELS[groupKey] || groupKey.replace(/_/g, ' ');
        Object.entries(groupVal as Record<string, unknown>).forEach(([matKey, tiers]) => {
          const matLabel = matKey.replace(/_/g, ' ');
          const tierStr = Array.isArray(tiers)
            ? tiers.map((t) => String(t)).join(' · ')
            : String(tiers ?? '');
          rows.push(['Custom color box', matLabel, scopeLabel, tierStr]);
        });
      });
    }
    if (rows.length > 1) {
      customPricing = rows;
    }
  }

  const tables: RawTableBlock[] = [];

  rawSections.forEach((sec, sIdx) => {
    // Split a section whenever an inline shifted table header row appears
    let currentInlineMap: Record<string, { label: string; field?: ColumnField }> | null = null;
    let bucketRows: Array<{
      row: Record<string, unknown>;
      inlineMap: Record<string, { label: string; field?: ColumnField }> | null;
    }> = [];
    let subIdx = 0;

    const flushBucket = () => {
      if (bucketRows.length === 0) return;

      const sampleInline = bucketRows[0].inlineMap;
      if (sampleInline) {
        // Build columns strictly from the inline header row labels
        const orderedCols: RawTableColumn[] = [];
        const seenLabels = new Set<string>();
        Object.entries(sampleInline).forEach(([origKey, info]) => {
          if (seenLabels.has(info.label)) return;
          seenLabels.add(info.label);
          orderedCols.push({
            key: origKey,
            label: info.label,
            role: inferRole(info.label),
          });
        });

        const formattedRows = bucketRows.map(({ row }) => {
          const out: Record<string, string> = {};
          orderedCols.forEach((col) => {
            let val = row[col.key];
            // Handle subtle Excel column merge shift in tail rows (K12-11 .. Y4-1)
            if ((val === undefined || String(val).trim() === '') && col.key === 'col_6') {
              val = row['col_7'];
            } else if ((val === undefined || String(val).trim() === '') && col.key === 'col_12') {
              val = row['col_13'];
            } else if (
              (val === undefined || String(val).trim() === '') &&
              col.role === 'cert'
            ) {
              val = row['col_19'];
            }
            out[col.key] = String(val ?? '').trim();
          });
          return out;
        });

        tables.push({
          id: `${lang}-tbl-${sIdx}-${subIdx}`,
          sectionTitle:
            subIdx > 0
              ? `${sec.section} (${lang === 'zh' ? '车载/智能屏系列' : 'Series'})`
              : sec.section,
          columns: orderedCols,
          rows: formattedRows,
        });
      } else {
        // Normal section: deduplicate stray-space keys & map B3-2..SCT-4 col_12 / col_15 cleanly
        const canonicalOrder: Array<{ norm: string; label: string; role: RawTableColumn['role'] }> = [];
        const seenNorm = new Set<string>();

        bucketRows.forEach(({ row }) => {
          Object.keys(row).forEach((k) => {
            if (k === 'parsed_specs' || k === 'row' || k.startsWith('col_')) return;
            const norm = normalizeHeader(k);
            if (!norm || seenNorm.has(norm)) return;
            seenNorm.add(norm);
            canonicalOrder.push({
              norm,
              label: cleanDisplayLabel(k),
              role: inferRole(k),
            });
          });
        });

        const columns: RawTableColumn[] = canonicalOrder.map((c) => ({
          key: c.norm,
          label: c.label,
          role: c.role,
        }));

        const formattedRows = bucketRows.map(({ row }) => {
          const out: Record<string, string> = {};
          const rowByNorm = new Map<string, string>();
          Object.entries(row).forEach(([k, v]) => {
            if (k === 'parsed_specs' || k === 'row' || k.startsWith('col_')) return;
            const nk = normalizeHeader(k);
            if (nk && !rowByNorm.has(nk)) {
              rowByNorm.set(nk, formatRawCellValue(k, v));
            }
          });

          columns.forEach((col) => {
            let val = rowByNorm.get(col.key) || '';
            // Recover B3-2 .. SCT-4 shifted columns where col_12=裸装纸箱信息 & col_15=国内零售价格
            if (!val && col.role === 'box' && col.key.includes('裸装') && row['col_12'] !== undefined) {
              val = String(row['col_12'] ?? '').trim();
            }
            if (!val && col.role === 'retail' && row['col_15'] !== undefined) {
              val = String(row['col_15'] ?? '').trim();
            }
            out[col.key] = val;
          });

          return out;
        });

        tables.push({
          id: `${lang}-tbl-${sIdx}-${subIdx}`,
          sectionTitle: sec.section,
          columns,
          rows: formattedRows,
        });
      }

      subIdx += 1;
      bucketRows = [];
    };

    sec.items.forEach((row) => {
      const inlineHeader = detectInlineHeaderMap(row);
      if (inlineHeader) {
        flushBucket();
        currentInlineMap = inlineHeader;
        return;
      }
      if (isDividerRow(row)) return;
      bucketRows.push({ row, inlineMap: currentInlineMap });
    });

    flushBucket();
  });

  return {
    lang,
    fileName,
    vendorHeader,
    addressContact,
    tables,
    customPricing,
  };
}

/**
 * Adapts an uploaded Excel CatalogDataset back into RawQuotationDoc so uploaded .xlsx/.xls/.csv
 * files render seamlessly in the exact same simple raw-table view.
 */
export function catalogDatasetToRawDoc(dataset: CatalogDataset): RawQuotationDoc {
  const isZh = dataset.lang === 'zh';
  const columns: RawTableColumn[] = isZh
    ? [
        { key: 'sku', label: '产品型号', role: 'sku' },
        { key: 'name', label: '产品名称', role: 'other' },
        { key: 'material', label: '材料', role: 'material' },
        { key: 'spec', label: '产品信息', role: 'spec' },
        { key: 'color', label: '颜色', role: 'color' },
        { key: 'individualBox', label: '独立纸箱信息', role: 'box' },
        { key: 'bulkBox', label: '裸装纸箱信息', role: 'box' },
        { key: 'retailPrice', label: '国内零售价格（10PCS以下）', role: 'retail' },
        { key: 'unitPrice', label: '出厂单价', role: 'factory' },
        { key: 'certifications', label: '认证', role: 'cert' },
      ]
    : [
        { key: 'sku', label: 'Model', role: 'sku' },
        { key: 'name', label: 'Name', role: 'other' },
        { key: 'material', label: 'Material', role: 'material' },
        { key: 'spec', label: 'Description', role: 'spec' },
        { key: 'color', label: 'Color', role: 'color' },
        { key: 'individualBox', label: 'Carton Info', role: 'box' },
        { key: 'bulkBox', label: 'Bulk Carton', role: 'box' },
        { key: 'retailPrice', label: 'Retail Price (<10 PCS)', role: 'retail' },
        { key: 'unitPrice', label: 'EXW Unit Price', role: 'factory' },
        { key: 'certifications', label: 'Certification', role: 'cert' },
      ];

  const sym = dataset.currency === 'USD' ? '$' : dataset.currency === 'EUR' ? '€' : '¥';
  const grouped = new Map<string, Array<Record<string, string>>>();
  dataset.items.forEach((item) => {
    const sec = item.category || (isZh ? '产品报价表' : 'Product Quotation');
    const list = grouped.get(sec) || [];
    list.push({
      sku: item.sku,
      name: item.name === item.sku ? '' : item.name,
      material: item.material || '',
      spec: item.spec || '',
      color: item.color || '',
      individualBox: item.individualBox || '',
      bulkBox: item.bulkBox || '',
      retailPrice: item.retailPrice !== undefined ? `${sym}${item.retailPrice}` : '',
      unitPrice: item.packagingNote
        ? `(${sym}${item.unitPrice}) ${item.packagingNote}`
        : `${sym}${item.unitPrice}`,
      certifications: item.certifications || '',
    });
    grouped.set(sec, list);
  });

  const tables: RawTableBlock[] = Array.from(grouped.entries()).map(([title, rows], idx) => {
    const activeCols = columns.filter((col) =>
      rows.some((r) => Boolean(r[col.key] && r[col.key].trim()))
    );
    return {
      id: `${dataset.lang}-upload-${idx}`,
      sectionTitle: title,
      columns: activeCols.length > 0 ? activeCols : columns,
      rows,
    };
  });

  return {
    lang: dataset.lang,
    fileName: dataset.fileName,
    vendorHeader: dataset.vendorHeader,
    addressContact: dataset.addressContact,
    tables,
    customPricing: dataset.customPricing,
  };
}

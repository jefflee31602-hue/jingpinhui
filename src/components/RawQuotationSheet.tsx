import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileDown,
  ImageIcon,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { CompanyProfile, Language } from '../types/quote';
import { RawQuotationDoc, RawTableBlock } from '../utils/rawJsonSheet';
import { exportBlocksToA4Pdf } from '../utils/pdfExporter';
import {
  fetchProductImageManifest,
  ProductImageManifest,
  resolveProductImageUrl,
} from '../utils/productImages';

interface RawQuotationSheetProps {
  lang: Language;
  doc: RawQuotationDoc;
  company: CompanyProfile;
  onSwitchLanguage: (lang: Language) => void;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export const RawQuotationSheet: React.FC<RawQuotationSheetProps> = ({
  lang,
  doc,
  company,
  onSwitchLanguage,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string>('__ALL__');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [imageManifest, setImageManifest] = useState<ProductImageManifest>({
    files: [],
    bySku: {},
  });
  const [lightboxImage, setLightboxImage] = useState<{ src: string; sku: string } | null>(null);
  const pdfStageRef = useRef<HTMLDivElement | null>(null);

  const isZh = lang === 'zh';

  useEffect(() => {
    let cancelled = false;
    fetchProductImageManifest().then((m) => {
      if (!cancelled) setImageManifest(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lightboxImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxImage]);

  const getRowImage = (table: RawTableBlock, row: Record<string, string>): string | undefined => {
    const skuCol = table.columns.find((c) => c.role === 'sku');
    const skuVal = skuCol ? row[skuCol.key] : '';
    const specCol = table.columns.find((c) => c.role === 'spec');
    const specVal = specCol ? row[specCol.key] : '';
    const explicitKey = Object.keys(row).find((k) => /image|img|图片/i.test(k));
    const explicitVal = explicitKey ? row[explicitKey] : undefined;
    return resolveProductImageUrl(skuVal, explicitVal, imageManifest, specVal);
  };

  const sectionNames = useMemo(() => {
    const unique = new Set<string>();
    doc.tables.forEach((t) => unique.add(t.sectionTitle));
    return Array.from(unique);
  }, [doc.tables]);

  const activeSection =
    selectedSection === '__ALL__' || sectionNames.includes(selectedSection)
      ? selectedSection
      : '__ALL__';

  const filteredTables = useMemo<RawTableBlock[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const qNorm = q.replace(/[\s\-_]+/g, '');

    return doc.tables
      .filter((t) => activeSection === '__ALL__' || t.sectionTitle === activeSection)
      .map((table) => {
        if (!q) return table;
        const matchedRows = table.rows.filter((row) =>
          Object.values(row).some((val) => {
            const s = val.toLowerCase();
            return s.includes(q) || s.replace(/[\s\-_]+/g, '').includes(qNorm);
          })
        );
        return { ...table, rows: matchedRows };
      })
      .filter((t) => t.rows.length > 0);
  }, [doc.tables, activeSection, searchQuery]);

  const totalVisibleRows = useMemo(
    () => filteredTables.reduce((sum, t) => sum + t.rows.length, 0),
    [filteredTables]
  );

  const totalAllRows = useMemo(
    () => doc.tables.reduce((sum, t) => sum + t.rows.length, 0),
    [doc.tables]
  );

  const handleExportPdf = async () => {
    if (isExportingPdf || totalVisibleRows === 0) return;
    setExportError(null);
    setIsExportingPdf(true);

    // Wait a tick so offscreen A4 stage mounts cleanly before capturing
    await new Promise((r) => setTimeout(r, 80));

    try {
      const stage = pdfStageRef.current;
      if (!stage) throw new Error('PDF stage unavailable');
      const blocks = Array.from(stage.querySelectorAll<HTMLElement>('[data-pdf-block="true"]'));
      const today = new Date().toISOString().slice(0, 10);
      const filename = isZh
        ? `${company.brandShortName}_中文报价表_${today}.pdf`
        : `${company.brandShortName}_Quotation_${today}.pdf`;
      await exportBlocksToA4Pdf(blocks, filename);
    } catch {
      setExportError(
        isZh
          ? 'PDF 导出失败，请尝试点击右侧“打印”并在打印窗口选择“另存为 PDF”。'
          : 'PDF export failed. Please use the Print button and choose Save as PDF.'
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <section id="catalog" className="space-y-4">
      {/* Simple Control Bar */}
      <div className="no-print rounded-xl border border-slate-200/90 bg-[#F8FAFC] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Language Toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white/80 p-1">
              <button
                type="button"
                onClick={() => onSwitchLanguage('zh')}
                className={`rounded-md px-3.5 py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[38px] whitespace-nowrap shrink-0 ${
                  isZh
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#172554]'
                }`}
              >
                中文报价表
              </button>
              <button
                type="button"
                onClick={() => onSwitchLanguage('en')}
                className={`rounded-md px-3.5 py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[38px] whitespace-nowrap shrink-0 ${
                  !isZh
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#172554]'
                }`}
              >
                English Quote
              </button>
            </div>

            <span className="text-xs text-slate-500 font-mono-tabular">
              {doc.fileName} <span aria-hidden="true">·</span> {totalVisibleRows}/{totalAllRows}{' '}
              {isZh ? '项' : 'items'}
            </span>
          </div>

          {/* Direct PDF & Print */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#172554] hover:border-[#2563EB]/40 hover:bg-[#F8FAFC] hover:text-[#2563EB] transition-colors cursor-pointer min-h-[40px] whitespace-nowrap shrink-0"
            >
              <Printer className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <span>{isZh ? '打印' : 'Print'}</span>
            </button>

            <button
              type="button"
              disabled={isExportingPdf || totalVisibleRows === 0}
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50 transition-colors shadow-xs cursor-pointer min-h-[40px] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              <FileDown className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
              <span>
                {isExportingPdf
                  ? isZh
                    ? '生成中...'
                    : 'Exporting...'
                  : isZh
                  ? '导出 PDF'
                  : 'Export PDF'}
              </span>
            </button>
          </div>
        </div>

        {/* Search + Section Tabs */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isZh
                  ? '搜索型号（如 T2-1、K2）、材料、屏幕点数或认证...'
                  : 'Search model (e.g. H1-1, K2), material, specs, or certification...'
              }
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-[#172554] placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none min-h-[42px] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-[#172554] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {sectionNames.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setSelectedSection('__ALL__')}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] transition-colors ${
                  activeSection === '__ALL__'
                    ? 'bg-[#172554] text-white'
                    : 'border border-slate-200 bg-[#F8FAFC] text-slate-600 hover:border-[#2563EB]/40 hover:text-[#2563EB]'
                }`}
              >
                {isZh ? '全部' : 'All'} ({totalAllRows})
              </button>
              {sectionNames.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setSelectedSection(sec)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] transition-colors ${
                    activeSection === sec
                      ? 'bg-[#172554] text-white'
                      : 'border border-slate-200 bg-[#F8FAFC] text-slate-600 hover:border-[#2563EB]/40 hover:text-[#2563EB]'
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>
          )}
        </div>

        {exportError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {exportError}
          </div>
        )}
      </div>

      {/* Print-Only Header */}
      <div className="hidden print:block border-b-2 border-[#172554] pb-3 mb-4">
        <div className="text-lg font-bold text-[#172554]">
          {doc.vendorHeader || (isZh ? company.nameZh : company.nameEn)}
        </div>
        <div className="mt-1 text-xs text-slate-600">
          {doc.addressContact ||
            (isZh
              ? `地址：${company.addressZh} · 联系人：${company.contactPersonZh} · 电话：${company.phone}`
              : `Address: ${company.addressEn} · Contact: ${company.contactPersonEn} · Phone: ${company.phone}`)}
        </div>
      </div>

      {/* Main Quotation Sections (Rendered directly from JSON) */}
      {filteredTables.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] px-6 py-14 text-center">
          <p className="text-sm font-semibold text-[#172554]">
            {isZh ? '没有找到匹配的报价产品' : 'No matching models found'}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedSection('__ALL__');
            }}
            className="mt-4 inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#172554] hover:border-[#2563EB]/40 hover:text-[#2563EB] cursor-pointer"
          >
            {isZh ? '显示全部产品' : 'Show All Models'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredTables.map((table) => {
            const skuColIndex = table.columns.findIndex((c) => c.role === 'sku');
            const insertImageAt = skuColIndex >= 0 ? skuColIndex + 1 : 0;
            const tableHasImages = table.rows.some((r) => Boolean(getRowImage(table, r)));
            const showImageColumn = tableHasImages || imageManifest.files.length > 0;

            return (
              <div
                key={table.id}
                className="rounded-xl border border-slate-200/90 border-t-2 border-t-[#2563EB] bg-[#F8FAFC] overflow-hidden print:border-slate-300 print:rounded-none print:bg-white"
              >
                {/* Section Heading */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-[#F8FAFC] px-4 py-3 sm:px-5">
                  <h2 className="font-display text-sm sm:text-base font-bold text-[#172554]">
                    {table.sectionTitle}
                  </h2>
                  <span className="font-mono-tabular text-xs font-semibold text-[#2563EB]">
                    {table.rows.length} {isZh ? '款' : 'items'}
                  </span>
                </div>

                {/* Desktop / Print Native Aligned Excel Table */}
                <div className="hidden md:block print:block overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs leading-relaxed">
                    <thead>
                      <tr className="border-b border-blue-100 bg-[#EFF6FF]/65 text-[#172554]">
                        {table.columns.map((col, cIdx) => (
                          <React.Fragment key={col.key}>
                            {showImageColumn && cIdx === insertImageAt && (
                              <th className="px-3 py-2.5 font-semibold align-middle whitespace-nowrap min-w-[84px]">
                                {isZh ? '图片/名称' : 'Image'}
                              </th>
                            )}
                            <th
                              className={`px-3 py-2.5 font-semibold align-middle ${
                                col.role === 'sku'
                                  ? 'whitespace-nowrap min-w-[90px]'
                                  : col.role === 'spec'
                                  ? 'min-w-[230px]'
                                  : col.role === 'box'
                                  ? 'min-w-[140px]'
                                  : col.role === 'factory'
                                  ? 'min-w-[145px]'
                                  : col.role === 'retail'
                                  ? 'whitespace-nowrap min-w-[100px]'
                                  : col.role === 'color'
                                  ? 'whitespace-nowrap min-w-[58px]'
                                  : 'min-w-[90px]'
                              }`}
                            >
                              {col.label}
                            </th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80">
                      {table.rows.map((row, rIdx) => {
                        const imgSrc = showImageColumn ? getRowImage(table, row) : undefined;
                        const skuCol = table.columns.find((c) => c.role === 'sku');
                        const skuLabel = skuCol ? row[skuCol.key] || '' : '';
                        return (
                          <tr key={rIdx} className="hover:bg-white transition-colors align-top">
                            {table.columns.map((col, cIdx) => {
                              const val = row[col.key] || '';
                              return (
                                <React.Fragment key={col.key}>
                                  {showImageColumn && cIdx === insertImageAt && (
                                    <td className="px-3 py-2 align-middle">
                                      {imgSrc ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setLightboxImage({ src: imgSrc, sku: skuLabel })
                                          }
                                          title={
                                            isZh ? '点击查看大图' : 'Click to enlarge'
                                          }
                                          className="group block h-16 w-16 overflow-hidden rounded-md border border-slate-200 bg-white p-0.5 hover:border-[#2563EB] focus-visible:outline-2 focus-visible:outline-[#2563EB] cursor-zoom-in transition-colors"
                                        >
                                          <img
                                            src={imgSrc}
                                            alt={skuLabel || 'Product'}
                                            loading="lazy"
                                            className="h-full w-full object-contain transition-transform group-hover:scale-105"
                                          />
                                        </button>
                                      ) : (
                                        <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-slate-200 bg-[#F8FAFC] text-slate-300">
                                          <ImageIcon className="h-4 w-4" aria-hidden="true" />
                                        </div>
                                      )}
                                    </td>
                                  )}
                                  <td
                                    className={`px-3 py-2.5 ${
                                      col.role === 'sku'
                                        ? 'font-mono-tabular font-bold text-[#172554] whitespace-nowrap'
                                        : col.role === 'factory'
                                        ? 'font-mono-tabular font-bold text-[#2563EB]'
                                        : col.role === 'retail'
                                        ? 'font-mono-tabular font-semibold text-[#B45309] whitespace-nowrap'
                                        : col.role === 'cert'
                                        ? 'font-mono-tabular text-[11px] text-slate-600'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {val || <span className="text-slate-300">—</span>}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Stacked Cards (Clean Key -> Value alignment) */}
                <div className="md:hidden print:hidden divide-y divide-slate-200">
                  {table.rows.map((row, rIdx) => {
                    const skuCol = table.columns.find((c) => c.role === 'sku');
                    const factoryCol = table.columns.find((c) => c.role === 'factory');
                    const retailCol = table.columns.find((c) => c.role === 'retail');
                    const detailCols = table.columns.filter(
                      (c) => c !== skuCol && c !== factoryCol && c !== retailCol
                    );
                    const imgSrc = showImageColumn ? getRowImage(table, row) : undefined;
                    const skuLabel = skuCol ? row[skuCol.key] || `#${rIdx + 1}` : `#${rIdx + 1}`;

                    return (
                      <div key={rIdx} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {imgSrc && (
                              <button
                                type="button"
                                onClick={() => setLightboxImage({ src: imgSrc, sku: skuLabel })}
                                className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5 hover:border-[#2563EB] cursor-zoom-in"
                              >
                                <img
                                  src={imgSrc}
                                  alt={skuLabel}
                                  loading="lazy"
                                  className="h-full w-full object-contain"
                                />
                              </button>
                            )}
                            <div className="font-mono-tabular text-base font-bold text-[#172554]">
                              {skuLabel}
                            </div>
                          </div>
                          <div className="text-right space-y-0.5">
                            {factoryCol && row[factoryCol.key] && (
                              <div className="font-mono-tabular text-xs font-bold text-[#2563EB]">
                                {row[factoryCol.key]}
                              </div>
                            )}
                            {retailCol && row[retailCol.key] && (
                              <div className="font-mono-tabular text-xs font-medium text-[#B45309]">
                                {retailCol.label}: {row[retailCol.key]}
                              </div>
                            )}
                          </div>
                        </div>

                        <dl className="space-y-1.5 text-xs">
                          {detailCols.map((col) => {
                            const val = row[col.key];
                            if (!val || val === '/') return null;
                            return (
                              <div key={col.key} className="flex flex-col sm:flex-row sm:gap-2">
                                <dt className="text-slate-400 font-medium shrink-0">{col.label}</dt>
                                <dd className="text-slate-700 leading-relaxed">{val}</dd>
                              </div>
                            );
                          })}
                        </dl>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Pricing Table (Raw JSON custom_pricing rendered directly) */}
      {doc.customPricing && doc.customPricing.length > 0 && (
        <div className="rounded-xl border border-slate-200/90 border-t-2 border-t-[#F59E0B] bg-[#F8FAFC] overflow-hidden print:border-slate-300 print:rounded-none print:bg-white">
          <div className="border-b border-slate-200 bg-[#F8FAFC] px-4 py-3 sm:px-5">
            <h3 className="font-display text-sm font-bold text-[#172554]">
              {doc.customPricing[0]?.[0] ||
                (isZh ? '额外定制价格说明' : 'Custom extra pricing')}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <tbody className="divide-y divide-slate-200/80">
                {doc.customPricing.map((row, idx) => (
                  <tr
                    key={idx}
                    className={
                      idx === 0 || idx === 2
                        ? 'bg-[#EFF6FF]/60 font-semibold text-[#172554]'
                        : 'text-slate-700 hover:bg-white'
                    }
                  >
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-4 py-2.5 sm:px-5 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                    {row.length < 4 &&
                      Array.from({ length: 4 - row.length }).map((_, emptyIdx) => (
                        <td key={`e-${emptyIdx}`} className="px-4 py-2.5 sm:px-5" />
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Offscreen Chunked A4 Stage (Mounted only during PDF export to prevent tall-canvas truncation) */}
      {isExportingPdf && (
        <div
          ref={pdfStageRef}
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            width: '794px',
            backgroundColor: '#ffffff',
            color: '#172554',
            padding: '16px',
            zIndex: -1,
          }}
        >
          {/* PDF Header Block */}
          <div
            data-pdf-block="true"
            style={{
              backgroundColor: '#172554',
              color: '#ffffff',
              padding: '18px 22px',
              marginBottom: '12px',
              borderRadius: '6px',
              borderTop: '3px solid #F59E0B',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 700 }}>
              {doc.vendorHeader || (isZh ? company.nameZh : company.nameEn)}
            </div>
            <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '6px', lineHeight: 1.5 }}>
              {doc.addressContact ||
                (isZh
                  ? `地址：${company.addressZh} | 联系人：${company.contactPersonZh} | 电话：${company.phone}`
                  : `Address: ${company.addressEn} | Contact: ${company.contactPersonEn} | Phone: ${company.phone}`)}
            </div>
          </div>

          {/* Chunked Table Blocks (max 16 rows per capture block) */}
          {filteredTables.flatMap((table) => {
            const skuColIndex = table.columns.findIndex((c) => c.role === 'sku');
            const insertImageAt = skuColIndex >= 0 ? skuColIndex + 1 : 0;
            const showImageColumn =
              table.rows.some((r) => Boolean(getRowImage(table, r))) ||
              imageManifest.files.length > 0;

            return chunkArray(table.rows, 16).map((rowChunk, chunkIdx) => (
              <div
                key={`${table.id}-chunk-${chunkIdx}`}
                data-pdf-block="true"
                style={{
                  marginBottom: '12px',
                  border: '1px solid #cbd5e1',
                  borderTop: '2px solid #2563EB',
                  backgroundColor: '#ffffff',
                }}
              >
                {chunkIdx === 0 && (
                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      color: '#172554',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderBottom: '1px solid #cbd5e1',
                    }}
                  >
                    {table.sectionTitle}
                  </div>
                )}
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '9.5px',
                    lineHeight: 1.4,
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: '#EFF6FF', borderBottom: '1px solid #cbd5e1' }}>
                      {table.columns.map((col, cIdx) => (
                        <React.Fragment key={col.key}>
                          {showImageColumn && cIdx === insertImageAt && (
                            <th
                              style={{
                                padding: '6px',
                                fontWeight: 700,
                                color: '#334155',
                                borderRight: '1px solid #e2e8f0',
                                width: '54px',
                              }}
                            >
                              {isZh ? '图片/名称' : 'Image'}
                            </th>
                          )}
                          <th
                            style={{
                              padding: '6px',
                              fontWeight: 700,
                              color: '#334155',
                              borderRight: '1px solid #e2e8f0',
                            }}
                          >
                            {col.label}
                          </th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowChunk.map((row, rIdx) => {
                      const imgSrc = showImageColumn ? getRowImage(table, row) : undefined;
                      return (
                        <tr
                          key={rIdx}
                          style={{
                            borderBottom: '1px solid #e2e8f0',
                            backgroundColor: rIdx % 2 === 1 ? '#fafafa' : '#ffffff',
                          }}
                        >
                          {table.columns.map((col, cIdx) => (
                            <React.Fragment key={col.key}>
                              {showImageColumn && cIdx === insertImageAt && (
                                <td
                                  style={{
                                    padding: '4px 6px',
                                    verticalAlign: 'middle',
                                    borderRight: '1px solid #f1f5f9',
                                    textAlign: 'center',
                                  }}
                                >
                                  {imgSrc ? (
                                    <img
                                      src={imgSrc}
                                      alt=""
                                      style={{
                                        width: '44px',
                                        height: '44px',
                                        objectFit: 'contain',
                                        display: 'inline-block',
                                      }}
                                    />
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              )}
                              <td
                                style={{
                                  padding: '5px 6px',
                                  verticalAlign: 'top',
                                  borderRight: '1px solid #f1f5f9',
                                  fontWeight:
                                    col.role === 'sku' || col.role === 'factory' ? 700 : 400,
                                  color: col.role === 'factory' ? '#2563EB' : '#172554',
                                }}
                              >
                                {row[col.key] || '-'}
                              </td>
                            </React.Fragment>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ));
          })}

          {/* Custom Pricing PDF Block */}
          {doc.customPricing && doc.customPricing.length > 0 && (
            <div
              data-pdf-block="true"
              style={{
                border: '1px solid #cbd5e1',
                borderTop: '2px solid #F59E0B',
                marginTop: '8px',
                backgroundColor: '#ffffff',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '10px',
                  textAlign: 'left',
                }}
              >
                <tbody>
                  {doc.customPricing.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: idx === 0 || idx === 2 ? '#F8FAFC' : '#ffffff',
                        fontWeight: idx === 0 || idx === 2 ? 700 : 400,
                      }}
                    >
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ padding: '6px 8px' }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Click-to-zoom Image Lightbox */}
      {lightboxImage && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#172554]/75 p-4 backdrop-blur-xs"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lightboxImage.sku}
        >
          <div
            className="relative max-w-lg w-full rounded-2xl border border-slate-200 bg-[#F8FAFC] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2.5">
              <span className="font-mono-tabular text-sm font-bold text-[#172554]">
                {lightboxImage.sku}
              </span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label="Close image preview"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-[#172554] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-xl border border-slate-200/70 bg-white p-4">
              <img
                src={lightboxImage.src}
                alt={lightboxImage.sku}
                className="max-h-[62vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

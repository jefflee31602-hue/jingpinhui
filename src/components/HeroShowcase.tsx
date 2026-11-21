import React, { useMemo, useState } from 'react';
import { ImageIcon, MapPin, Phone, User } from 'lucide-react';
import { CompanyProfile, Language } from '../types/quote';
import { RawQuotationDoc } from '../utils/rawJsonSheet';

interface HeroShowcaseProps {
  lang: Language;
  company: CompanyProfile;
  doc: RawQuotationDoc;
  activeSection: string;
  onSwitchLanguage: (lang: Language) => void;
  onJumpToSection: (sectionTitle: string) => void;
  onJumpToModel: (sku: string) => void;
}

interface FlagshipCardItem {
  sku: string;
  imgSrc: string;
  labelZh: string;
  labelEn: string;
}

const FLAGSHIP_ITEMS: FlagshipCardItem[] = [
  {
    sku: 'T2-1',
    imgSrc: '/images/products/T2-1.png',
    labelZh: '智能背包',
    labelEn: 'Backpack',
  },
  {
    sku: 'H1-1',
    imgSrc: '/images/products/H1-1.png',
    labelZh: '穿戴装备',
    labelEn: 'Wearable',
  },
  {
    sku: 'K2',
    imgSrc: '/images/products/K2.png',
    labelZh: '车载显示',
    labelEn: 'Car Screen',
  },
  {
    sku: 'idot-1',
    imgSrc: '/images/products/idot-1.png',
    labelZh: '桌面像素',
    labelEn: 'Desktop',
  },
];

function parseLowestPrice(val: string): number | null {
  if (!val) return null;
  const cleaned = val.replace(/\+\s*[$¥]?\s*\d+(\.\d+)?/g, '');
  const matches = cleaned.match(/\d+(?:\.\d+)?/g);
  if (!matches) return null;
  for (const m of matches) {
    const num = Number(m);
    if (Number.isFinite(num) && num >= 5 && num < 50000) {
      return num;
    }
  }
  return null;
}

export const HeroShowcase: React.FC<HeroShowcaseProps> = ({
  lang,
  company,
  doc,
  activeSection,
  onSwitchLanguage,
  onJumpToSection,
  onJumpToModel,
}) => {
  const isZh = lang === 'zh';
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const sectionSummaries = useMemo(() => {
    const map = new Map<
      string,
      { title: string; count: number; minPrice: number | null }
    >();

    doc.tables.forEach((table) => {
      const existing = map.get(table.sectionTitle) || {
        title: table.sectionTitle,
        count: 0,
        minPrice: null,
      };
      existing.count += table.rows.length;

      const factoryCol = table.columns.find((c) => c.role === 'factory');
      if (factoryCol) {
        table.rows.forEach((row) => {
          const p = parseLowestPrice(row[factoryCol.key] || '');
          if (p !== null && (existing.minPrice === null || p < existing.minPrice)) {
            existing.minPrice = p;
          }
        });
      }

      map.set(table.sectionTitle, existing);
    });

    return Array.from(map.values());
  }, [doc.tables]);

  const totalModels = useMemo(
    () => doc.tables.reduce((sum, t) => sum + t.rows.length, 0),
    [doc.tables]
  );

  return (
    <section
      id="overview"
      className="no-print relative bg-gradient-to-b from-[#EFF6FF]/90 via-[#F8FAFC] to-[#F8FAFC]"
    >
      <div className="mx-auto max-w-[1440px] px-4 pt-5 pb-3 sm:px-6 sm:pt-7 sm:pb-4 lg:px-8">
        {/* Compact Unified Header Strip */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Title, Contact Meta & Bilingual Switch */}
          <div className="space-y-2.5 max-w-3xl">
            <p className="text-xs font-semibold text-[#2563EB]">
              <span>{doc.vendorHeader || (isZh ? company.nameZh : company.nameEn)}</span>
              <span className="mx-2 text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="text-[#B45309] tabular-nums">
                {isZh
                  ? `2026 官方现货报价单（${totalModels} 款）`
                  : `2026 Official Wholesale Sheet (${totalModels} Models)`}
              </span>
            </p>

            <h1 className="font-display text-xl sm:text-2xl lg:text-[1.75rem] font-bold tracking-tight text-[#172554] text-balance leading-snug">
              {isZh
                ? 'LED 智能像素屏背包、穿戴装备与车载屏在线报价表'
                : 'Smart LED Pixel Backpacks, Wearables & Car Display Quotation'}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[#2563EB] shrink-0" aria-hidden="true" />
                <span>{isZh ? company.addressZh : company.addressEn}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[#2563EB] shrink-0" aria-hidden="true" />
                <span>
                  {isZh
                    ? `联系人：${company.contactPersonZh}`
                    : `Contact: ${company.contactPersonEn}`}
                </span>
              </span>
              <a
                href={`tel:${company.phone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1.5 font-mono-tabular font-semibold text-[#2563EB] hover:text-[#172554] transition-colors"
              >
                <Phone className="h-3.5 w-3.5 text-[#F59E0B] shrink-0" aria-hidden="true" />
                <span>{company.phone}</span>
              </a>
            </div>
          </div>

          {/* Right: Compact Single-Row Flagship Thumbnails + Language Switch */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
            <div className="grid grid-cols-4 gap-2">
              {FLAGSHIP_ITEMS.map((item) => {
                const isBroken = brokenImages[item.sku];
                return (
                  <button
                    key={item.sku}
                    type="button"
                    onClick={() => onJumpToModel(item.sku)}
                    title={`${item.sku} · ${isZh ? item.labelZh : item.labelEn}`}
                    className="group rounded-lg border border-slate-200/90 bg-white p-1.5 hover:border-[#2563EB] transition-colors cursor-pointer text-center w-[72px] sm:w-[78px]"
                  >
                    <div className="h-11 w-full overflow-hidden rounded bg-[#F8FAFC] flex items-center justify-center p-0.5">
                      {!isBroken ? (
                        <img
                          src={item.imgSrc}
                          alt={`${item.sku} - ${isZh ? item.labelZh : item.labelEn}`}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImages((prev) => ({ ...prev, [item.sku]: true }))
                          }
                          className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-slate-300" aria-hidden="true" />
                      )}
                    </div>
                    <div className="mt-1 font-mono-tabular text-[10px] font-bold text-[#172554] group-hover:text-[#2563EB] truncate">
                      {item.sku}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              role="group"
              aria-label={isZh ? '报价单语言切换' : 'Quotation Language Switch'}
              className="inline-flex self-start sm:self-auto rounded-lg border border-slate-200 bg-white p-1"
            >
              <button
                type="button"
                onClick={() => onSwitchLanguage('zh')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors min-h-[34px] ${
                  isZh
                    ? 'bg-[#172554] text-white font-semibold'
                    : 'text-slate-600 hover:text-[#172554]'
                }`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => onSwitchLanguage('en')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors min-h-[34px] ${
                  !isZh
                    ? 'bg-[#172554] text-white font-semibold'
                    : 'text-slate-600 hover:text-[#172554]'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        {/* Slim Inline Category Quick-Jump Row */}
        {sectionSummaries.length > 0 && (
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {sectionSummaries.map((sec, idx) => {
              const isSelected = activeSection === sec.title;
              const pricePrefix = isZh ? '¥' : '$';
              return (
                <button
                  key={sec.title}
                  type="button"
                  onClick={() => onJumpToSection(sec.title)}
                  className={`text-left rounded-xl border px-3.5 py-2.5 transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'border-[#2563EB] bg-[#EFF6FF]'
                      : 'border-slate-200/90 bg-white hover:border-[#2563EB]/60 hover:bg-[#EFF6FF]/40'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium">
                      <span className="font-mono-tabular font-bold text-[#2563EB]">
                        0{idx + 1}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono-tabular text-slate-500">
                        {sec.count} {isZh ? '款' : 'items'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-[#172554] truncate">
                      {sec.title}
                    </div>
                  </div>

                  {sec.minPrice !== null && (
                    <span className="font-mono-tabular text-[11px] font-bold text-[#B45309] bg-[#FEF3C7]/75 px-2 py-0.5 rounded shrink-0">
                      {pricePrefix}
                      {sec.minPrice}+
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

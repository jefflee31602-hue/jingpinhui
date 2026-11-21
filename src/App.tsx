import { useEffect, useState } from 'react';
import { MapPin, Phone, User } from 'lucide-react';
import { Language } from './types/quote';
import {
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_EN_CATALOG,
  DEFAULT_ZH_CATALOG,
} from './data/defaultCatalogs';
import {
  buildRawQuotationDoc,
  catalogDatasetToRawDoc,
  RawQuotationDoc,
} from './utils/rawJsonSheet';
import { Header } from './components/Header';
import { RawQuotationSheet } from './components/RawQuotationSheet';
import { CompanyContactSection } from './components/CompanyContactSection';
import techBlueBackdrop from './assets/images/tech_blue_backdrop_1795230098365.jpg';

const STORAGE_KEY_LANG = 'jph_quote_lang_v1';

function readLangStorage(fallback: Language): Language {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LANG);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === 'en' ? 'en' : 'zh';
  } catch {
    return fallback;
  }
}

export default function App() {
  const [lang, setLang] = useState<Language>(() => readLangStorage('zh'));
  const company = DEFAULT_COMPANY_PROFILE;

  const [zhDoc, setZhDoc] = useState<RawQuotationDoc>(() =>
    catalogDatasetToRawDoc(DEFAULT_ZH_CATALOG)
  );
  const [enDoc, setEnDoc] = useState<RawQuotationDoc>(() =>
    catalogDatasetToRawDoc(DEFAULT_EN_CATALOG)
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LANG, JSON.stringify(lang));
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

      const title =
        lang === 'zh'
          ? '精品汇 · LED 像素屏、智能背包与穿戴产品中英文报价单'
          : 'Jingpinhui · LED Pixel Backpacks, Car Screens & Lighting Quotation';
      const desc =
        lang === 'zh'
          ? '深圳市华强电子世界（精品汇）中英文在线产品报价系统：涵盖 LED 像素背包、穿戴设备、车窗软屏与桌面像素灯出厂价、零售价与规格查询，支持打印与 A4 PDF 导出。'
          : 'Official bilingual product quotation for Shenzhen Huaqiang Electronic world Jingpinhui: LED pixel backpacks, wearables, car display screens, and desktop pixel lighting with specs and A4 PDF export.';
      const canonicalUrl = `${window.location.origin}${window.location.pathname}`;

      document.title = title;
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute('content', desc);
      document
        .querySelector('meta[property="og:title"]')
        ?.setAttribute('content', title);
      document
        .querySelector('meta[property="og:description"]')
        ?.setAttribute('content', desc);
      document
        .querySelector('meta[name="twitter:title"]')
        ?.setAttribute('content', title);
      document
        .querySelector('meta[name="twitter:description"]')
        ?.setAttribute('content', desc);
      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute('href', canonicalUrl);

      let ogUrl = document.querySelector('meta[property="og:url"]');
      if (!ogUrl) {
        ogUrl = document.createElement('meta');
        ogUrl.setAttribute('property', 'og:url');
        document.head.appendChild(ogUrl);
      }
      ogUrl.setAttribute('content', canonicalUrl);
    } catch {
      // ignore
    }
  }, [lang]);

  // Hydrate directly from static /data/quotes-zh.json & /data/quotes-en.json
  useEffect(() => {
    let cancelled = false;

    const loadRawJson = async (targetLang: Language) => {
      try {
        const res = await fetch(`/data/quotes-${targetLang}.json`, { cache: 'no-cache' });
        if (!res.ok) return;
        const json = await res.json();
        const doc = buildRawQuotationDoc(json, targetLang, `quotes-${targetLang}.json`);
        if (cancelled) return;

        if (targetLang === 'zh') {
          setZhDoc(doc);
        } else {
          setEnDoc(doc);
        }
      } catch {
        // Fallback silently to default dataset
      }
    };

    loadRawJson('zh');
    loadRawJson('en');

    return () => {
      cancelled = true;
    };
  }, []);

  const activeDoc = lang === 'zh' ? zhDoc : enDoc;
  const isZh = lang === 'zh';
  const totalModels = activeDoc.tables.reduce((sum, t) => sum + t.rows.length, 0);

  return (
    <div id="top" className="relative min-h-screen flex flex-col text-[#172554]">
      {/* Full-Page Atmospheric Business Tech Blue Canvas */}
      <div
        aria-hidden="true"
        className="no-print pointer-events-none fixed inset-0 -z-10 page-tech-canvas"
      />

      <Header
        brandName={company.brandShortName}
        lang={lang}
        onSwitchLanguage={setLang}
      />

      {/* Full-Width Panoramic Company Hero Backdrop Stage */}
      <section className="no-print relative overflow-hidden bg-[#172554] text-white">
        <img
          src={techBlueBackdrop}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-90"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#172554]/90 via-[#172554]/72 to-[#172554]/45"
        />

        <div className="relative z-10 mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pt-7 pb-14 sm:pt-9 sm:pb-16">
          <div className="h-[3px] w-10 rounded-full bg-[#F59E0B] mb-3" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-lg sm:text-2xl font-bold tracking-tight text-white text-balance">
                {activeDoc.vendorHeader || (isZh ? company.nameZh : company.nameEn)}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs sm:text-[13px] text-slate-100">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[#F59E0B] shrink-0" aria-hidden="true" />
                  <span>{isZh ? company.addressZh : company.addressEn}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-[#F59E0B] shrink-0" aria-hidden="true" />
                  <span>
                    {isZh
                      ? `联系人：${company.contactPersonZh}`
                      : `Contact: ${company.contactPersonEn}`}
                  </span>
                </span>
                <a
                  href={`tel:${company.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1.5 font-mono-tabular font-semibold text-[#F59E0B] hover:text-amber-300 transition-colors"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{company.phone}</span>
                </a>
              </div>
            </div>

            <div className="text-xs text-slate-200 font-mono-tabular shrink-0">
              <span>
                {activeDoc.tables.length} {isZh ? '大系列' : 'Series'}
              </span>
              <span className="mx-2 text-slate-400" aria-hidden="true">·</span>
              <span>
                {totalModels} {isZh ? '款产品' : 'Models'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <main className="relative z-10 flex-1 -mt-8 sm:-mt-9 pb-8 sm:pb-10 print:mt-0 print:py-0">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 print:px-0">
          {/* Direct JSON Quotation Sheet */}
          <RawQuotationSheet
            lang={lang}
            doc={activeDoc}
            company={company}
            onSwitchLanguage={setLang}
          />
        </div>
      </main>

      <CompanyContactSection lang={lang} company={company} />

      <footer className="no-print border-t border-[#1E3A8A]/60 bg-[#172554] py-6 text-slate-300">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-1.5 px-4 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="font-medium text-white">
            © {new Date().getFullYear()} {isZh ? company.nameZh : company.nameEn}
          </div>
          <div className="text-slate-300">
            {isZh ? '中英文产品报价单在线查询 · 支持 PDF 导出' : 'Bilingual Product Quotation · PDF Export'}
          </div>
        </div>
      </footer>
    </div>
  );
}

import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Language } from '../types/quote';

interface HeaderProps {
  brandName: string;
  lang: Language;
  onSwitchLanguage: (lang: Language) => void;
}

export const Header: React.FC<HeaderProps> = ({
  brandName,
  lang,
  onSwitchLanguage,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isZh = lang === 'zh';

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-200/90 bg-[#F8FAFC]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 sm:h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#top"
          className="font-display text-base sm:text-lg font-bold tracking-tight text-[#172554] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
        >
          {brandName}
        </a>

        {/* Zone 2: Minimal Nav */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600"
        >
          <a
            href="#catalog"
            className="hover:text-[#2563EB] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB]"
          >
            {isZh ? '产品报价表' : 'Price Sheet'}
          </a>
          <a
            href="#contact"
            className="hover:text-[#2563EB] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB]"
          >
            {isZh ? '公司与联系' : 'Contact'}
          </a>
        </nav>

        {/* Zone 3: Language Switch + Mobile Menu */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onSwitchLanguage('zh')}
              className={`rounded-md px-3 py-1.5 font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#2563EB] ${
                isZh
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#172554]'
              }`}
            >
              中文
            </button>
            <button
              type="button"
              onClick={() => onSwitchLanguage('en')}
              className={`rounded-md px-3 py-1.5 font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#2563EB] ${
                !isZh
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#172554]'
              }`}
            >
              EN
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Menu"
            className="inline-flex md:hidden items-center justify-center rounded-lg border border-slate-200 bg-[#F8FAFC] p-2 text-[#172554] hover:bg-white min-h-[40px] min-w-[40px]"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-[#F8FAFC] px-4 py-2.5 space-y-1">
          <button
            type="button"
            onClick={() => scrollTo('catalog')}
            className="block w-full text-left rounded-md px-3 py-2.5 text-sm font-medium text-[#172554] hover:bg-white hover:text-[#2563EB]"
          >
            {isZh ? '产品报价表' : 'Price Sheet'}
          </button>
          <button
            type="button"
            onClick={() => scrollTo('contact')}
            className="block w-full text-left rounded-md px-3 py-2.5 text-sm font-medium text-[#172554] hover:bg-white hover:text-[#2563EB]"
          >
            {isZh ? '公司与联系' : 'Contact'}
          </button>
        </div>
      )}
    </header>
  );
};

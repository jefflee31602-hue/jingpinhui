import React, { useState } from 'react';
import {
  Check,
  Copy,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  UserCheck,
} from 'lucide-react';
import { CompanyProfile, Language } from '../types/quote';
import { UI_TEXT } from '../data/i18n';

interface CompanyContactSectionProps {
  lang: Language;
  company: CompanyProfile;
}

export const CompanyContactSection: React.FC<CompanyContactSectionProps> = ({
  lang,
  company,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const t = UI_TEXT[lang].contact;
  const isZh = lang === 'zh';

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // ignore clipboard permission issues
    }
  };

  return (
    <section
      id="contact"
      className="no-print border-t border-blue-100/90 bg-white/85 backdrop-blur-xs py-10 sm:py-12"
    >
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="pb-6 border-b border-slate-200">
          <div className="h-[3px] w-8 rounded-full bg-[#2563EB] mb-2.5" />
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#172554] text-balance">
            {isZh ? company.nameZh : company.nameEn}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isZh ? company.taglineZh : company.taglineEn}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          {/* Contact Person */}
          <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <UserCheck className="h-3.5 w-3.5 text-[#2563EB]" aria-hidden="true" />
              <span>{t.contactPersonLabel}</span>
            </div>
            <div className="font-semibold text-[#172554]">
              {isZh ? company.contactPersonZh : company.contactPersonEn}
            </div>
          </div>

          {/* Phone */}
          <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 flex items-center justify-between gap-2">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Phone className="h-3.5 w-3.5 text-[#2563EB]" aria-hidden="true" />
                <span>{t.phoneLabel}</span>
              </div>
              <a
                href={`tel:${company.phone.replace(/\s+/g, '')}`}
                className="font-mono-tabular font-semibold text-[#172554] hover:text-[#2563EB] transition-colors block truncate"
              >
                {company.phone}
              </a>
            </div>
            <button
              type="button"
              onClick={() => handleCopy('phone', company.phone)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-[#2563EB]/50 hover:text-[#2563EB] transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
            >
              {copiedKey === 'phone' ? (
                <Check className="h-3.5 w-3.5 text-[#2563EB]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedKey === 'phone' ? t.copySuccess : t.copy}</span>
            </button>
          </div>

          {/* WeChat / Email */}
          <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 flex items-center justify-between gap-2">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {company.wechat ? (
                  <MessageSquare className="h-3.5 w-3.5 text-[#2563EB]" aria-hidden="true" />
                ) : (
                  <Mail className="h-3.5 w-3.5 text-[#2563EB]" aria-hidden="true" />
                )}
                <span>{company.wechat ? t.wechatLabel : t.emailLabel}</span>
              </div>
              <div className="font-mono-tabular font-semibold text-[#172554] truncate">
                {company.wechat || company.email}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                handleCopy('alt', company.wechat || company.email)
              }
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-[#2563EB]/50 hover:text-[#2563EB] transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
            >
              {copiedKey === 'alt' ? (
                <Check className="h-3.5 w-3.5 text-[#2563EB]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedKey === 'alt' ? t.copySuccess : t.copy}</span>
            </button>
          </div>

          {/* Address */}
          <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5 text-[#2563EB]" aria-hidden="true" />
              <span>{t.addressLabel}</span>
            </div>
            <div className="text-xs sm:text-sm text-[#172554] leading-relaxed">
              {isZh ? company.addressZh : company.addressEn}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

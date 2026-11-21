export type Language = 'zh' | 'en';

export type CurrencyCode = 'CNY' | 'USD' | 'EUR' | 'HKD';

export type PriceTierMode = 'auto' | 'factory' | 'retail';

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  spec: string;
  category: string;
  unit: string;
  unitPrice: number; // Primary / Factory ex-works price
  retailPrice?: number; // Domestic retail price (<10 PCS)
  retailThreshold?: number; // Default 10
  material?: string;
  color?: string;
  individualBox?: string;
  bulkBox?: string;
  certifications?: string;
  packagingNote?: string;
  boxSurcharge?: number; // e.g., +4 CNY for individual box
  imageUrl?: string;
  moq?: number;
  leadTime?: string;
  notes?: string;
  sheetName?: string;
  parsedSpecs?: Record<string, string>;
}

export interface CatalogDataset {
  lang: Language;
  fileName: string;
  importedAt: string;
  currency: CurrencyCode;
  items: CatalogItem[];
  sheetNames: string[];
  rawHeaders?: string[];
  isSample: boolean;
  vendorHeader?: string;
  addressContact?: string;
  customPricing?: string[][];
}

export interface QuoteLineItem {
  id: string;
  catalogItemId?: string;
  sku: string;
  name: string;
  spec: string;
  material?: string;
  color?: string;
  certifications?: string;
  imageUrl?: string;
  unit: string;
  unitPrice: number; // Effective active price per unit
  factoryPrice: number;
  retailPrice?: number;
  retailThreshold?: number;
  boxSurcharge?: number;
  includeIndividualBox?: boolean;
  quantity: number;
  notes?: string;
  isCustom?: boolean;
}

export interface ClientInfo {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  projectRef: string;
}

export interface QuoteSettings {
  quoteNumber: string;
  issueDate: string;
  validDays: number;
  currency: CurrencyCode;
  priceTierMode: PriceTierMode;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  taxRate: number;
  shippingFee: number;
  termsNote: string;
}

export interface CompanyProfile {
  brandShortName: string;
  nameZh: string;
  nameEn: string;
  contactPersonZh: string;
  contactPersonEn: string;
  taglineZh: string;
  taglineEn: string;
  addressZh: string;
  addressEn: string;
  phone: string;
  email: string;
  wechat: string;
  whatsapp: string;
  website: string;
  taxId: string;
  bankInfoZh: string;
  bankInfoEn: string;
  defaultTermsZh: string;
  defaultTermsEn: string;
}

export type ColumnField =
  | 'sku'
  | 'name'
  | 'material'
  | 'spec'
  | 'color'
  | 'individualBox'
  | 'bulkBox'
  | 'retailPrice'
  | 'unitPrice'
  | 'certifications'
  | 'category'
  | 'unit'
  | 'moq'
  | 'leadTime'
  | 'notes'
  | 'imageUrl';

export type ColumnMapping = Partial<Record<ColumnField, string>>;

import type { Metadata } from 'next';
import { Noto_Sans_Arabic, Reem_Kufi, IBM_Plex_Sans_Arabic, Aref_Ruqaa } from 'next/font/google';
import Script from 'next/script';
import { GlobalProviders } from './global-providers';
import { SITE_CONTACT_EMAIL } from '@/lib/site';
import './globals.css';

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-sans-arabic',
});

const reemKufi = Reem_Kufi({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-reem-kufi',
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-arabic',
});

const arefRuqaa = Aref_Ruqaa({
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-aref-ruqaa',
});

const SITE_URL = 'https://gynat.com';
const SITE_NAME = 'جينات';
const DEFAULT_TITLE = 'جينات — شجرة العائلة وتوثيق الأنساب';
const DEFAULT_DESCRIPTION =
  'جينات — منصّة عربية لتوثيق شجرة العائلة والأنساب عبر الأجيال، بدعم التقويم الهجري وتسجيل الرَضاعة، مع تشفير مزدوج يحفظ خصوصية بيانات عائلتك.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: '%s · جينات' },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: [
    'شجرة العائلة',
    'توثيق الأنساب',
    'برنامج أنساب',
    'شجرة نسب',
    'تقويم هجري',
    'الرَضاعة',
    'رضاع نسب',
    'جينات',
    'جيناتي',
    'Arabic family tree',
    'Islamic genealogy',
    'Hijri calendar family tree',
    'GEDCOM Arabic',
  ],
  alternates: {
    canonical: '/',
    languages: { ar: '/' },
  },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  formatDetection: { telephone: false, email: false, address: false },
};

// Site-wide Organization schema for brand disambiguation in search.
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  alternateName: 'gynat',
  url: SITE_URL,
  logo: `${SITE_URL}/brand/avatar-1000.png`,
  sameAs: ['https://x.com/_gynat'],
  description:
    'جينات منصّة عربية لبناء شجرة العائلة وتوثيق الأنساب، بدعم التقويم الهجري وعلاقات الرضاعة، مع تشفير مزدوج يحفظ خصوصية بيانات العائلة.',
  contactPoint: {
    '@type': 'ContactPoint',
    email: SITE_CONTACT_EMAIL,
    contactType: 'customer support',
    availableLanguage: ['Arabic', 'English'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fontClasses = [
    notoSansArabic.variable,
    reemKufi.variable,
    plexArabic.variable,
    arefRuqaa.variable,
  ].join(' ');

  return (
    <html lang="ar" dir="rtl" className={fontClasses}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <GlobalProviders>
          {children}
        </GlobalProviders>
        <Script
          src="https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://analytics.autoflowa.com/script.js"
          data-website-id="3797d417-f3f8-45cb-b925-6e915a3e8ef9"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}

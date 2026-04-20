import type { Metadata } from 'next';
import { Noto_Sans_Arabic, Reem_Kufi, IBM_Plex_Sans_Arabic, Aref_Ruqaa } from 'next/font/google';
import Script from 'next/script';
import { GlobalProviders } from './global-providers';
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

export const metadata: Metadata = {
  title: 'سُلالَة',
  description: 'Family genealogy web application',
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

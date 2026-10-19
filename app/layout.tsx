import type { Metadata, Viewport } from 'next';
import { Fraunces, Manrope } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const serif = Fraunces({ subsets: ['latin'], weight: ['300', '400', '600'], variable: '--font-serif' });
const sans = Manrope({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Stillhorn — a little winter world',
  description: 'A tiny 3D winter scene made just for fun. Scroll, watch the snow, stay a while.',
};

export const viewport: Viewport = {
  themeColor: '#070b14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="loading">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

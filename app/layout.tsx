import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { AppProvider } from '@/components/context/AppContext';
import { ToastProvider } from '@/components/ui/Toast';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'SIP-BHP SETDA DEMAK — Sistem Informasi Persediaan Barang Habis Pakai',
  description:
    'Aplikasi Pengelolaan Persediaan Barang Habis Pakai (BHP) Multi-Gudang Bagian Sekretariat Daerah Kabupaten Demak.',
  openGraph: {
    title: 'SIP-BHP SETDA DEMAK',
    description:
      'Sistem Informasi Persediaan Barang Habis Pakai Sekretariat Daerah Kabupaten Demak.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SIP-BHP SETDA DEMAK',
    description:
      'Sistem Informasi Persediaan Barang Habis Pakai Sekretariat Daerah Kabupaten Demak.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${plusJakarta.variable} ${ibmPlexMono.variable}`}>
      <body className="font-sans bg-slate-50 text-slate-900 antialiased" suppressHydrationWarning>
        <ToastProvider>
          <AppProvider>{children}</AppProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Inter, Manrope, Tajawal } from 'next/font/google';
import './globals.css';
import { DemoScenarioBanner, DemoSessionProvider } from '@/components/demo-showroom';
const manrope = Manrope({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-arabic',
  display: 'swap',
});
export const metadata: Metadata = {
  title: { default: 'NASJ | نسج', template: '%s · NASJ' },
  description:
    'NASJ connects companies with rural women artisans and the associations that support them.',
  robots: { index: false, follow: false },
  icons: { icon: '/brand/nasj-mark.png' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (custom cursors, translators, password managers) inject attributes
    // into <html>/<body> before hydration; this only silences those two elements, not children.
    <html
      lang="en"
      className={`${manrope.variable} ${inter.variable} ${tajawal.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {process.env.DEMO_MODE === 'true' ? (
          <DemoSessionProvider>
            <DemoScenarioBanner />
            {children}
          </DemoSessionProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}

import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { BRAND_NAME } from '@/lib/constants';

export const metadata = {
  title: { default: `${BRAND_NAME} – Bus tickets`, template: `%s · ${BRAND_NAME}` },
  description: 'Book bus seats online and manage fleet operations.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f1b2d',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

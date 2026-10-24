import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import QueryProvider from '@/components/shared/QueryProvider';
import { AuthProvider } from '@/lib/auth/useAuth';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'FormCraft – Digital Form Builder & Management Platform',
  description: 'FormCraft – Open-source digital form builder and management platform. Create, share, and analyze beautiful online forms, surveys, and quizzes with ease.',
  icons: {
    icon: '/logo.png',
  },
  keywords: ['FormCraft', 'Digital Form Builder', 'Management Platform', 'surveys', 'quizzes', 'analytics'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 antialiased font-sans">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

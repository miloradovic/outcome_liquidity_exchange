import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import { TopNav } from '@/components/navigation/top-nav';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'OLX Web',
  description: 'Outcome Liquidity Exchange demo UI',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps): ReactElement {
  return (
    <html lang="en">
      <body>
        <Providers>
          <TopNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
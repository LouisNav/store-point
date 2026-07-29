'use client';
import * as React from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from './theme-toggle';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          classNames: {
            toast: 'rounded-lg shadow-lg border',
          },
        }}
      />
    </ThemeProvider>
  );
}

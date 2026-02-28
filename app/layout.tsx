import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeToggle'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Restaurante Fluido',
  description: 'Sistema integral para restaurantes',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          const t = localStorage.getItem('rf_theme') || 'dark';
          document.documentElement.setAttribute('data-theme', t);
          const btn = document.getElementById('theme-toggle-btn');
          if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
        ` }} />
      </body>
    </html>
  )
}

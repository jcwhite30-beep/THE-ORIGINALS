import type { Metadata } from 'next'
import { Rajdhani } from 'next/font/google'
import './globals.css'

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rajdhani',
})

export const metadata: Metadata = {
  title: 'The Originals — Guild Management',
  description: 'Tales of Pirates guild point tracking system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={rajdhani.variable}>
      <body className="antialiased">{children}</body>
    </html>
  )
}

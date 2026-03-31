import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LSRW Assessment | Mystery Island',
  description: 'Interactive Listening, Speaking, Reading & Writing assessment for Class 7 students.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

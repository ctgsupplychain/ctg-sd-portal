import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CTG Supply Chain Portal',
  description: 'Supply & Demand Management Portal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "var(--font-body)" }}>
        {children}
      </body>
    </html>
  )
}

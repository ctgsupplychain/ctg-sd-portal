'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

/**
 * Back to S&D button — reads last active brand from sessionStorage
 * (written by project/[id]/page.tsx on mount). Falls back to dashboard.
 */
export default function BackToSD() {
  const router = useRouter()

  function handleBack() {
    const brand = sessionStorage.getItem('ctg_last_brand')
    router.push(brand ? `/project/${encodeURIComponent(brand)}` : '/dashboard')
  }

  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2.5 py-1.5 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
    >
      <ArrowLeft size={13} />
      Back to S&amp;D
    </button>
  )
}

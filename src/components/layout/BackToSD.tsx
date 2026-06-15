'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'

/**
 * Back to S&D button — reads last active brand from sessionStorage
 * (written by project/[id]/page.tsx on mount). Falls back to dashboard.
 */
export default function BackToSD() {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)

  function handleBack() {
    const brand = sessionStorage.getItem('ctg_last_brand')
    router.push(brand ? `/project/${encodeURIComponent(brand)}` : '/dashboard')
  }

  return (
    <button
      onClick={handleBack}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
      style={{
        color: hovered ? '#1F2937' : '#4B5563',
        borderColor: '#E4DDD3',
        background: hovered ? '#E4DDD3' : '#F4F2EE',
      }}
    >
      <ArrowLeft size={13} />
      Back to S&D
    </button>
  )
}

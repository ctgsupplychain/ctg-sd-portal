'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import { FLAG_DISPLAY } from '@/lib/sd-compute'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [brands, setBrands] = useState<string[]>([])
  const [summary, setSummary] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)

    const isAdmin = prof?.role === 'admin' || prof?.role === 'supply_chain'
    if (!isAdmin) { router.push('/project/SkinDae'); return }

    const { data: skuData } = await supabase.from('master_sku').select('brand, sku, avg_selling_price, safety_stock, moq, lead_time_wk').eq('status', 'Active')
    const uniqueBrands = [...new Set(skuData?.map((s: any) => s.brand) || [])].sort((a, b) => (a as string).localeCompare(b as string)) as string[]
    setBrands(uniqueBrands)

    // Build summary per brand
    const { data: stockData } = await supabase.from('stock_snapshot').select('master_sku, usable_qty, report_date').order('report_date', { ascending: false })
    const latestStock: Record<string, { qty: number, date: string }> = {}
    stockData?.forEach((s: any) => { if (!latestStock[s.master_sku]) latestStock[s.master_sku] = { qty: s.usable_qty, date: s.report_date } })

    const { data: supplyData } = await supabase.from('supply_input').select('sku, qty, status, receipt_wk')

    const brandSummary = uniqueBrands.map(brand => {
      const brandSkus = skuData?.filter((s: any) => s.brand === brand) || []
      const totalOnHand = brandSkus.reduce((sum: number, s: any) => sum + (latestStock[s.sku]?.qty || 0), 0)
      const openPOs = supplyData?.filter((s: any) => brandSkus.find((b: any) => b.sku === s.sku) && s.status === 'Commit').reduce((sum: number, s: any) => sum + s.qty, 0) || 0
      const skuCount = brandSkus.length
      return { brand, totalOnHand, openPOs, skuCount, stockDate: Object.values(latestStock)[0]?.date }
    })
    setSummary(brandSummary)
    setLoading(false)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F0F2F5]">
      <Sidebar userEmail={profile?.email} userName={profile?.full_name} userRole={profile?.role} brands={brands} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-[#EAECF0] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-[#101828]">Dashboard</h1>
            <span className="bg-[#F2F4F7] text-[#667085] text-xs px-2.5 py-1 rounded-full">All Brands</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sm text-[#667085]">Loading...</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-[#EAECF0] p-4">
                  <div className="text-xs text-[#667085] mb-1">Active Brands</div>
                  <div className="text-2xl font-semibold text-[#101828]">{brands.length}</div>
                </div>
                <div className="bg-white rounded-xl border border-[#EAECF0] p-4">
                  <div className="text-xs text-[#667085] mb-1">Total Active SKUs</div>
                  <div className="text-2xl font-semibold text-[#101828]">{summary.reduce((a, b) => a + b.skuCount, 0)}</div>
                </div>
                <div className="bg-white rounded-xl border border-[#EAECF0] p-4">
                  <div className="text-xs text-[#667085] mb-1">Open POs (Commit)</div>
                  <div className="text-2xl font-semibold text-[#101828]">{summary.reduce((a, b) => a + b.openPOs, 0).toLocaleString()}</div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-[#EAECF0] overflow-hidden">
                <div className="px-5 py-4 border-b border-[#EAECF0]">
                  <h2 className="text-sm font-semibold text-[#344054]">Brand Summary</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F9FAFB] border-b border-[#EAECF0]">
                      {['Brand','SKUs','Total On-Hand','Open PO (Commit)','Action'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-medium text-[#667085]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row, i) => (
                      <tr key={row.brand} className={i % 2 === 0 ? 'bg-white' : 'bg-[#F9FAFB]'}>
                        <td className="px-5 py-3 font-medium text-[#101828]">{row.brand}</td>
                        <td className="px-5 py-3 text-[#667085]">{row.skuCount}</td>
                        <td className="px-5 py-3 text-[#344054]">{row.totalOnHand.toLocaleString()}</td>
                        <td className="px-5 py-3 text-[#1849A9] font-medium">{row.openPOs.toLocaleString()}</td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => router.push(`/project/${encodeURIComponent(row.brand)}`)}
                            className="text-xs text-[#048A81] font-medium hover:underline"
                          >
                            View S&D →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'
import { useMemo, useRef, useEffect, useState } from 'react'
import clsx from 'clsx'
import type { SkuSdResult, WeekInfo } from '@/lib/sd-compute'
import { FLAG_DISPLAY } from '@/lib/sd-compute'

interface SDTableProps {
  skus: SkuSdResult[]
  weeks: WeekInfo[]
  currentWk: string
  selectedSku: string
  onSkuChange: (sku: string) => void
}

function fmt(n: number): string {
  if (n === 0) return '0'
  if (n < 0) return `(${Math.abs(n).toLocaleString()})`
  return n.toLocaleString()
}

function fmtRm(n: number): string {
  return n > 0 ? n.toLocaleString() : '—'
}

export default function SDTable({ skus, weeks, currentWk, selectedSku, onSkuChange }: SDTableProps) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const sortedSkus = useMemo(() =>
    [...skus].sort((a, b) => (a.sku.description || '').localeCompare(b.sku.description || '')), [skus])

  const filteredSkus = useMemo(() =>
    search.trim() === '' ? sortedSkus : sortedSkus.filter(s =>
      s.sku.sku.toLowerCase().includes(search.toLowerCase()) ||
      (s.sku.description || '').toLowerCase().includes(search.toLowerCase())
    ), [sortedSkus, search])

  const current = skus.find(s => s.sku.sku === selectedSku) || skus[0]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!current) return null

  const selectedLabel = `${current.sku.sku} — ${(current.sku.description || '').slice(0, 45)}`
  const flag = FLAG_DISPLAY[current.flag]

  const monthSpans: { label: string; count: number }[] = []
  let curMon = ''
  let curCount = 0
  weeks.forEach(w => {
    if (w.monthLabel !== curMon) {
      if (curMon) monthSpans.push({ label: curMon, count: curCount })
      curMon = w.monthLabel
      curCount = 1
    } else {
      curCount++
    }
  })
  if (curMon) monthSpans.push({ label: curMon, count: curCount })

  return (
    <div className="flex flex-col gap-3">

      {/* SKU selector row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div ref={dropdownRef} className="relative w-[500px]">
          <button
            type="button"
            onClick={() => { setOpen(o => !o); setSearch('') }}
            className="w-full text-left text-sm px-3 py-1.5 border border-[#D0D5DD] rounded-lg bg-white text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#048A81] flex items-center justify-between gap-2"
          >
            <span className="truncate text-sm">{selectedLabel}</span>
            <svg className="w-4 h-4 text-[#667085] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {open && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-[#D0D5DD] rounded-lg shadow-lg">
              <div className="p-2 border-b border-[#EAECF0]">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search SKU or description..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full text-sm px-3 py-1.5 border border-[#D0D5DD] rounded-md focus:outline-none focus:ring-2 focus:ring-[#048A81]"
                />
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                {filteredSkus.length === 0 && (
                  <li className="px-3 py-2 text-sm text-[#667085]">No results</li>
                )}
                {filteredSkus.map(s => (
                  <li
                    key={s.sku.sku}
                    onClick={() => { onSkuChange(s.sku.sku); setOpen(false); setSearch('') }}
                    className={clsx(
                      'px-3 py-2 text-sm cursor-pointer hover:bg-[#F9FAFB]',
                      s.sku.sku === selectedSku ? 'bg-[#F0FAF9] text-[#048A81] font-medium' : 'text-[#101828]'
                    )}
                  >
                    {s.sku.sku} — {(s.sku.description || '').slice(0, 50)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <span className="text-xs text-[#667085] bg-[#F2F4F7] px-2.5 py-1 rounded-full">
          {current.sku.uom || 'Unit'} · MOQ {(current.sku.moq || 0).toLocaleString()} · LT {current.sku.leadTimeWk || 0} wks
        </span>
        <span className="ml-auto text-sm font-semibold" style={{ color: flag.color }}>
          {flag.emoji} {flag.label}
        </span>
        <span className="text-sm text-[#667085]">WoC: <b>{current.weeksOfCover}</b> wks</span>
      </div>

      {/* Table */}
      <div className="border border-[#EAECF0] rounded-xl overflow-hidden overflow-x-auto">
        <table className="text-xs border-collapse" style={{ minWidth: `${100 + weeks.length * 70}px` }}>
          <thead>
            <tr>
              <th className="bg-[#F9FAFB] border-b border-r border-[#EAECF0] px-3 py-2 text-left text-[#667085] font-medium w-28 sticky left-0 z-10">Row</th>
              {monthSpans.map(span => (
                <th key={span.label} colSpan={span.count}
                  className="bg-[#048A81] text-white text-center px-2 py-1.5 font-semibold border-r border-white/20 text-xs tracking-wide">
                  {span.label}
                </th>
              ))}
            </tr>
            <tr>
              <th className="bg-[#F9FAFB] border-b border-r border-[#EAECF0] px-3 py-2 sticky left-0 z-10"></th>
              {weeks.map(w => (
                <th key={w.label} className={clsx(
                  'text-center px-2 py-1.5 font-semibold text-xs border-b border-r border-[#EAECF0] min-w-[68px]',
                  w.label === currentWk ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#2E4057] text-white'
                )}>
                  <div>{w.label}</div>
                  <div className="font-normal text-[10px] opacity-70">{w.mondayDate.slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SDRow label="Forecast RM'000" values={current.weeks.map(w => fmtRm(w.forecastRm))} weeks={weeks} currentWk={currentWk} rowStyle="fcast" />
            <SDRow label="Forecast Qty" values={current.weeks.map(w => fmt(w.forecastQty))} weeks={weeks} currentWk={currentWk} rowStyle="qty" />
            <SDRow label="Supply (Uncommit)" values={current.weeks.map(w => fmt(w.supplyUncommit))} weeks={weeks} currentWk={currentWk} rowStyle="uncommit" />
            <SDRow label="Supply (Commit)" values={current.weeks.map(w => fmt(w.supplyCommit))} weeks={weeks} currentWk={currentWk} rowStyle="commit" />
            <SDRow label="Balance" values={current.weeks.map(w => fmt(w.balance))} weeks={weeks} currentWk={currentWk} rowStyle="balance" balanceValues={current.weeks.map(w => w.balance)} />
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[10px] text-[#667085]">
        {[
          { color: '#1A2535', label: 'Balance' },
          { color: '#1849A9', label: 'Supply commit' },
          { color: '#B42318', label: 'Negative balance' },
          { color: '#FEC84B', label: 'Current week', opacity: '0.7' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: l.color, opacity: l.opacity }}></span>
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

type RowStyle = 'fcast' | 'qty' | 'commit' | 'uncommit' | 'balance'

function SDRow({ label, values, weeks, currentWk, rowStyle, balanceValues }: {
  label: string; values: string[]; weeks: WeekInfo[]
  currentWk: string; rowStyle: RowStyle; balanceValues?: number[]
}) {
  const rowBg: Record<RowStyle, string> = { fcast: 'bg-[#F5F5F5]', qty: 'bg-[#F0FAF0]', commit: 'bg-[#EFF6FF]', uncommit: 'bg-[#FFF7ED]', balance: 'bg-[#1A2535]' }
  const labelColor: Record<RowStyle, string> = { fcast: 'text-[#667085]', qty: 'text-[#667085]', commit: 'text-[#667085]', uncommit: 'text-[#667085]', balance: 'text-[#9DB4CC]' }
  const cellColor: Record<RowStyle, string> = { fcast: 'text-[#344054]', qty: 'text-[#344054]', commit: 'text-[#1849A9] font-medium', uncommit: 'text-[#B45309]', balance: 'text-white font-semibold' }

  return (
    <tr>
      <td className={clsx('px-3 py-1.5 font-medium text-xs border-b border-r border-[#EAECF0] sticky left-0 z-10 w-28', rowBg[rowStyle], labelColor[rowStyle])}>{label}</td>
      {weeks.map((w, i) => {
        const isCurrent = w.label === currentWk
        const isNeg = rowStyle === 'balance' && balanceValues && balanceValues[i] < 0
        return (
          <td key={w.label} className={clsx(
            'text-center px-1.5 py-1.5 border-b border-r border-[#EAECF0] text-xs tabular-nums',
            rowBg[rowStyle], cellColor[rowStyle],
            isCurrent && rowStyle !== 'balance' && 'bg-[#FFFBEB]',
            isCurrent && rowStyle === 'balance' && 'bg-[#2E3D50]',
            isNeg && '!text-[#FDA29B]'
          )}>
            {values[i]}
          </td>
        )
      })}
    </tr>
  )
}

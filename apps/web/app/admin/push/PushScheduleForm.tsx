'use client'

import { useRef, useState } from 'react'

import { savePushSchedule } from './actions'

interface Org {
  id: string
  name: string
}

interface Schedule {
  id: string
  slot: number
  send_time: string
  title: string
  body: string
  is_active: boolean
}

interface Props {
  schedule: Schedule
  orgs: Org[]
  selectedOrgIds: string[]
}

export default function PushScheduleForm({ schedule, orgs, selectedOrgIds }: Props) {
  const [isActive, setIsActive] = useState(schedule.is_active)
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedOrgIds))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function toggleOrg(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(orgs.map(o => o.id)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formRef.current) return
    setSaving(true)
    setSaved(false)
    setError(null)

    const fd = new FormData(formRef.current)
    fd.set('is_active', isActive ? 'true' : 'false')
    // 선택된 org_ids 추가
    fd.delete('org_ids')
    selected.forEach(id => fd.append('org_ids', id))

    const result = await savePushSchedule(fd)
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <input type="hidden" name="slot" value={schedule.slot} />

      {/* 헤더 */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-bold text-gray-700">슬롯 {schedule.slot}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setIsActive(v => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-brand-600' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        <span className="text-xs text-gray-500">{isActive ? '활성' : '비활성'}</span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* 발송 시간 */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500 w-20 shrink-0">발송 시간</label>
          <input
            type="time"
            name="send_time"
            defaultValue={schedule.send_time}
            className="bg-gray-100 rounded px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* 제목 */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500 w-20 shrink-0">제목</label>
          <input
            type="text"
            name="title"
            defaultValue={schedule.title}
            className="flex-1 bg-gray-100 rounded px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* 내용 */}
        <div className="flex gap-3">
          <label className="text-sm text-gray-500 w-20 shrink-0 pt-1">내용</label>
          <textarea
            name="body"
            defaultValue={schedule.body}
            rows={2}
            className="flex-1 bg-gray-100 rounded px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* 업체 선택 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-gray-500">대상 업체</span>
            <button type="button" onClick={selectAll} className="text-xs text-brand-600 hover:underline">전체선택</button>
            <button type="button" onClick={clearAll} className="text-xs text-gray-400 hover:underline">전체해제</button>
            <span className="text-xs text-gray-400">{selected.size}/{orgs.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
            {orgs.map(org => (
              <label key={org.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(org.id)}
                  onChange={() => toggleOrg(org.id)}
                  className="accent-brand-600"
                />
                <span className="text-xs text-gray-700 truncate">{org.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 하단 */}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50">
        {error && <span className="text-xs text-red-500 flex-1">{error}</span>}
        {saved && <span className="text-xs text-green-600 flex-1">저장됐어요</span>}
        {!error && !saved && <span className="flex-1" />}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </form>
  )
}

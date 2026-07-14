'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import WaitingQrCode from './WaitingQrCode'

// admin member detail form
interface Props {
  orgId: string
  isEdit: boolean
  isSupplier: boolean
  org: { name: string }
  contacts: { name: string | null; phone: string | null } | null
  rest: { id?: string | null; biz_no: string | null; settlement_cycle?: string | null; waiting_enabled?: boolean | null } | null
  memberEmail?: string | null
}

const F = ({ children }: { children: React.ReactNode }) => (
  <span className="flex-1 bg-gray-100 px-3 py-1.5 rounded text-sm text-gray-800">{children || '-'}</span>
)
const I = ({ name, defaultValue, type = 'text', disabled }: { name: string; defaultValue?: string; type?: string; disabled?: boolean }) => (
  <input name={name} type={type} defaultValue={defaultValue ?? ''} disabled={disabled}
    className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 border-0 disabled:opacity-50" />
)

export default function MemberFormClient({ orgId, isEdit, isSupplier, org, contacts, rest, memberEmail }: Props) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [emailEdit, setEmailEdit] = useState(false)
  const [newEmail, setNewEmail] = useState(memberEmail ?? '')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')
  const [waitingEnabled, setWaitingEnabled] = useState(rest?.waiting_enabled ?? false)
  const [togglingWaiting, setTogglingWaiting] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  async function toggleWaiting() {
    const newVal = !waitingEnabled
    setTogglingWaiting(true)
    try {
      const res = await fetch(`/api/admin/members/${orgId}`, {
        method: 'PUT',
        body: JSON.stringify({ waiting_enabled: newVal }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('변경 실패')
      setWaitingEnabled(newVal)
    } catch {
      alert('웨이팅 설정 변경에 실패했습니다.')
    } finally {
      setTogglingWaiting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isEdit) return
    setIsLoading(true)
    const formData = new FormData(e.currentTarget)
    try {
      const res = await fetch(`/api/admin/members/${orgId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: formData.get('name'),
          contact_name: formData.get('contact_name'),
          phone: formData.get('phone'),
          biz_no: formData.get('biz_no'),
          settlement_cycle: formData.get('settlement_cycle'),
          waiting_enabled: !isSupplier ? waitingEnabled : undefined,
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || '수정 실패')
      }
      router.push(`/admin/members/${orgId}`)
      router.refresh()
    } catch (err: unknown) {
      alert(`정보 수정 실패: ${err instanceof Error ? err.message : '오류'}`)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleEmailChange() {
    if (!newEmail.includes('@')) { setEmailMsg('올바른 이메일 형식이 아닙니다'); return }
    setEmailLoading(true)
    setEmailMsg('')
    try {
      const res = await fetch(`/api/admin/members/${orgId}/email`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? '변경 실패')
      setEmailMsg('✅ 이메일이 변경되었습니다')
      setEmailEdit(false)
      router.refresh()
    } catch (err: unknown) {
      setEmailMsg(err instanceof Error ? err.message : '오류')
    } finally {
      setEmailLoading(false)
    }
  }

  const cycle = rest?.settlement_cycle ?? 'weekly'

  return (
    <div className="space-y-3">
      {/* 기본 정보 폼 */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 shrink-0">제목:</span>
            {isEdit ? <I name="name" defaultValue={org.name} disabled={isLoading} /> : <F>{org.name}</F>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 shrink-0">대표자:</span>
            {isEdit ? <I name="contact_name" defaultValue={contacts?.name ?? ''} disabled={isLoading} /> : <F>{contacts?.name ?? ''}</F>}
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <span className="text-sm text-gray-500 shrink-0">주소:</span>
          <span className="flex-1 bg-gray-100 px-3 py-1.5 rounded text-sm text-gray-400">(관리자 문의)</span>
        </div>

        <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 shrink-0">전화번호:</span>
            {isEdit ? <I name="phone" defaultValue={contacts?.phone ?? ''} type="tel" disabled={isLoading} /> : <F>{contacts?.phone ?? ''}</F>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 shrink-0">휴대폰:</span>
            <span className="flex-1 bg-gray-100 px-3 py-1.5 rounded text-sm text-gray-400">-</span>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
          <span className="text-sm text-gray-500 shrink-0 pt-2">사업자번호:</span>
          {isEdit
            ? <input name="biz_no" defaultValue={rest?.biz_no ?? ''} placeholder="000-00-00000" disabled={isLoading}
                className="flex-1 h-16 bg-gray-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 border-0 disabled:opacity-50" />
            : <div className="flex-1 h-16 bg-gray-100 rounded px-3 py-2 flex items-center text-sm text-gray-800">{rest?.biz_no ?? '-'}</div>
          }
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <span className="text-sm text-gray-500 shrink-0">계산서 이메일:</span>
          <span className="flex-1 bg-gray-100 px-3 py-1.5 rounded text-sm text-gray-400">-</span>
        </div>

        {/* 정산 주기 */}
        <div className="flex items-center gap-4 px-5 py-4">
          <span className="text-sm text-gray-500 shrink-0">정산 주기:</span>
          {isEdit ? (
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="settlement_cycle" value="weekly"
                  defaultChecked={cycle === 'weekly'}
                  className="accent-brand-600" />
                <span className="font-medium">주정산</span>
                <span className="text-gray-400 text-xs">— 월~토 마감</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="settlement_cycle" value="monthly"
                  defaultChecked={cycle === 'monthly'}
                  className="accent-brand-600" />
                <span className="font-medium">월정산</span>
                <span className="text-gray-400 text-xs">— 매월 말 마감</span>
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1.5 rounded text-sm font-semibold ${
                cycle === 'weekly' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {cycle === 'weekly' ? '주정산 (월~토)' : '월정산'}
              </span>
              <span className="text-xs text-gray-400">(수정하려면 편집 버튼 클릭)</span>
            </div>
          )}
        </div>

        {/* 웨이팅 활성화 — 매출 업체만, 즉시 토글 */}
        {!isSupplier && (
          <div className="flex items-center gap-4 px-5 py-4 border-t border-gray-100">
            <span className="text-sm text-gray-500 shrink-0">웨이팅 기능:</span>
            <button
              type="button"
              onClick={toggleWaiting}
              disabled={togglingWaiting}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                waitingEnabled ? 'bg-green-500' : 'bg-gray-200'
              } disabled:opacity-50`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                waitingEnabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
            <span className={`text-sm font-semibold ${waitingEnabled ? 'text-green-600' : 'text-gray-400'}`}>
              {togglingWaiting ? '변경 중...' : waitingEnabled ? '활성화됨' : '비활성화됨'}
            </span>
          </div>
        )}

        <div className="flex justify-center gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50">
          {isEdit ? (
            <>
              <button type="submit" disabled={isLoading}
                className="rounded-lg bg-brand-600 text-white px-8 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
                {isLoading ? '저장 중...' : '확인'}
              </button>
              <button type="button" disabled={isLoading}
                onClick={() => { router.push(`/admin/members/${orgId}`); router.refresh() }}
                className="rounded-lg border border-gray-300 text-gray-700 px-8 py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
                취소
              </button>
            </>
          ) : (
            <>
              <a href="/admin/members"
                className="rounded-lg bg-gray-200 text-gray-600 px-8 py-2.5 text-sm font-semibold hover:bg-gray-300">목록</a>
              <button type="button"
                onClick={() => { router.push(`/admin/members/${orgId}?mode=edit`); router.refresh() }}
                className="rounded-lg bg-brand-600 text-white px-8 py-2.5 text-sm font-semibold hover:bg-brand-700">
                수정
              </button>
            </>
          )}
        </div>
      </form>

      {/* 로그인 이메일(아이디) 수정 — 관리자 전용 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button type="button" onClick={() => { setEmailEdit(p => !p); setEmailMsg('') }}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 text-left">
          <div>
            <span className="text-sm font-semibold text-gray-700">로그인 아이디(이메일) 변경</span>
            {memberEmail && <span className="ml-2 text-xs text-gray-400">{memberEmail}</span>}
          </div>
          <span className="text-xs text-brand-600 font-medium">{emailEdit ? '닫기' : '변경하기'}</span>
        </button>
        {emailEdit && (
          <div className="px-5 pb-4 pt-2 border-t border-gray-100 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 shrink-0 w-20">새 이메일</span>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="새 이메일 주소 입력"
                className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 border-0" />
            </div>
            {emailMsg && (
              <p className={`text-xs ${emailMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{emailMsg}</p>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={handleEmailChange} disabled={emailLoading}
                className="rounded-lg bg-brand-600 text-white px-6 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
                {emailLoading ? '변경 중...' : '변경'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 웨이팅 QR 코드 — 활성화된 매출 업체만, 접이식 */}
      {!isSupplier && waitingEnabled && rest?.id && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button type="button" onClick={() => setQrOpen(p => !p)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 text-left">
            <div>
              <span className="text-sm font-semibold text-gray-700">웨이팅 QR 코드</span>
              <span className="ml-2 text-xs text-gray-400">업장 배포용</span>
            </div>
            <span className="text-xs text-brand-600 font-medium">{qrOpen ? '닫기' : '코드 보기'}</span>
          </button>
          {qrOpen && (
            <div className="border-t border-gray-100 py-5">
              <WaitingQrCode restaurantId={rest.id} restaurantName={org.name} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

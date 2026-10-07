'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// 웨이팅 신청은 메인 시스템이 아니라 별도 프로젝트(QR 현장 등록 전용)를 쓴다.
// DefaultWaitingForm 과 같은 프로젝트·테이블이고, 디자인만 다르다.
const waitingSupabase = createClient(
  'https://atzmpmnuibsrkkvpwsfy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0em1wbW51aWJzcmtrdnB3c2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTgxMzYsImV4cCI6MjA5NzYzNDEzNn0.OtlpMz5GMONGPVbGFcpzqDZQtMGsl8niWdeZI5sAB5w'
)

// 할매솥뚜껑삼겹살 매장 전용 톤앤매너 (2026-10-07, 매장 QR 대기등록 보드 디자인에 맞춤).
const RED = '#c21627'
const INK = '#221210'
const CREAM = '#faf4e6'

const styles = {
  container: { minHeight: '100vh', backgroundColor: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } as React.CSSProperties,
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 420,
    border: `3px solid ${INK}`, boxShadow: '0 6px 24px rgba(34,18,16,0.12)',
  } as React.CSSProperties,
  logo: { display: 'block', margin: '0 auto 18px', width: '100%', maxWidth: 260, height: 'auto' } as React.CSSProperties,
  branch: { textAlign: 'center', fontSize: 22, fontWeight: 800, color: RED, marginBottom: 4, letterSpacing: '-0.02em' } as React.CSSProperties,
  title: { textAlign: 'center', fontSize: 17, fontWeight: 700, color: INK, marginBottom: 24 } as React.CSSProperties,
  desc: { textAlign: 'center', fontSize: 14, color: '#5c4a44', marginBottom: 0, lineHeight: 1.7 } as React.CSSProperties,
  field: { marginBottom: 16 } as React.CSSProperties,
  label: { display: 'block', fontSize: 14, fontWeight: 700, color: INK, marginBottom: 6 } as React.CSSProperties,
  input: {
    width: '100%', border: `1.5px solid ${INK}33`, backgroundColor: CREAM, borderRadius: 10,
    padding: '11px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box', color: INK,
  } as React.CSSProperties,
  error: { color: RED, fontSize: 13, marginTop: 8, textAlign: 'center', fontWeight: 600 } as React.CSSProperties,
  btn: {
    width: '100%', backgroundColor: RED, color: '#fff', border: 'none', borderRadius: 10,
    padding: '15px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', marginTop: 8, letterSpacing: '-0.01em',
  } as React.CSSProperties,
  notice: {
    textAlign: 'center', fontSize: 12.5, color: RED, fontWeight: 700, marginTop: 18,
    backgroundColor: '#fdeceb', borderRadius: 8, padding: '10px 12px', lineHeight: 1.6,
  } as React.CSSProperties,
}

export default function HanmaeWaitingForm({ restaurantId, branchName }: { restaurantId: string; branchName: string }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [partySize, setPartySize] = useState('2')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return setError('이름과 전화번호를 입력해주세요.')
    setLoading(true)
    setError('')
    const { error: err } = await waitingSupabase.from('waiting_entries').insert({
      restaurant_id: restaurantId,
      name: name.trim(),
      phone: phone.trim(),
      party_size: Number(partySize) || 1,
    })
    setLoading(false)
    if (err) setError('신청 중 오류가 발생했습니다. 다시 시도해주세요.')
    else setDone(true)
  }

  if (done) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/waiting/hanmae-logo.png" alt="할매솥뚜껑 흑돼지 삼겹살" style={styles.logo} />
          <h2 style={styles.branch}>{branchName}</h2>
          <div style={{ fontSize: 44, textAlign: 'center', margin: '8px 0 16px' }}>✅</div>
          <h2 style={styles.title}>대기 접수 완료</h2>
          <p style={styles.desc}>
            자리가 나면 카카오톡으로 연락드립니다.<br />잠시만 기다려 주세요.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/waiting/hanmae-logo.png" alt="할매솥뚜껑 흑돼지 삼겹살" style={styles.logo} />
        <h2 style={styles.branch}>{branchName}</h2>
        <h1 style={styles.title}>대기 등록</h1>
        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label}>이름</label>
            <input style={styles.input} type="text" placeholder="이름을 입력하세요" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>전화번호</label>
            <input style={styles.input} type="tel" placeholder="010-0000-0000" value={phone} onChange={e => setPhone(e.target.value)} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>인원수</label>
            <select style={styles.input} value={partySize} onChange={e => setPartySize(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}명</option>)}
            </select>
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? '처리 중...' : '대기 등록하기'}
          </button>
        </form>
        <p style={styles.notice}>호출 후 5분 이내에 오시지 않으면<br />대기 등록이 자동 취소되니 유의해 주세요.</p>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const waitingSupabase = createClient(
  'https://atzmpmnuibsrkkvpwsfy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0em1wbW51aWJzcmtrdnB3c2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTgxMzYsImV4cCI6MjA5NzYzNDEzNn0.OtlpMz5GMONGPVbGFcpzqDZQtMGsl8niWdeZI5sAB5w'
)

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } as React.CSSProperties,
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' } as React.CSSProperties,
  logo: { textAlign: 'center', fontSize: 24, fontWeight: 700, color: '#16a34a', marginBottom: 8 } as React.CSSProperties,
  title: { textAlign: 'center', fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 24 } as React.CSSProperties,
  desc: { textAlign: 'center', fontSize: 14, color: '#6b7280', marginBottom: 0, lineHeight: 1.7 } as React.CSSProperties,
  field: { marginBottom: 16 } as React.CSSProperties,
  label: { display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 } as React.CSSProperties,
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties,
  error: { color: '#ef4444', fontSize: 13, marginTop: 8, textAlign: 'center' } as React.CSSProperties,
  btn: { width: '100%', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8 } as React.CSSProperties,
}

export default function WaitingPage({ params }: { params: { restaurantId: string } }) {
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
      restaurant_id: params.restaurantId,
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
          <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>✅</div>
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
        <h1 style={styles.logo}>🍊 FruitLife</h1>
        <h2 style={styles.title}>웨이팅 신청</h2>
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
            {loading ? '처리 중...' : '웨이팅 신청하기'}
          </button>
        </form>
      </div>
    </div>
  )
}

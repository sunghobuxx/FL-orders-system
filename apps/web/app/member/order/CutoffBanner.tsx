'use client'

import { useState } from 'react'

export default function CutoffBanner({ initialKstMinutes }: { initialKstMinutes: number }) {
  const [minutes] = useState(initialKstMinutes)

  if (minutes >= 90 && minutes < 120) {
    return (
      <div className="rounded-lg bg-yellow-50 border border-yellow-300 px-4 py-3 text-sm text-yellow-800">
        ⏰ <strong>발주 마감 {120 - minutes}분 전</strong>입니다. 02:00 이전에 발주를 완료해주세요.
      </div>
    )
  }

  if (minutes >= 120 && minutes < 240) {
    return (
      <div className="rounded-lg bg-orange-50 border border-orange-300 px-4 py-3 text-sm text-orange-800">
        🕑 <strong>마감 후 발주</strong> (02:00 기준 {minutes - 120}분 초과) — 오늘 자동발송은 이미 완료됐습니다. 관리자가 확인 후 수동 처리합니다.
      </div>
    )
  }

  return null
}

'use client'

import { useEffect } from 'react'

export default function AutoPrint() {
  useEffect(() => {
    // 폰트/이미지 로드 후 프린트 다이얼로그 호출
    const timer = setTimeout(() => {
      window.print()
    }, 400)
    return () => clearTimeout(timer)
  }, [])
  return null
}

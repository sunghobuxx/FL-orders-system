'use client'

import { useRef } from 'react'
import QRCode from 'react-qr-code'

interface Props {
  restaurantId: string
  restaurantName: string
}

export default function WaitingQrCode({ restaurantId, restaurantName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const url = `https://order.fruitlife.shop/waiting/${restaurantId}`

  function downloadSvg() {
    const svg = containerRef.current?.querySelector('svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([svgData], { type: 'image/svg+xml' })
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `${restaurantName}-웨이팅QR.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  }

  function copyUrl() {
    navigator.clipboard.writeText(url)
      .then(() => alert('URL이 복사되었습니다.'))
      .catch(() => alert('복사 실패'))
  }

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="flex justify-center">
        <div className="p-5 bg-white border-2 border-gray-200 rounded-xl shadow-sm">
          <QRCode value={url} size={180} />
        </div>
      </div>
      <p className="text-xs text-center text-gray-400 break-all px-4">{url}</p>
      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={downloadSvg}
          className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700"
        >
          SVG 다운로드
        </button>
        <button
          type="button"
          onClick={copyUrl}
          className="rounded-lg border border-gray-300 text-gray-700 px-5 py-2 text-sm font-semibold hover:bg-gray-50"
        >
          URL 복사
        </button>
      </div>
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'

export const runtime = 'edge'

export const metadata: Metadata = {
  title: '고객지원 | FruitLife',
  description: 'FruitLife 주문·발주 앱 고객지원 안내',
}

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-800">
      <article className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-10">
        <p className="text-sm font-bold tracking-widest text-green-600">FRUIT LIFE</p>
        <h1 className="mt-2 text-2xl font-extrabold text-gray-950 md:text-3xl">주문·발주 앱 고객지원</h1>
        <p className="mt-4 text-sm leading-7 text-gray-600">
          앱 이용 중 로그인, 주문, 발주, 웨이팅, 명세서 또는 정산 관련 도움이 필요한 경우 아래 방법으로 문의해 주세요.
        </p>

        <div className="mt-8 space-y-5 text-sm leading-7">
          <section className="rounded-xl bg-gray-50 p-5">
            <h2 className="font-bold text-gray-900">앱에서 문의하기</h2>
            <p className="mt-1 text-gray-600">로그인 후 <strong>공지·문의 → 문의하기</strong>에서 내용을 접수할 수 있습니다.</p>
          </section>

          <section className="rounded-xl bg-gray-50 p-5">
            <h2 className="font-bold text-gray-900">전화 문의</h2>
            <a href="tel:01086805475" className="mt-1 inline-block font-semibold text-green-700 hover:underline">
              010-8680-5475
            </a>
          </section>

          <section>
            <h2 className="font-bold text-gray-900">문의 시 알려주실 내용</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-600">
              <li>업체명과 로그인 이메일</li>
              <li>문제가 발생한 메뉴와 시간</li>
              <li>표시된 오류 문구 또는 화면 캡처</li>
            </ul>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 border-t border-gray-200 pt-5 text-sm font-semibold">
          <Link href="/privacy-policy" className="text-green-700 hover:underline">개인정보처리방침</Link>
          <Link href="/account-deletion" className="text-green-700 hover:underline">계정 및 데이터 삭제 안내</Link>
        </div>
      </article>
    </main>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'

export const runtime = 'edge'

export const metadata: Metadata = {
  title: '계정 및 데이터 삭제 요청 | FruitLife',
  description: 'FruitLife 주문·발주 시스템 계정 및 데이터 삭제 요청 안내',
}

export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-800">
      <article className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-10">
        <p className="text-sm font-bold tracking-widest text-green-600">FRUIT LIFE</p>
        <h1 className="mt-2 text-2xl font-extrabold text-gray-950 md:text-3xl">계정 및 데이터 삭제 요청</h1>
        <p className="mt-4 text-sm leading-7 text-gray-600">
          FruitLife 주문·발주 시스템 이용자는 자신의 계정과 관련 개인정보 삭제를 요청할 수 있습니다.
        </p>

        <div className="mt-8 space-y-6 text-sm leading-7">
          <section>
            <h2 className="text-lg font-bold text-gray-900">요청 방법</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-gray-600">
              <li>앱에서 <strong>내 정보 → 문의하기</strong>를 선택합니다.</li>
              <li>문의 내용에 업체명, 로그인 이메일, “계정 및 데이터 삭제 요청”을 적어 제출합니다.</li>
              <li>앱에 로그인할 수 없는 경우 010-8680-5475로 삭제 요청을 접수합니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900">본인 확인과 처리</h2>
            <p className="mt-2 text-gray-600">
              타인의 계정 삭제를 방지하기 위해 업체명, 로그인 이메일 또는 등록 전화번호로 본인 확인을 요청할 수 있습니다. 확인이 완료되면 계정과 서비스 운영에 더 이상 필요하지 않은 개인정보를 삭제합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900">삭제되는 데이터</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-600">
              <li>로그인 계정 및 회원 프로필</li>
              <li>업체 연락처 및 앱 알림 토큰</li>
              <li>문의 및 웨이팅 관련 개인정보</li>
            </ul>
            <p className="mt-2 text-gray-600">
              주문·정산·결제·세금계산 및 분쟁 관련 기록은 관계 법령에 따라 필요한 기간 동안 제한적으로 보관한 후 삭제할 수 있습니다.
            </p>
          </section>
        </div>

        <div className="mt-8 border-t border-gray-200 pt-5">
          <Link href="/privacy-policy" className="font-semibold text-green-700 hover:underline">
            개인정보처리방침 보기
          </Link>
        </div>
      </article>
    </main>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'

export const runtime = 'edge'

export const metadata: Metadata = {
  title: '개인정보처리방침 | FruitLife',
  description: 'FruitLife 주문·발주 시스템 개인정보처리방침',
}

const sections = [
  {
    title: '1. 처리하는 개인정보',
    body: (
      <ul>
        <li>계정 정보: 로그인 이메일, 인증 정보, 계정 식별자</li>
        <li>업체 정보: 업체명, 담당자·대표자명, 전화번호, 휴대폰 번호, 주소, 사업자번호, 계산서 이메일</li>
        <li>서비스 이용 정보: 주문·발주·배송·정산 내역, 공지·문의 내역</li>
        <li>웨이팅 정보: 신청자 이름, 전화번호, 인원수, 접수·호출·입장 상태</li>
        <li>기기 정보: 푸시 알림 토큰, 운영체제 및 알림 수신 상태</li>
        <li>자동 생성 정보: 접속 기록, 오류 기록, 서비스 이용 일시</li>
      </ul>
    ),
  },
  {
    title: '2. 개인정보 이용 목적',
    body: (
      <ul>
        <li>회원 식별, 로그인 및 계정 관리</li>
        <li>상품 주문, 발주, 배송 현황 및 명세서·정산 서비스 제공</li>
        <li>웨이팅 접수, 호출 및 매장 운영 지원</li>
        <li>공지, 문의 답변, 푸시·문자 알림 발송</li>
        <li>서비스 안정성 확보, 오류 확인 및 부정 이용 방지</li>
      </ul>
    ),
  },
  {
    title: '3. 보유 및 이용 기간',
    body: (
      <>
        <p>개인정보는 이용 목적이 달성되거나 계정·데이터 삭제 요청이 처리될 때까지 보유합니다.</p>
        <p>다만 주문, 정산, 결제, 세금계산 및 분쟁 처리 기록은 관계 법령에서 정한 기간 동안 별도로 보관할 수 있으며, 보관 기간이 끝나면 안전한 방법으로 삭제합니다.</p>
      </>
    ),
  },
  {
    title: '4. 개인정보 처리 위탁 및 외부 서비스',
    body: (
      <>
        <p>FruitLife는 서비스 제공을 위해 다음 외부 서비스를 이용할 수 있습니다.</p>
        <ul>
          <li>Supabase: 회원 인증, 데이터베이스, 파일 저장 및 실시간 기능</li>
          <li>Expo: 앱 빌드, 업데이트 및 푸시 알림</li>
          <li>Solapi: 문자 및 알림 메시지 발송</li>
          <li>토스페이먼츠: 전자결제 기능이 사용되는 경우 결제 처리</li>
        </ul>
        <p>외부 서비스에는 기능 수행에 필요한 최소한의 정보만 전달하며, 각 제공자의 시스템이 국외에 위치한 경우 정보가 국외에서 처리될 수 있습니다.</p>
      </>
    ),
  },
  {
    title: '5. 개인정보의 제3자 제공',
    body: <p>FruitLife는 법령에 근거가 있거나 이용자가 동의한 경우를 제외하고 개인정보를 제3자에게 판매하거나 임의로 제공하지 않습니다.</p>,
  },
  {
    title: '6. 이용자의 권리',
    body: (
      <>
        <p>이용자는 개인정보 열람, 정정, 삭제, 처리 정지 및 계정 삭제를 요청할 수 있습니다.</p>
        <p>앱의 <strong>내 정보 → 문의하기</strong> 또는 아래 계정 삭제 요청 페이지를 이용해 주세요.</p>
        <Link href="/account-deletion" className="inline-flex rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700">
          계정 및 데이터 삭제 요청 안내
        </Link>
      </>
    ),
  },
  {
    title: '7. 개인정보 보호 및 파기',
    body: <p>전송 구간 암호화, 접근 권한 제한 및 인증된 관리자 접근 등의 보호조치를 적용합니다. 보유 기간이 끝난 전자적 정보는 복구하기 어려운 방법으로 삭제합니다.</p>,
  },
  {
    title: '8. 아동의 개인정보',
    body: <p>본 서비스는 사업자 및 매장 운영자를 대상으로 하며 만 14세 미만 아동을 대상으로 제공하지 않습니다.</p>,
  },
  {
    title: '9. 개인정보 문의',
    body: (
      <ul>
        <li>서비스명: FruitLife 주문·발주 시스템</li>
        <li>개인정보 처리자: 프루트라이프</li>
        <li>문의 방법: 앱 내 문의하기</li>
        <li>전화: 010-8680-5475</li>
      </ul>
    ),
  },
  {
    title: '10. 방침 변경',
    body: <p>서비스 또는 법령 변경에 따라 본 방침이 수정될 수 있으며, 중요한 변경은 앱 또는 웹사이트의 공지를 통해 안내합니다.</p>,
  },
]

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-800">
      <article className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-10">
        <header className="border-b border-gray-200 pb-6">
          <p className="text-sm font-bold tracking-widest text-green-600">FRUIT LIFE</p>
          <h1 className="mt-2 text-2xl font-extrabold text-gray-950 md:text-3xl">개인정보처리방침</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            프루트라이프는 이용자의 개인정보를 중요하게 생각하며 관련 법령과 Google Play 정책에 따라 안전하게 처리합니다.
          </p>
          <p className="mt-2 text-xs text-gray-400">시행일: 2026년 7월 22일</p>
        </header>

        <div className="space-y-8 pt-8 text-sm leading-7 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-gray-900 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <div className="space-y-3 text-gray-600">{section.body}</div>
            </section>
          ))}
        </div>
      </article>
    </main>
  )
}

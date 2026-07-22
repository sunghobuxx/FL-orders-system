import type { Metadata } from 'next'

export const runtime = 'edge'

export const metadata: Metadata = {
  title: '배송관리 앱 개인정보처리방침 | FruitLife',
  description: 'FruitLife 배송관리 앱 개인정보처리방침',
}

const sections = [
  {
    title: '1. 처리하는 개인정보',
    content: (
      <ul>
        <li>계정 정보: 로그인 이메일, 인증 정보, 계정 식별자 및 관리자 권한</li>
        <li>업무 정보: 담당 업체, 주문·발주·배송·명세서 내역, 배송 상태 및 품목 확인 기록</li>
        <li>전달 사항: 배송 중 전달 사항과 업무 관련 문의 내용</li>
        <li>자동 생성 정보: 접속 기록, 오류 기록, 서비스 이용 일시 및 기기 운영체제</li>
      </ul>
    ),
  },
  {
    title: '2. 개인정보 이용 목적',
    content: (
      <ul>
        <li>배송 담당 관리자 식별, 로그인 및 접근 권한 관리</li>
        <li>담당 업체의 주문 확인, 상차·배송 상태 처리 및 명세서 제공</li>
        <li>품목별 발주 집계와 배송 중 전달 사항 확인</li>
        <li>서비스 안정성 확보, 오류 확인 및 부정 이용 방지</li>
      </ul>
    ),
  },
  {
    title: '3. 보유 및 이용 기간',
    content: (
      <>
        <p>개인정보는 업무 계정이 유지되고 서비스 제공에 필요한 기간 동안 보유합니다.</p>
        <p>계정 삭제 또는 업무 종료가 확인되면 불필요한 정보는 삭제합니다. 다만 주문, 배송, 정산 및 분쟁 처리 기록은 관계 법령에서 정한 기간 동안 별도로 보관할 수 있습니다.</p>
      </>
    ),
  },
  {
    title: '4. 개인정보 처리 위탁 및 외부 서비스',
    content: (
      <ul>
        <li>Supabase: 회원 인증, 데이터베이스 및 세션 저장</li>
        <li>Expo: 앱 빌드 및 업데이트 서비스</li>
        <li>Cloudflare: 웹·API 서비스 제공 및 보안</li>
      </ul>
    ),
  },
  {
    title: '5. 개인정보의 제3자 제공',
    content: <p>FruitLife는 법령에 근거가 있거나 이용자가 동의한 경우를 제외하고 개인정보를 제3자에게 판매하거나 임의로 제공하지 않습니다.</p>,
  },
  {
    title: '6. 이용자의 권리와 계정 삭제',
    content: (
      <>
        <p>이용자는 개인정보 열람, 정정, 삭제 및 처리 정지를 요청할 수 있습니다.</p>
        <p>배송관리 계정은 회사 또는 관리자가 업무 목적으로 발급하므로, 계정 삭제는 소속 관리자에게 요청하거나 아래 연락처로 접수해 주세요.</p>
      </>
    ),
  },
  {
    title: '7. 개인정보 보호 및 파기',
    content: <p>전송 구간 암호화, 인증된 사용자 접근 및 역할별 권한 제한 등의 보호조치를 적용합니다. 보유 기간이 끝난 전자적 정보는 복구하기 어려운 방법으로 삭제합니다.</p>,
  },
  {
    title: '8. 아동의 개인정보',
    content: <p>배송관리 앱은 업무용 서비스이며 만 14세 미만 아동을 대상으로 제공하지 않습니다.</p>,
  },
  {
    title: '9. 개인정보 문의',
    content: (
      <ul>
        <li>서비스명: FruitLife 배송관리 앱</li>
        <li>개인정보 처리자: 프루트라이프</li>
        <li>문의 방법: 소속 관리자 또는 배송 중 전달 사항</li>
        <li>전화: 010-8680-5475</li>
      </ul>
    ),
  },
  {
    title: '10. 방침 변경',
    content: <p>서비스 또는 법령 변경에 따라 본 방침이 수정될 수 있으며, 중요한 변경은 앱 또는 웹사이트의 공지를 통해 안내합니다.</p>,
  },
]

export default function DriverPrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-800">
      <article className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-10">
        <header className="border-b border-gray-200 pb-6">
          <p className="text-sm font-bold tracking-widest text-green-600">FRUIT LIFE DELIVERY</p>
          <h1 className="mt-2 text-2xl font-extrabold text-gray-950 md:text-3xl">배송관리 앱 개인정보처리방침</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            프루트라이프는 배송관리 앱 이용자의 개인정보를 중요하게 생각하며 관련 법령과 앱 마켓 정책에 따라 안전하게 처리합니다.
          </p>
          <p className="mt-2 text-xs text-gray-400">시행일: 2026년 7월 22일</p>
        </header>

        <div className="space-y-8 pt-8 text-sm leading-7 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-gray-900 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <div className="space-y-3 text-gray-600">{section.content}</div>
            </section>
          ))}
        </div>
      </article>
    </main>
  )
}

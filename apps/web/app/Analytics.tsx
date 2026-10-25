import Script from 'next/script'

/**
 * 구글 태그관리자(GTM) + MS Clarity. ID가 아직 없으면(빈 문자열) 아무것도 안 그린다 —
 * next.config.ts 의 env 블록에 기본값(빈 문자열)을 넣어 두는 이유는, 여기 NEXT_PUBLIC_
 * 값이 빌드 타임에 박히기 때문이다(런타임 CF 시크릿으로는 안 먹음, 7/26 Mumbai/Seoul
 * 사고와 같은 함정). 실제 ID 가 바뀌면 next.config.ts 의 fallback 값만 바꾸고 재배포한다.
 *
 * GA4는 별도 측정 ID로 직접 붙이지 않는다 — GA4 속성을 안 만들고 GTM 컨테이너만
 * 만들었으므로(2026-10-25), GA4 연결은 GTM 대시보드 안에서 태그로 설정한다.
 * Clarity 는 GTM과 무관하게 이 파일에서 직접 로드한다(사장님 지시).
 */
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID

export default function Analytics() {
  return (
    <>
      {GTM_ID && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
      )}
      {CLARITY_ID && (
        <Script id="ms-clarity-init" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_ID}");
          `}
        </Script>
      )}
    </>
  )
}

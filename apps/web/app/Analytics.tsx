import Script from 'next/script'

/**
 * GA4 + MS Clarity. 측정 ID가 아직 없으면(빈 문자열) 아무것도 안 그린다 —
 * next.config.ts 의 env 블록에 기본값(빈 문자열)을 넣어 두는 이유는, 여기 NEXT_PUBLIC_
 * 값이 빌드 타임에 박히기 때문이다(런타임 CF 시크릿으로는 안 먹음, 7/26 Mumbai/Seoul
 * 사고와 같은 함정). 실제 ID 가 바뀌면 next.config.ts 의 fallback 값만 바꾸고 재배포한다.
 *
 * GTM 경유 연결을 잠깐 썼다가(2026-10-25) GA4 속성을 새로 만들어서 직접 연결로 되돌렸다.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID

export default function Analytics() {
  return (
    <>
      {GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}
          </Script>
        </>
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

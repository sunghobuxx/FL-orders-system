export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import PrintButton from '@/app/s/[token]/PrintButton'

/**
 * 로그인 없이 보는 당일명세서.
 *
 * 정산서 공유 페이지(app/s/[token])와 같은 이유 — 문자를 받은 거래처가 그 자리에서
 * 열 수 있어야 한다. 명세서 내역이 담기므로 유효기간(7일)으로 노출을 제한한다.
 */
export const metadata = {
  robots: { index: false, follow: false },
}

interface Props {
  params: Promise<{ token: string }>
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

export default async function SharedSpecPage({ params }: Props) {
  const { token } = await params
  const db = createAdminClient()

  const { data: link } = await db
    .from('spec_share_links')
    .select('daily_spec_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!link || new Date(link.expires_at) < new Date()) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-sm text-center space-y-2">
          <p className="text-lg font-semibold text-gray-800">기간이 지난 링크입니다</p>
          <p className="text-sm text-gray-500">
            명세서는 발송일로부터 7일간 볼 수 있습니다. 다시 필요하시면 담당자에게 문의해 주세요.
          </p>
        </div>
      </main>
    )
  }

  const { data: spec } = await db
    .from('daily_specs')
    .select('id, business_date, total_amount, vat_amount, restaurants(organizations(name))')
    .eq('id', link.daily_spec_id)
    .maybeSingle()

  if (!spec) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <p className="text-sm text-gray-500">명세서를 찾을 수 없습니다.</p>
      </main>
    )
  }

  const rest = Array.isArray(spec.restaurants) ? spec.restaurants[0] : spec.restaurants
  const org = Array.isArray(rest?.organizations) ? rest.organizations[0] : rest?.organizations

  type SpecLine = { id: string; qty: number; unit: string; unit_price: number; amount: number; products: { standard_name: string } | null }
  const { data: rawLines } = await db
    .from('daily_spec_lines')
    .select('id, qty, unit, unit_price, amount, products(standard_name)')
    .eq('daily_spec_id', spec.id)
  const lines = (rawLines ?? []) as unknown as SpecLine[]

  const [y, m, d] = spec.business_date.split('-')
  const title = `${Number(m)}월 ${Number(d)}일 발주 명세서`

  return (
    <main className="min-h-screen bg-gray-100 py-4 px-2 sm:py-6 sm:px-3 print:bg-white print:p-0">
      <div className="mx-auto max-w-md space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 print:border-0 print:p-0">
          <h1 className="text-center text-lg font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-center text-sm text-gray-500">{org?.name ?? '거래처'}</p>

          <div className="mt-4 divide-y divide-gray-100 border-t border-b border-gray-200">
            {lines.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">품목이 없습니다</p>
            )}
            {lines.map(line => {
              const p = Array.isArray(line.products) ? line.products[0] : line.products
              const qtyStr = Number(line.qty) % 1 === 0 ? Number(line.qty) : Number(line.qty).toFixed(1)
              return (
                <div key={line.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-gray-800">{p?.standard_name ?? '품목'}</span>
                    <span className="ml-2 text-gray-400">{qtyStr}{line.unit}</span>
                  </div>
                  <span className="font-semibold text-gray-900">{won(Number(line.amount ?? 0))}</span>
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-600">합계</span>
            <span className="text-base font-bold text-gray-900">
              {won(Number(spec.total_amount ?? 0))}
            </span>
          </div>
        </div>

        <PrintButton />

        <p className="px-1 text-center text-xs text-gray-400 print:hidden">
          이 링크는 발송일로부터 7일간 볼 수 있습니다. 이후에도 명세서가 필요하시면
          010-8680-5475 로 연락 주세요 — 출력해서 보내드립니다.
        </p>
      </div>
    </main>
  )
}

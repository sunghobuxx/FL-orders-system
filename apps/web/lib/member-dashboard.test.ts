import { describe, expect, it } from 'vitest'
import { buildDashboardTrend, latestDashboardLine, type DashboardLine } from './member-dashboard'

const specs = [{ id: 'a', business_date: '2026-09-14', total_amount: 90000 }, { id: 'b', business_date: '2026-09-15', total_amount: 80000 }]
const line = (spec: string, id: string, amount: number, price: number, quantity = 1): DashboardLine => ({ daily_spec_id: spec, product_id: id, amount, unit_price: price, qty: quantity, unit: 'box', products: { standard_name: id } })
const lines = [line('a', '깻잎', 50000, 50000), line('b', '깻잎', 57000, 57000), line('b', '대파', 23000, 23000)]
describe('모바일 대시보드 웹 집계 기준', () => {
  it('최근 납품일의 금액이 가장 큰 품목을 선택한다', () => {
    expect(latestDashboardLine(specs, lines)?.product_id).toBe('깻잎')
  })
  it('2주 날짜별 이전 단가를 유지하고 대표 품목 비용만 집계한다', () => {
    const trend = buildDashboardTrend(specs, lines, [{ sale_price: 45000, effective_from: '2026-09-01' }, { sale_price: 57000, effective_from: '2026-09-15' }], '2026-09-02', '2026-09-15')!
    expect(trend.points).toHaveLength(14)
    expect(trend.points[0].value).toBe(45000)
    expect(trend.currentPrice).toBe(57000)
    expect(trend.totalCost).toBe(107000)
    expect(trend.qty).toBe(2)
    expect(trend.orderDays).toBe(2)
    expect(trend.changeRate).toBeCloseTo(26.6667)
  })
  it('단가가 일정해도 웹처럼 품목을 숨기지 않는다', () => {
    const trend = buildDashboardTrend(specs, lines, [{ sale_price: 57000, effective_from: '2026-09-01' }], '2026-09-02', '2026-09-15')!
    expect(trend.name).toBe('깻잎')
    expect(trend.changeRate).toBe(0)
  })
  it('자료가 없을 때 가짜 품목이나 금액을 만들지 않는다', () => {
    expect(buildDashboardTrend([], [], [], '2026-09-02', '2026-09-15')).toBeNull()
  })
})

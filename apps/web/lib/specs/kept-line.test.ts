import { describe, expect, it } from 'vitest'
import { keptSpecLine, type KeptLine } from './kept-line'

const item = (qty: number, unit = 'ea') => ({ id: 'oi-new', product_id: 'p1', qty, unit })
const kept = (over: Partial<KeptLine> = {}): KeptLine => ({ qty: 3, unit: 'ea', unit_price: 16_000, vat_amount: 0, ...over })

describe('keptSpecLine — 잠긴(price_overridden) 명세서 줄을 발주에 다시 맞출 때', () => {
  it('★ 발주 수량이 바뀌면 수량은 발주를 따르고 단가는 잠긴 값을 유지한다 (중랑점 두절콩나물 3→4, 2026-09-26)', () => {
    const r = keptSpecLine(kept(), item(4), false)
    expect(r).toEqual({
      order_item_id: 'oi-new', product_id: 'p1', qty: 4, unit: 'ea',
      unit_price: 16_000, vat_amount: 0, price_overridden: true,
    })
  })

  it('수량이 줄어도 따른다', () => {
    expect(keptSpecLine(kept({ qty: 5 }), item(2), false).qty).toBe(2)
  })

  it('과세 품목은 수량이 바뀌면 부가세도 새 수량에 맞춰 다시 나눈다 (총액 단가는 그대로)', () => {
    // 핸드타올 31,000(부가세 포함): 공급가 28,182 + 부가세 2,818 (1개)
    const r = keptSpecLine(kept({ qty: 1, unit: 'box', unit_price: 28_182, vat_amount: 2_818 }), item(2, 'box'), true)
    expect(r.qty).toBe(2)
    expect(r.unit_price).toBe(28_182)
    expect(r.vat_amount).toBe(5_636) // 2 × 31,000 = 62,000 − 2 × 28,182
    expect(r.unit_price * r.qty + r.vat_amount).toBe(62_000)
  })

  it('수량이 같으면 아무것도 바꾸지 않는다', () => {
    const k = kept({ qty: 1, unit: 'box', unit_price: 28_182, vat_amount: 2_818 })
    const r = keptSpecLine(k, item(1, 'box'), true)
    expect(r).toMatchObject({ qty: 1, unit_price: 28_182, vat_amount: 2_818, price_overridden: true })
  })

  it('단위가 다르면 옛 줄을 그대로 둔다 — 단가가 단위별이라 수량만 바꾸면 금액이 틀어진다', () => {
    const r = keptSpecLine(kept({ qty: 2, unit: 'box', unit_price: 7_000 }), item(2, 'ea'), false)
    expect(r).toMatchObject({ qty: 2, unit: 'box', unit_price: 7_000 })
    const changed = keptSpecLine(kept({ qty: 2, unit: 'box', unit_price: 7_000 }), item(5, 'ea'), false)
    expect(changed).toMatchObject({ qty: 2, unit: 'box', unit_price: 7_000 })
  })

  it('단위 표기만 다르면(옛 줄 「박스」, 새 발주 box) 같은 단위로 보고 수량을 따른다 — 안 그러면 이번 사고가 조용히 재발한다', () => {
    const r = keptSpecLine(kept({ qty: 2, unit: '박스', unit_price: 7_000 }), item(5, 'box'), false)
    expect(r).toMatchObject({ qty: 5, unit: 'box', unit_price: 7_000 })
  })

  it('단위 표기가 다르면서 진짜 다른 단위(박스 ↔ ea)이면 그대로 둔다', () => {
    expect(keptSpecLine(kept({ qty: 2, unit: '박스', unit_price: 7_000 }), item(5, 'ea'), false))
      .toMatchObject({ qty: 2, unit: '박스' })
  })

  it('줄에 단위가 비어 있으면 발주 단위를 쓰고 수량도 따른다', () => {
    const r = keptSpecLine(kept({ unit: null }), item(4, 'ea'), false)
    expect(r).toMatchObject({ qty: 4, unit: 'ea' })
  })

  it('DB 에서 문자열로 온 수량(“3.000”)도 숫자로 비교한다 — 같은 값인데 바뀐 것으로 보지 않는다', () => {
    const k = kept({ qty: '3.000' as unknown as number, unit_price: '16000.00' as unknown as number })
    const same = keptSpecLine(k, item(3), false)
    expect(same.qty).toBe(3)
    expect(Number(same.unit_price)).toBe(16_000)
    expect(keptSpecLine(k, item(4), false).qty).toBe(4)
  })

  it('발주 수량이 0 이하이거나 숫자가 아니면 옛 줄을 지키고 0 으로 만들지 않는다', () => {
    for (const q of [0, -1, Number.NaN]) {
      expect(keptSpecLine(kept(), item(q), false).qty).toBe(3)
    }
  })

  it('항상 잠금(price_overridden)을 유지하고 발주 품목 id 로 다시 연결한다', () => {
    const r = keptSpecLine(kept(), item(4), false)
    expect(r.price_overridden).toBe(true)
    expect(r.order_item_id).toBe('oi-new')
  })
})

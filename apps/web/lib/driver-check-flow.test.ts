import { expect, it } from 'vitest'
import { applyCheckStage } from './orders/check-stage'
import { nextOrderCheckStage, orderCheckState } from '../../driver-mobile/lib/order-check'

it('서버에 저장한 상차→배송 상태를 다시 조회해도 유지하고 배송 확인 취소는 상차를 보존한다', async () => {
  const tables: Record<string, any[]> = {
    order_batches: [{ id: 'batch', status: 'validated' }],
    orders: [{ id: 'order', batch_id: 'batch' }],
    order_items: ['a', 'b'].map(id => ({ id, order_id: 'order', check_stage: 0 })),
  }
  const db = { from(table: string) {
    const filters: Array<(r: any) => boolean> = []
    let patch: any = null
    let single = false
    const q: any = {
      select: () => q,
      update: (value: any) => { patch = value; return q },
      eq: (key: string, value: any) => { filters.push(r => r[key] === value); return q },
      in: (key: string, values: any[]) => { filters.push(r => values.includes(r[key])); return q },
      maybeSingle: () => { single = true; return q },
      then: (resolve: any, reject: any) => {
        const rows = tables[table].filter(r => filters.every(f => f(r)))
        if (patch) rows.forEach(r => Object.assign(r, patch))
        return Promise.resolve({ data: single ? rows[0] : rows.map(r => ({ ...r })), error: null }).then(resolve, reject)
      },
    }
    return q
  } }
  async function click(id: string) {
    const status = tables.order_batches[0].status
    const stage = nextOrderCheckStage(status, tables.order_items.find(i => i.id === id).check_stage)
    if (stage === null) throw new Error('Already completed')
    return applyCheckStage(db, [id], stage, 'batch')
  }
  expect(await click('a')).toMatchObject({ batchStatus: 'validated', confirmed: 1, requiredStage: 1 })
  expect(await click('b')).toMatchObject({ batchStatus: 'ordered', confirmed: 0, requiredStage: 2 })
  const reloaded = await db.from('order_items').select('*').in('order_id', ['order'])
  expect(reloaded.data.map((i: any) => i.check_stage)).toEqual([1, 1])
  expect(orderCheckState(tables.order_batches[0].status).requiredStage).toBe(2)
  expect(await click('a')).toMatchObject({ batchStatus: 'ordered', confirmed: 1 })
  expect(await click('a')).toMatchObject({ batchStatus: 'ordered', confirmed: 0 })
  expect(tables.order_items[0].check_stage).toBe(1)
  await click('a')
  expect(await click('b')).toMatchObject({ batchStatus: 'dispatched', confirmed: 2 })
  expect(tables.order_items.map(i => i.check_stage)).toEqual([2, 2])
  expect(nextOrderCheckStage(tables.order_batches[0].status, 2)).toBeNull()
})

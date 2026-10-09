import { describe, expect, it } from 'vitest'
import { filterDashboardDispatchJobs } from './driver-dashboard-dispatch'
const item = (batch: string, qty: number) => ({ qty, order_items: { orders: { batch_id: batch } } })
const jobs = [
  { id: 'shared', dispatch_job_items: [item('mine', 2), item('other', 9)] },
  { id: 'other-only', dispatch_job_items: [item('other', 4)] },
  { id: 'tomorrow', dispatch_job_items: [item('mine-tomorrow', 3)] },
]
describe('dashboard supplier scope', () => {
  it('all shows every supplier and all quantities', () => {
    expect(filterDashboardDispatchJobs(jobs, null)).toEqual(jobs)
  })
  it('assigned filters shared-supplier quantities and hides unrelated suppliers', () => {
    const filtered = filterDashboardDispatchJobs(jobs, new Set(['mine', 'mine-tomorrow']))
    expect(filtered.map(job => job.id)).toEqual(['shared', 'tomorrow'])
    expect(filtered[0].dispatch_job_items.map(item => item.qty)).toEqual([2])
    expect(jobs[0].dispatch_job_items).toHaveLength(2)
  })
  it('no assigned orders returns no supplier cards', () => {
    expect(filterDashboardDispatchJobs(jobs, new Set())).toEqual([])
  })
  it('handles array relations and missing/deleted order relations', () => {
    const result = filterDashboardDispatchJobs([{ dispatch_job_items: [
      { order_items: [{ orders: [{ batch_id: 'mine' }] }] },
      { order_items: null },
      { order_items: { orders: null } },
    ] }], new Set(['mine']))
    expect(result[0].dispatch_job_items).toHaveLength(1)
  })
})

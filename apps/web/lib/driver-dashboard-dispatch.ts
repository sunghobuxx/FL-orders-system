type Relation<T> = T | T[] | null | undefined
const one = <T>(value: Relation<T>): T | undefined => Array.isArray(value) ? value[0] : value ?? undefined

type DispatchItem = { order_items?: Relation<{ orders?: Relation<{ batch_id?: string }> }> }

/** Filter before aggregating, so a shared supplier cannot include another manager's quantities. */
export function filterDashboardDispatchJobs<T extends { dispatch_job_items?: DispatchItem[] | null }>(jobs: T[], visibleBatchIds: Set<string> | null): T[] {
  if (visibleBatchIds === null) return jobs
  return jobs.map(job => ({ ...job, dispatch_job_items: (job.dispatch_job_items ?? []).filter(item => {
    const batchId = one(one(item.order_items)?.orders)?.batch_id
    return !!batchId && visibleBatchIds.has(batchId)
  }) })).filter(job => job.dispatch_job_items.length > 0)
}

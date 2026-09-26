/**
 * 테스트용 가짜 DB.
 *
 * from(테이블) 뒤에 무슨 메서드를 이어 붙이든 같은 빌더가 돌아오고, await 하면 그 테이블의 준비된 행이 나온다.
 * **eq/in 같은 조건은 무시한다** — 테스트가 이미 걸러진 행을 준비해 둔다. 조건이 맞는지는 이 도우미로 검증되지 않는다.
 * insert/update/delete 는 호출 내용을 기록한다.
 */
export interface FakeWrite { table: string; op: 'insert' | 'update' | 'delete'; payload: unknown }

export function fakeDb(tables: Record<string, unknown[]>) {
  const writes: FakeWrite[] = []
  const from = (table: string) => {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve({ data: op === 'select' ? (tables[table] ?? []) : null, error: null }).then(resolve, reject)
        }
        if (prop === 'insert' || prop === 'update' || prop === 'delete') {
          return (payload?: unknown) => { op = prop; writes.push({ table, op: prop, payload }); return builder }
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null })
        }
        return () => builder
      },
    })
    return builder
  }
  return { db: { from }, writes }
}

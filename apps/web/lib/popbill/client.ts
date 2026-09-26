import { buildTokenRequest } from './auth'
import type { PopbillConfig } from './config'

/**
 * 팝빌 REST 호출기. 토큰을 발급·캐시(30분 유효, 만료 2분 전 갱신)하고 Bearer 로 호출한다.
 *
 * 결과 분류(outcome) — 발급·발송 같은 쓰기 호출에서 재시도 여부를 가르는 기준이다.
 *   'rejected' : 팝빌이 요청을 받았고 4xx 로 거절했다 — 반영되지 않았음이 확실하다.
 *   'unknown'  : 네트워크 오류·시간 초과·5xx — 팝빌이 처리했는지 알 수 없다. **자동 재발송 금지**, 조회로 확인한다.
 * 오류에는 상태코드·팝빌 코드·메시지만 담고 토큰·SecretKey 는 넣지 않는다.
 */
export class PopbillError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: number | string | null,
    public readonly outcome: 'rejected' | 'unknown',
  ) {
    super(message)
    this.name = 'PopbillError'
  }
}

interface Deps { fetchFn?: typeof fetch; now?: () => Date }
interface CachedToken { token: string; expiresAt: number }

const SAFETY_MS = 2 * 60_000

export class PopbillClient {
  private tokens = new Map<string, CachedToken>()
  private fetchFn: typeof fetch
  private now: () => Date

  constructor(private config: PopbillConfig, deps: Deps = {}) {
    this.fetchFn = deps.fetchFn ?? ((...a) => fetch(...a))
    this.now = deps.now ?? (() => new Date())
  }

  private async token(scopes: string[]): Promise<string> {
    const cacheKey = [...scopes].sort().join(',')
    const cached = this.tokens.get(cacheKey)
    if (cached && cached.expiresAt - SAFETY_MS > this.now().getTime()) return cached.token

    const req = await buildTokenRequest({
      linkId: this.config.linkId, secretKey: this.config.secretKey, corpNum: this.config.corpNum,
      scopes: [...scopes, 'member'].filter((s, i, a) => a.indexOf(s) === i),
      serviceId: this.config.serviceId, date: this.now(),
    })
    const res = await this.call(req.url, { method: 'POST', headers: req.headers, body: req.body })
    const json = res as { session_token?: string; expiration?: string }
    if (!json.session_token || !json.expiration) throw new PopbillError('토큰 응답 형식이 올바르지 않습니다', null, null, 'unknown')
    this.tokens.set(cacheKey, { token: json.session_token, expiresAt: new Date(json.expiration).getTime() })
    return json.session_token
  }

  private async call(url: string, init: RequestInit): Promise<unknown> {
    let res: Response
    try {
      res = await this.fetchFn(url, init)
    } catch (e) {
      throw new PopbillError(`팝빌 호출 실패(결과 불명): ${e instanceof Error ? e.message : 'network'}`, null, null, 'unknown')
    }
    const text = await res.text()
    let body: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { body = text ? JSON.parse(text) : null } catch { /* 본문이 JSON 이 아닐 수 있다 */ }
    if (res.ok) return body
    const outcome = res.status >= 500 ? 'unknown' : 'rejected'
    throw new PopbillError(`팝빌 오류 ${res.status}${body?.message ? `: ${body.message}` : ''}`, res.status, body?.code ?? null, outcome)
  }

  async request(method: 'GET' | 'POST', path: string, opts: { scopes: string[]; body?: unknown; headers?: Record<string, string> }): Promise<unknown> {
    const token = await this.token(opts.scopes)
    return this.call(`${this.config.apiBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  }
}

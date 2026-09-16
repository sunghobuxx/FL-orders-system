// Never accept arbitrary post-login destinations from a query parameter.
export function mobilePaymentReturn(value: string | null) {
  if (!value || /[\\\r\n]/.test(value)) return null
  try {
    const url = new URL(value, 'https://local.invalid')
    return url.origin === 'https://local.invalid' && url.pathname === '/member/payment' && value.startsWith('/member/payment?')
      ? url.pathname + url.search : null
  } catch { return null }
}

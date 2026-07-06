import { NextResponse } from 'next/server'

export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}

export function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

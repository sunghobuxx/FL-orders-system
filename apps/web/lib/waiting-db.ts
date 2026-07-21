import { createClient } from '@supabase/supabase-js'

const WAITING_URL = process.env.WAITING_SUPABASE_URL ?? 'https://atzmpmnuibsrkkvpwsfy.supabase.co'
const WAITING_ANON_KEY = process.env.WAITING_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0em1wbW51aWJzcmtrdnB3c2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTgxMzYsImV4cCI6MjA5NzYzNDEzNn0.OtlpMz5GMONGPVbGFcpzqDZQtMGsl8niWdeZI5sAB5w'

export function createWaitingClient() {
  return createClient(WAITING_URL, WAITING_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

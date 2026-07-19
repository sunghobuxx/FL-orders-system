import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  compress: false,
  serverActions: { bodySizeLimit: '100mb' },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bkfkaugevqvbibjaasbj.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZmthdWdldnF2YmliamFhc2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NzIxNDgsImV4cCI6MjA4NzI0ODE0OH0.9btVcor4L0J8EPmT0IRIlGnl-UTC7w2AKf73-IXcoj8',
  },
}

export default nextConfig

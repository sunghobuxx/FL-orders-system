import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://bkfkaugevqvbibjaasbj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZmthdWdldnF2YmliamFhc2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NzIxNDgsImV4cCI6MjA4NzI0ODE0OH0.9btVcor4L0J8EPmT0IRIlGnl-UTC7w2AKf73-IXcoj8'
)

import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const supabase = createClient(
  'https://nvpaggacvbotgqyxfdof.supabase.co',
  'sb_publishable_iYQqjq5q9dN-AwXy-DTYzA_Wnoz0Vw3',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)

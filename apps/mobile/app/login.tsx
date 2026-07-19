import { useState } from 'react'
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { registerAndSavePushToken } from '@/lib/notifications'

const logo = require('../assets/icon.png')

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 입력하세요.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) {
      Alert.alert('로그인 실패', '이메일 또는 비밀번호가 올바르지 않습니다.')
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) {
        await registerAndSavePushToken(user.id)
      }
      router.replace('/(tabs)')
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.inner}>
        <Image source={logo} style={s.logo} resizeMode="contain" />
        <Text style={s.title}>FRUIT LIFE</Text>
        <Text style={s.sub}>주문 관리 시스템</Text>
        <View style={s.form}>
          <TextInput
            style={s.input}
            placeholder="이메일"
            placeholderTextColor="#9ca3af"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
          />
          <TextInput
            style={s.input}
            placeholder="비밀번호"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleLogin} disabled={loading}>
            <Text style={s.btnText}>{loading ? '로그인 중...' : '로그인'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  logo: { width: 96, height: 96, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#111', letterSpacing: 2 },
  sub: { fontSize: 14, color: '#9ca3af', marginTop: 4, marginBottom: 44 },
  form: { width: '100%', gap: 12 },
  input: {
    width: '100%', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#111', backgroundColor: '#f9fafb',
  },
  btn: {
    width: '100%', backgroundColor: '#16a34a', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})

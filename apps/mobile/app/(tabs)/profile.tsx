import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { router } from 'expo-router'

import { supabase } from '@/lib/supabase'
import { memberRequest } from '@/lib/member-api'

type Organization = {
  id: string
  name: string | null
  contact_name: string | null
  phone: string | null
  mobile: string | null
  address: string | null
  biz_no: string | null
  invoice_email: string | null
}

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [organizationId, setOrganizationId] = useState('')
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [bizNo, setBizNo] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await memberRequest<{ organizationId: string; restaurantId: string | null; email: string; name: string; contactName: string; phone: string; bizNo: string }>('/profile')
      setOrganizationId(data.organizationId); setRestaurantId(data.restaurantId)
      setEmail(data.email); setName(data.name); setContactName(data.contactName); setPhone(data.phone); setBizNo(data.bizNo)
    } catch (error) { Alert.alert('조회 실패', error instanceof Error ? error.message : '회원정보 조회 실패') }
    finally { setLoading(false) }
  }, [])


  useEffect(() => { void load() }, [load])

  async function handleSave() {
    if (!organizationId) return
    setSaving(true)
    try {
      await memberRequest('/profile', { method: 'PUT', body: JSON.stringify({ orgId: organizationId, restaurantId, name, contact_name: contactName, phone, biz_no: bizNo }) })
      Alert.alert('저장 완료', '업체 정보가 업데이트되었습니다.')
    } catch (error) { Alert.alert('저장 실패', error instanceof Error ? error.message : '정보 저장 실패') }
    finally { setSaving(false) }
  }

  async function handlePasswordChange() {
    if (newPassword.length < 8) { Alert.alert('입력 오류', '비밀번호는 8자 이상이어야 합니다.'); return }
    if (newPassword !== confirmPassword) { Alert.alert('입력 오류', '비밀번호가 일치하지 않습니다.'); return }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPassword(false)
    if (error) Alert.alert('변경 실패', '비밀번호 변경에 실패했습니다.')
    else {
      setNewPassword(''); setConfirmPassword('')
      Alert.alert('변경 완료', '비밀번호가 변경되었습니다.')
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#16a34a" /></View>

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>내 정보</Text>
        {!organizationId && <TouchableOpacity onPress={() => void load()}><Text>회원정보를 불러오지 못했습니다. 다시 조회</Text></TouchableOpacity>}
        <View style={s.section}>
          <Text style={s.sectionTitle}>업체 정보</Text>
          <Field label="로그인 이메일" value={email} editable={false} />
          <Field label="업체명" value={name} onChangeText={setName} />
          <Field label="담당자명" value={contactName} onChangeText={setContactName} />
          <Field label="연락처" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="사업자번호" value={bizNo} onChangeText={setBizNo} keyboardType="numeric" />
          <TouchableOpacity style={s.primaryBtn} onPress={() => void handleSave()} disabled={saving}><Text style={s.primaryText}>{saving ? '저장 중...' : '정보 저장'}</Text></TouchableOpacity>
        </View>
        <View style={s.section}>
          <Text style={s.sectionTitle}>비밀번호 변경</Text>
          <Field label="새 비밀번호" value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="8자 이상" />
          <Field label="비밀번호 확인" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="비밀번호 재입력" />
          <TouchableOpacity style={s.primaryBtn} onPress={() => void handlePasswordChange()} disabled={changingPassword}><Text style={s.primaryText}>{changingPassword ? '변경 중...' : '비밀번호 변경'}</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={s.menu} onPress={() => router.push('/(tabs)/inquiry/new')}><Text style={s.menuText}>💬 문의하기</Text><Text style={s.chevron}>›</Text></TouchableOpacity>
        <TouchableOpacity style={s.menu} onPress={() => router.push('/(tabs)/inquiry')}><Text style={s.menuText}>📋 문의 내역</Text><Text style={s.chevron}>›</Text></TouchableOpacity>
        <TouchableOpacity style={s.menu} onPress={() => void Linking.openURL('https://order.fruitlife.shop/privacy-policy')}><Text style={s.menuText}>🔒 개인정보처리방침</Text><Text style={s.chevron}>›</Text></TouchableOpacity>
        <TouchableOpacity style={s.menu} onPress={() => void Linking.openURL('https://order.fruitlife.shop/account-deletion')}><Text style={s.menuText}>🗑️ 계정 및 데이터 삭제 요청</Text><Text style={s.chevron}>›</Text></TouchableOpacity>
        <TouchableOpacity style={s.logout} onPress={() => void handleLogout()}><Text style={s.logoutText}>로그아웃</Text></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string }
function Field({ label, ...props }: FieldProps) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor="#9ca3af" style={[s.input, props.editable === false && s.readonly]} {...props} /></View>
}

const s = StyleSheet.create({
  flex: { flex: 1 }, scroll: { flex: 1, backgroundColor: '#f9fafb' }, content: { padding: 16, paddingBottom: 40, gap: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#111827' }, section: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, gap: 13 }, sectionTitle: { fontSize: 15, fontWeight: '800', color: '#374151' },
  field: { gap: 5 }, label: { color: '#6b7280', fontSize: 12, fontWeight: '600' }, input: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, color: '#111827' }, readonly: { color: '#6b7280', backgroundColor: '#f3f4f6' },
  primaryBtn: { backgroundColor: '#16a34a', borderRadius: 10, alignItems: 'center', paddingVertical: 13, marginTop: 2 }, primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  menu: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 15 }, menuText: { color: '#374151', fontSize: 15, fontWeight: '600' }, chevron: { color: '#d1d5db', fontSize: 22 },
  logout: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', paddingVertical: 14 }, logoutText: { color: '#dc2626', fontWeight: '700' },
})

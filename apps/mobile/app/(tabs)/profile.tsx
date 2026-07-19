import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { router } from 'expo-router'

import { supabase } from '@/lib/supabase'

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
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [mobile, setMobile] = useState('')
  const [address, setAddress] = useState('')
  const [bizNo, setBizNo] = useState('')
  const [invoiceEmail, setInvoiceEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }
    setEmail(session.user.email ?? '')
    const { data: membership } = await supabase
      .from('memberships').select('organization_id').eq('user_id', session.user.id).single()
    if (!membership?.organization_id) { setLoading(false); return }
    const { data } = await supabase
      .from('organizations')
      .select('id, name, contact_name, phone, mobile, address, biz_no, invoice_email')
      .eq('id', membership.organization_id)
      .single()
    const org = data as Organization | null
    if (org) {
      setOrganizationId(org.id)
      setName(org.name ?? '')
      setContactName(org.contact_name ?? '')
      setPhone(org.phone ?? '')
      setMobile(org.mobile ?? '')
      setAddress(org.address ?? '')
      setBizNo(org.biz_no ?? '')
      setInvoiceEmail(org.invoice_email ?? '')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleSave() {
    if (!organizationId) return
    setSaving(true)
    const { error } = await supabase.from('organizations').update({
      name, contact_name: contactName, phone, mobile, address,
      biz_no: bizNo, invoice_email: invoiceEmail,
    }).eq('id', organizationId)
    setSaving(false)
    Alert.alert(error ? '저장 실패' : '저장 완료', error ? '정보 저장 중 오류가 발생했습니다.' : '업체 정보가 업데이트되었습니다.')
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
        <View style={s.section}>
          <Text style={s.sectionTitle}>업체 정보</Text>
          <Field label="로그인 이메일" value={email} editable={false} />
          <Field label="업체명" value={name} onChangeText={setName} />
          <Field label="담당자명" value={contactName} onChangeText={setContactName} />
          <Field label="연락처" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="휴대폰" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
          <Field label="주소" value={address} onChangeText={setAddress} />
          <Field label="사업자번호" value={bizNo} onChangeText={setBizNo} keyboardType="numeric" />
          <Field label="계산서 이메일" value={invoiceEmail} onChangeText={setInvoiceEmail} keyboardType="email-address" autoCapitalize="none" />
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

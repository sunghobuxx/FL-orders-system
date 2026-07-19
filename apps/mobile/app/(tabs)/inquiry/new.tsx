import { useState } from 'react'
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function NewInquiryScreen() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!title.trim()) { Alert.alert('오류', '제목을 입력해주세요.'); return }
    if (!content.trim()) { Alert.alert('오류', '내용을 입력해주세요.'); return }

    setSubmitting(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }

    const { data: membership } = await supabase
      .from('memberships').select('organizations(id)').eq('user_id', session.user.id).single()
    const orgData = membership?.organizations
    const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string } | undefined

    if (!org) { Alert.alert('오류', '업체 정보를 찾을 수 없습니다.'); setSubmitting(false); return }

    const { error } = await supabase.from('inquiries').insert({
      organization_id: org.id,
      user_id: session.user.id,
      title: title.trim(),
      content: content.trim(),
      status: 'pending',
    })

    setSubmitting(false)
    if (error) {
      Alert.alert('오류', '문의 등록에 실패했습니다.')
    } else {
      Alert.alert('완료', '문의가 등록되었습니다.', [
        { text: '확인', onPress: () => router.back() },
      ])
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.field}>
          <Text style={s.label}>제목</Text>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder="문의 제목을 입력하세요"
            placeholderTextColor="#9ca3af"
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>내용</Text>
          <TextInput
            style={[s.input, s.textarea]}
            value={content}
            onChangeText={setContent}
            placeholder="문의 내용을 자세히 입력해주세요"
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} disabled={submitting}>
          <Text style={s.submitBtnText}>{submitting ? '등록 중...' : '문의 등록'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 16 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111',
    backgroundColor: '#fff',
  },
  textarea: { minHeight: 160 },
  submitBtn: {
    backgroundColor: '#16a34a', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})

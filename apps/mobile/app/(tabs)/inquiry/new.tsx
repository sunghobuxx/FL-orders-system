import { useState } from 'react'
import {
  Alert, Image, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'

import { MEMBER_API_URL } from '@/lib/member-api'
import { supabase } from '@/lib/supabase'

const MAX_IMAGES = 5
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

export default function NewInquiryScreen() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([])
  const [submitting, setSubmitting] = useState(false)

  async function pickImages() {
    if (images.length >= MAX_IMAGES) {
      Alert.alert('알림', `사진은 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`)
      return
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('권한 필요', '문의 사진을 첨부하려면 사진 접근 권한을 허용해주세요.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.8,
    })
    if (result.canceled) return

    const oversized = result.assets.find(asset => (asset.fileSize ?? 0) > MAX_IMAGE_SIZE)
    if (oversized) {
      Alert.alert('파일 크기 초과', '사진은 장당 10MB 이하만 첨부할 수 있습니다.')
      return
    }
    setImages(prev => [...prev, ...result.assets].slice(0, MAX_IMAGES))
  }

  async function handleSubmit() {
    if (!title.trim()) { Alert.alert('오류', '제목을 입력해주세요.'); return }
    if (!content.trim()) { Alert.alert('오류', '내용을 입력해주세요.'); return }

    setSubmitting(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }

    const payload = new FormData()
    payload.append('title', title.trim())
    payload.append('content', content.trim())
    for (const [index, image] of images.entries()) {
      const extension = image.uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg'
      payload.append('images', {
        uri: image.uri,
        name: image.fileName || `inquiry-${Date.now()}-${index}.${extension}`,
        type: image.mimeType || (extension === 'png' ? 'image/png' : 'image/jpeg'),
      } as never)
    }

    try {
      const response = await fetch(`${MEMBER_API_URL}/api/member/inquiries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: payload,
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? '문의 등록에 실패했습니다.')
      Alert.alert('완료', '문의가 등록되었습니다.', [
        { text: '확인', onPress: () => router.back() },
      ])
    } catch (error) {
      console.error('Failed to create inquiry:', error)
      Alert.alert('오류', error instanceof Error ? error.message : '문의 등록에 실패했습니다.')
    } finally {
      setSubmitting(false)
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
          <View style={s.photoHeader}>
            <Text style={s.label}>사진 첨부</Text>
            <Text style={s.photoCount}>{images.length}/{MAX_IMAGES}</Text>
          </View>
          <TouchableOpacity style={s.photoButton} onPress={pickImages} disabled={submitting}>
            <Text style={s.photoButtonText}>사진 선택</Text>
            <Text style={s.photoHelp}>최대 5장 · 장당 10MB 이하</Text>
          </TouchableOpacity>
          {images.length > 0 && (
            <View style={s.previewGrid}>
              {images.map((image, index) => (
                <View key={`${image.uri}-${index}`} style={s.previewWrap}>
                  <Image source={{ uri: image.uri }} style={s.previewImage} />
                  <TouchableOpacity
                    style={s.removeButton}
                    onPress={() => setImages(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                    disabled={submitting}
                  >
                    <Text style={s.removeButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
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
  photoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  photoCount: { fontSize: 12, color: '#6b7280' },
  photoButton: {
    borderWidth: 1, borderColor: '#bbf7d0', borderStyle: 'dashed', borderRadius: 10,
    backgroundColor: '#f0fdf4', paddingVertical: 15, alignItems: 'center', gap: 3,
  },
  photoButtonText: { color: '#15803d', fontSize: 15, fontWeight: '700' },
  photoHelp: { color: '#9ca3af', fontSize: 11 },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  previewWrap: { width: 92, height: 92 },
  previewImage: { width: 92, height: 92, borderRadius: 10, backgroundColor: '#e5e7eb' },
  removeButton: {
    position: 'absolute', right: -5, top: -5, width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
  },
  removeButtonText: { color: '#fff', fontSize: 18, lineHeight: 20, fontWeight: '700' },
  submitBtn: {
    backgroundColor: '#16a34a', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})

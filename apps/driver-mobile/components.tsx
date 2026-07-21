import { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

export const colors = {
  bg: '#F6F8FB',
  card: '#FFFFFF',
  line: '#E5E7EB',
  ink: '#111827',
  muted: '#6B7280',
  soft: '#F3F4F6',
  green: '#16A34A',
  blue: '#2563EB',
  red: '#DC2626',
}

export function Page({ children }: { children: ReactNode }) {
  return <View style={styles.page}>{children}</View>
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>
}

export function Pill({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'blue' | 'red' }) {
  const backgroundColor = tone === 'green' ? '#DCFCE7' : tone === 'blue' ? '#DBEAFE' : tone === 'red' ? '#FEE2E2' : '#F3F4F6'
  const color = tone === 'green' ? colors.green : tone === 'blue' ? colors.blue : tone === 'red' ? colors.red : colors.muted
  return <Text style={[styles.pill, { backgroundColor, color }]}>{children}</Text>
}

export function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, disabled && { opacity: 0.5 }]}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  )
}

export function Field(props: { value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; multiline?: boolean }) {
  return <TextInput {...props} placeholderTextColor="#9CA3AF" style={[styles.input, props.multiline && styles.textarea]} />
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.green} />
      <Muted>불러오는 중...</Muted>
    </View>
  )
}

export function Empty({ message }: { message: string }) {
  return (
    <Card>
      <Muted>{message}</Muted>
    </Card>
  )
}

export const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 18,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  pill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 15,
    marginBottom: 10,
  },
  textarea: {
    minHeight: 110,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
})

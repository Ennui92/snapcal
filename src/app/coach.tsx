// AI nutrition coach: a simple chat screen backed by src/lib/coach.ts.
// Dark "Darkroom" theme throughout — near-black surfaces, one acid-lime
// accent for the user's own bubbles and the send button.
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, radius } from '@/constants/theme';
import { Icon } from '@/components/icons';
import { Grain, IconButton, ScreenHeader } from '@/components/ui';
import { addMessage, askCoach, getMessages, type CoachMessage } from '@/lib/coach';

const SUGGESTIONS = [
  'What should I eat tonight?',
  'Why am I not losing weight?',
  'High-protein snack ideas',
  'How do I stop snacking at night?',
];

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<CoachMessage>>(null);

  const [messages, setMessages] = useState<CoachMessage[]>(() => getMessages());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const userMsg = addMessage('user', trimmed);
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setError(false);
    setSending(true);
    try {
      const reply = await askCoach(trimmed);
      const botMsg = addMessage('assistant', reply);
      setMessages(prev => [...prev, botMsg]);
      setPendingText(null);
    } catch {
      setError(true);
      setPendingText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const retry = () => {
    if (!pendingText) return;
    const text = pendingText;
    setError(false);
    setSending(true);
    askCoach(text)
      .then((reply) => {
        const botMsg = addMessage('assistant', reply);
        setMessages(prev => [...prev, botMsg]);
        setPendingText(null);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => setSending(false));
  };

  const onSubmit = () => {
    Haptics.selectionAsync();
    void send(input);
  };

  return (
    <View style={styles.root}>
      <Grain />
      <View style={{ paddingTop: insets.top + 8 }}>
        <ScreenHeader
          title="Coach"
          left={<IconButton icon="back" onPress={() => router.back()} />}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 56}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Icon name="sparkle" size={26} color={C.signal} weight={1.6} />
            </View>
            <Text style={styles.emptyTitle}>Talk it through</Text>
            <Text style={styles.emptyBody}>
              Ask about tonight&apos;s meal, your pace toward goal, or what to eat next. Your coach
              can see today&apos;s log.
            </Text>
            <View style={styles.chipsWrap}>
              {SUGGESTIONS.map(s => (
                <Pressable
                  key={s}
                  onPress={() => { Haptics.selectionAsync(); void send(s); }}
                  style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => String(m.id)}
            renderItem={({ item }) => <Bubble message={item} />}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={sending ? <TypingBubble /> : null}
          />
        )}

        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>Could not reach your coach.</Text>
            <Pressable onPress={retry} hitSlop={8}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask your coach..."
            placeholderTextColor={C.faint}
            style={styles.input}
            multiline
            editable={!sending}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={onSubmit}
          />
          <Pressable
            onPress={onSubmit}
            disabled={sending || input.trim().length === 0}
            style={({ pressed }) => [
              styles.sendBtn,
              (sending || input.trim().length === 0) && { opacity: 0.35 },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
          >
            <View style={{ transform: [{ rotate: '-90deg' }] }}>
              <Icon name="chevron" size={18} color={C.onSignal} weight={2.4} />
            </View>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ message }: { message: CoachMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleCoach]}>
        <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextCoach}>{message.content}</Text>
      </View>
    </View>
  );
}

function TypingBubble() {
  return (
    <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
      <View style={[styles.bubble, styles.bubbleCoach]}>
        <Text style={styles.bubbleTextCoach}>Typing...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: radius.button, backgroundColor: C.signalDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontFamily: F.heading, fontSize: 20, color: C.ink, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.button,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, margin: 5,
  },
  chipText: { fontSize: 13, color: C.ink },
  bubbleRow: { flexDirection: 'row', marginBottom: 12 },
  bubble: { maxWidth: '82%', borderRadius: radius.card, paddingVertical: 11, paddingHorizontal: 14 },
  bubbleUser: { backgroundColor: C.signal, borderTopRightRadius: 2 },
  bubbleCoach: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderTopLeftRadius: 2 },
  bubbleTextUser: { fontSize: 14.5, color: C.onSignal, lineHeight: 20 },
  bubbleTextCoach: { fontSize: 14.5, color: C.ink, lineHeight: 20 },
  errorBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.dangerDim,
  },
  errorText: { fontSize: 13, color: C.danger },
  retryText: { fontSize: 13, color: C.danger, fontFamily: F.mono, letterSpacing: 0.5, textTransform: 'uppercase' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.hairline,
    backgroundColor: C.bg,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: radius.button,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.ink,
    backgroundColor: C.card, maxHeight: 120,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: radius.button, backgroundColor: C.signal,
    alignItems: 'center', justifyContent: 'center',
  },
});

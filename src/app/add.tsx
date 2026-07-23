// Manual entry for when there is no photo: yesterday's forgotten beer, a
// coffee ordered to go. Name and calories are enough; everything else is
// optional and prefilled.
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '@/constants/theme';
import { BigButton, Card, Chip, Section } from '@/components/ui';
import { insertManualEntry } from '@/lib/db';
import { t } from '@/lib/i18n';
import { mealLabel, mealTypeForNow } from '@/lib/nutrition';
import { useStore } from '@/lib/store';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const;

export default function AddManualScreen() {
  const insets = useSafeAreaInsets();
  const { refresh } = useStore();

  const now = new Date();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [grams, setGrams] = useState('');
  const [sugar, setSugar] = useState('');
  const [mealType, setMealType] = useState<string>(mealTypeForNow());
  const [time, setTime] = useState(
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  );

  const kcalNum = parseFloat(kcal.replace(',', '.'));
  const valid = name.trim().length > 0 && isFinite(kcalNum) && kcalNum >= 0;

  const save = () => {
    if (!valid) return;
    const takenAt = new Date();
    const m = time.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) {
      takenAt.setHours(Number(m[1]), Number(m[2]));
      // A late-night correction typed just after midnight for "22:30" means
      // yesterday evening; if the time is in the future, assume it was today
      // anyway and let the 03:00 day-flip sort out the bookkeeping.
    }
    const gramsNum = parseFloat(grams.replace(',', '.'));
    const sugarNum = parseFloat(sugar.replace(',', '.'));
    insertManualEntry({
      name: name.trim(),
      kcal: kcalNum,
      grams: isFinite(gramsNum) && gramsNum > 0 ? gramsNum : undefined,
      sugarG: isFinite(sugarNum) && sugarNum >= 0 ? sugarNum : undefined,
      mealType,
      takenAt,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
    router.back();
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}><Text style={{ fontSize: 16 }}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>{t('add.title')}</Text>
        <View style={{ width: 42 }} />
      </View>

      <Text style={styles.lead}>{t('add.lead')}</Text>

      <Section title={t('add.what')}>
        <Card>
          <TextInput
            placeholder={t('add.namePlaceholder')}
            placeholderTextColor={C.faint}
            value={name}
            onChangeText={setName}
            style={styles.input}
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('add.kcal')}</Text>
              <TextInput
                placeholder="250"
                placeholderTextColor={C.faint}
                keyboardType="decimal-pad"
                value={kcal}
                onChangeText={setKcal}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('add.grams')}</Text>
              <TextInput
                placeholder="—"
                placeholderTextColor={C.faint}
                keyboardType="decimal-pad"
                value={grams}
                onChangeText={setGrams}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('add.sugar')}</Text>
              <TextInput
                placeholder="—"
                placeholderTextColor={C.faint}
                keyboardType="decimal-pad"
                value={sugar}
                onChangeText={setSugar}
                style={styles.input}
              />
            </View>
          </View>
        </Card>
      </Section>

      <Section title={t('add.when')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {MEALS.map(m => (
            <Chip
              key={m}
              label={mealLabel(m)}
              selected={mealType === m}
              onPress={() => setMealType(m)}
            />
          ))}
        </View>
        <Card style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 15, color: C.ink }}>{t('add.time')}</Text>
          <TextInput
            value={time}
            onChangeText={setTime}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            style={[styles.input, { marginBottom: 0, minWidth: 84, textAlign: 'center' }]}
          />
        </Card>
      </Section>

      <BigButton label={t('add.save')} onPress={save} disabled={!valid} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerTitle: { fontFamily: F.heading, fontSize: 20, color: C.ink },
  headerBtn: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  lead: { fontSize: 14, color: C.muted, lineHeight: 20, marginBottom: 16 },
  fieldLabel: { fontSize: 12, color: C.muted, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12,
    fontSize: 15, color: C.ink, marginBottom: 10, backgroundColor: C.bg,
  },
});

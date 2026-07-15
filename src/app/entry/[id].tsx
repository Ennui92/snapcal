// Entry detail: fix mistakes fast. The big slider answers "how much of it
// did you actually eat?" and every item can be tweaked or removed.
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, radius } from '@/constants/theme';
import { BigButton, Card } from '@/components/ui';
import { analyzeEntry } from '@/lib/analyzer';
import {
  addManualItem, deleteEntry, deleteItem, getEntry, getItems,
  setEntryEatenPct, updateItemPortion, type Entry, type Item,
} from '@/lib/db';
import { fmtKcal, MEAL_EMOJI } from '@/lib/nutrition';
import { useStore } from '@/lib/store';

export default function EntryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Number(id);
  const insets = useSafeAreaInsets();
  const { refresh } = useStore();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [pct, setPct] = useState(100);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKcal, setNewKcal] = useState('');

  const load = useCallback(() => {
    const e = getEntry(entryId);
    setEntry(e);
    setItems(getItems(entryId));
    if (e) setPct(e.eatenPct);
  }, [entryId]);

  useEffect(() => { load(); }, [load]);

  // Keep polling while analysis is running.
  useEffect(() => {
    if (!entry || entry.status === 'done' || entry.status === 'error') return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [entry, load]);

  if (!entry) return <View style={styles.root} />;

  const consumed = (entry.totalKcal * pct) / 100;

  const commitPct = (v: number) => {
    const snapped = [0, 25, 50, 75, 100].reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    const final = Math.abs(snapped - v) <= 6 ? snapped : Math.round(v);
    setPct(final);
    setEntryEatenPct(entryId, final);
    Haptics.selectionAsync();
    refresh();
  };

  const onDelete = () => {
    Alert.alert('Delete this entry?', 'This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => { deleteEntry(entryId); refresh(); router.back(); },
      },
    ]);
  };

  const onReanalyze = () => {
    void analyzeEntry(entryId).then(() => { load(); refresh(); });
    load();
  };

  const addItem = () => {
    const kcal = parseFloat(newKcal);
    if (!newName.trim() || !isFinite(kcal)) return;
    addManualItem(entryId, newName.trim(), kcal);
    setNewName(''); setNewKcal(''); setAdding(false);
    load(); refresh();
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
      <View style={styles.photoWrap}>
        {entry.photoUri && <Image source={{ uri: entry.photoUri }} style={styles.photo} />}
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 8 }]}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>‹ back</Text>
        </Pressable>
      </View>

      <View style={{ padding: 16 }}>
        <Text style={styles.title}>
          {MEAL_EMOJI[entry.mealType] ?? ''} {entry.status === 'done' ? entry.description : entry.status === 'error' ? 'Analysis failed' : 'Analyzing your plate…'}
        </Text>
        <Text style={styles.subtitle}>
          {new Date(entry.takenAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {entry.mealType}
        </Text>

        {entry.status === 'error' && (
          <Card style={{ marginTop: 12, backgroundColor: C.redSoft, borderColor: C.red }}>
            <Text style={{ color: C.red, marginBottom: 10 }}>{entry.errorMsg ?? 'Something went wrong.'}</Text>
            <BigButton label="Try again" onPress={onReanalyze} />
          </Card>
        )}

        <Card style={{ marginTop: 16, alignItems: 'center' }}>
          <Text style={styles.kcalBig}>{fmtKcal(consumed)} kcal</Text>
          {pct !== 100 && (
            <Text style={styles.kcalStrike}>{fmtKcal(entry.totalKcal)} kcal for the full plate</Text>
          )}
          <Text style={styles.macros}>
            {Math.round((entry.proteinG * pct) / 100)}g protein · {Math.round((entry.carbsG * pct) / 100)}g carbs · {Math.round((entry.fatG * pct) / 100)}g fat
          </Text>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Text style={styles.sliderLabel}>How much did you eat?</Text>
          <Text style={styles.sliderValue}>{pct}%</Text>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={pct}
            onValueChange={setPct}
            onSlidingComplete={commitPct}
            minimumTrackTintColor={C.amber}
            maximumTrackTintColor={C.border}
            thumbTintColor={C.amber}
            style={{ height: 44 }}
          />
          <View style={styles.sliderMarks}>
            {[0, 25, 50, 75, 100].map(v => (
              <Pressable key={v} onPress={() => commitPct(v)} hitSlop={8}>
                <Text style={[styles.sliderMark, pct === v && { color: C.amber, fontWeight: '700' }]}>{v}%</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Text style={styles.sectionTitle}>On the plate</Text>
        {items.map(it => (
          <Card key={it.id} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>
                {it.brand ? `${it.brand} ` : ''}{it.name}
              </Text>
              <Text style={styles.itemMeta}>
                {it.portionGrams > 0 ? `${Math.round(it.portionGrams)}g · ` : ''}{fmtKcal(it.kcal)} kcal
                {it.isPackaged ? ' · 📦 saved to your foods' : ''}
              </Text>
              {it.portionGrams > 0 && (
                <View style={styles.stepper}>
                  {([0.75, 1.25] as const).map(f => (
                    <Pressable
                      key={f}
                      style={styles.stepBtn}
                      onPress={() => { updateItemPortion(it.id, it.portionGrams * f); load(); refresh(); }}
                    >
                      <Text style={styles.stepBtnText}>{f < 1 ? 'smaller' : 'bigger'}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <Pressable
              onPress={() => { deleteItem(it.id); load(); refresh(); }}
              hitSlop={10}
              style={{ paddingLeft: 10 }}
            >
              <Text style={{ fontSize: 16, color: C.faint }}>✕</Text>
            </Pressable>
          </Card>
        ))}

        {adding ? (
          <Card style={{ marginTop: 4 }}>
            <TextInput
              placeholder="What was it? (e.g. olive oil on the salad)"
              placeholderTextColor={C.faint}
              value={newName}
              onChangeText={setNewName}
              style={styles.input}
            />
            <TextInput
              placeholder="Calories"
              placeholderTextColor={C.faint}
              value={newKcal}
              onChangeText={setNewKcal}
              keyboardType="numeric"
              style={styles.input}
            />
            <BigButton label="Add item" onPress={addItem} />
          </Card>
        ) : (
          <BigButton label="+ Add something the AI missed" kind="ghost" onPress={() => setAdding(true)} style={{ marginTop: 4 }} />
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <BigButton label="Re-analyze" kind="ghost" onPress={onReanalyze} style={{ flex: 1 }} />
          <BigButton label="Delete" kind="ghost" onPress={onDelete} style={{ flex: 1 }} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  photoWrap: { width: '100%', height: 280, backgroundColor: '#141210' },
  photo: { width: '100%', height: '100%' },
  backBtn: {
    position: 'absolute', left: 14, backgroundColor: 'rgba(28,24,19,0.6)',
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill,
  },
  title: { fontFamily: F.heading, fontSize: 21, color: C.ink },
  subtitle: { color: C.muted, marginTop: 4, textTransform: 'capitalize' },
  kcalBig: { fontFamily: F.heading, fontSize: 36, color: C.ink },
  kcalStrike: { color: C.faint, textDecorationLine: 'line-through', marginTop: 2 },
  macros: { color: C.muted, marginTop: 8, fontSize: 13 },
  sliderLabel: { fontSize: 15, fontWeight: '600', color: C.ink },
  sliderValue: { fontFamily: F.heading, fontSize: 28, color: C.amber, marginTop: 4 },
  sliderMarks: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  sliderMark: { fontSize: 12, color: C.faint },
  sectionTitle: { fontFamily: F.heading, fontSize: 18, color: C.ink, marginTop: 22, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, padding: 14 },
  itemName: { fontSize: 15, fontWeight: '600', color: C.ink },
  itemMeta: { fontSize: 13, color: C.muted, marginTop: 3 },
  stepper: { flexDirection: 'row', gap: 8, marginTop: 8 },
  stepBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: radius.pill,
    paddingVertical: 5, paddingHorizontal: 12, backgroundColor: C.bg,
  },
  stepBtnText: { fontSize: 12, color: C.ink, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12,
    fontSize: 15, color: C.ink, marginBottom: 10, backgroundColor: C.bg,
  },
});

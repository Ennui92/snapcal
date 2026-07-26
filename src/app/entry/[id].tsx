// Entry detail: fix mistakes fast. The big slider answers "how much of it
// did you actually eat?" and every item can be renamed, re-weighed, re-costed
// in kcal, or removed.
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, radius, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { BigButton, Card } from '@/components/ui';
import { analyzeEntry } from '@/lib/analyzer';
import {
  addManualItem, deleteEntry, deleteItem, getEntry, getItems,
  setEntryEatenPct, setEntryTime, updateItemNutrition, type Entry, type Item,
} from '@/lib/db';
import { localeTag, t } from '@/lib/i18n';
import { fmtKcal, mealLabel } from '@/lib/nutrition';
import { useStore } from '@/lib/store';
import { Icon } from '@/components/icons';
import { goBackOrHome } from '@/lib/nav';

const QUICK_DELTAS = [-25, -10, 10, 25];
const QUICK_WEIGHTS = [100, 150, 200, 300];

export default function EntryDetail() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
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
  const [editingTime, setEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState('');

  // Item edit state: at most one item row is open at a time.
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editGrams, setEditGrams] = useState('');
  const [editKcal, setEditKcal] = useState('');

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
    Alert.alert(t('entry.deleteTitle'), t('entry.deleteBody'), [
      { text: t('entry.keep'), style: 'cancel' },
      {
        text: t('entry.delete'), style: 'destructive',
        onPress: () => { deleteEntry(entryId); refresh(); goBackOrHome(); },
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

  const startTimeEdit = () => {
    const d = new Date(entry.takenAt);
    setTimeInput(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setEditingTime(true);
  };

  const saveTime = () => {
    const m = timeInput.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m) return;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return;
    const d = new Date(entry.takenAt);
    d.setHours(h, min);
    setEntryTime(entryId, d);
    setEditingTime(false);
    Haptics.selectionAsync();
    load(); refresh();
  };

  // --- item correction: rename, re-weigh, re-cost in kcal ---

  const startItemEdit = (it: Item) => {
    setEditingItemId(it.id);
    setEditName(it.name);
    setEditGrams(it.portionGrams > 0 ? String(Math.round(it.portionGrams)) : '');
    setEditKcal(String(Math.round(it.kcal)));
    Haptics.selectionAsync();
  };

  const closeItemEdit = () => setEditingItemId(null);

  // Weight changed: live-rescale the kcal preview from this item's own ratio
  // (per-100g for packaged foods, kcal/portion otherwise) before anything is saved.
  const onGramsChange = (text: string) => {
    setEditGrams(text);
    const it = items.find(i => i.id === editingItemId);
    if (!it) return;
    const grams = parseFloat(text);
    if (!isFinite(grams) || grams < 0) return;
    if (it.isPackaged && it.kcalPer100g > 0) {
      setEditKcal(String(Math.round((it.kcalPer100g * grams) / 100)));
    } else if (it.portionGrams > 0) {
      setEditKcal(String(Math.round((it.kcal * grams) / it.portionGrams)));
    }
  };

  const setGramsTo = (grams: number) => onGramsChange(String(Math.round(grams)));

  const bumpGrams = (factor: number) => {
    const current = parseFloat(editGrams);
    const base = isFinite(current) && current > 0 ? current : 100;
    setGramsTo(base * factor);
  };

  const saveItemEdit = () => {
    if (editingItemId == null) return;
    const it = items.find(i => i.id === editingItemId);
    if (!it) return;
    const grams = parseFloat(editGrams);
    const kcal = parseFloat(editKcal);
    updateItemNutrition(editingItemId, {
      name: editName.trim() || it.name,
      portionGrams: isFinite(grams) ? grams : undefined,
      kcal: isFinite(kcal) ? kcal : undefined,
    });
    setEditingItemId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    load(); refresh();
  };

  const onDeleteItem = (itemId: number) => {
    deleteItem(itemId);
    if (editingItemId === itemId) setEditingItemId(null);
    load(); refresh();
  };

  const previewKcal = Math.round(parseFloat(editKcal) || 0);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
      <View style={styles.photoWrap}>
        {entry.photoUri && <Image source={{ uri: entry.photoUri }} style={styles.photo} />}
        <Pressable onPress={() => goBackOrHome()} style={[styles.backBtn, { top: insets.top + 8 }]}>
          <Icon name="back" size={18} color={C.ink} weight={2.2} />
        </Pressable>
      </View>

      <View style={{ padding: 16 }}>
        <Text style={styles.title}>
          {entry.status === 'done' ? entry.description : entry.status === 'error' ? t('entry.analysisFailed') : t('entry.analyzing')}
        </Text>
        {editingTime ? (
          <View style={styles.timeEditRow}>
            <TextInput
              value={timeInput}
              onChangeText={setTimeInput}
              placeholder="13:45"
              placeholderTextColor={C.faint}
              keyboardType="numbers-and-punctuation"
              autoFocus
              maxLength={5}
              style={styles.timeInput}
            />
            <Pressable onPress={saveTime} style={styles.timeBtn}>
              <Text style={{ color: C.onSignal, fontWeight: '700' }}>{t('common.save')}</Text>
            </Pressable>
            <Pressable onPress={() => setEditingTime(false)} style={[styles.timeBtn, styles.timeBtnGhost]}>
              <Text style={{ color: C.muted, fontWeight: '600' }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={startTimeEdit} hitSlop={6}>
            <Text style={styles.subtitle}>
              {new Date(entry.takenAt).toLocaleString(localeTag(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {mealLabel(entry.mealType)}  <Text style={{ color: C.signal }}>{t('entry.editTime')}</Text>
            </Text>
          </Pressable>
        )}

        {entry.status === 'error' && (
          <Card style={{ marginTop: 12, backgroundColor: C.redSoft, borderColor: C.red }}>
            <Text style={{ color: C.red, marginBottom: 10 }}>{entry.errorMsg ?? t('entry.errorGeneric')}</Text>
            <BigButton label={t('entry.tryAgain')} onPress={onReanalyze} />
          </Card>
        )}

        <Card style={{ marginTop: 16, alignItems: 'center' }}>
          <Text style={styles.kcalBig}>{fmtKcal(consumed)} kcal</Text>
          {pct !== 100 && (
            <Text style={styles.kcalStrike}>{t('entry.kcalFull', { kcal: fmtKcal(entry.totalKcal) })}</Text>
          )}
          <Text style={styles.macros}>
            {t('entry.macros', {
              p: Math.round((entry.proteinG * pct) / 100),
              c: Math.round((entry.carbsG * pct) / 100),
              f: Math.round((entry.fatG * pct) / 100),
              s: Math.round((entry.sugarG * pct) / 100),
            })}
          </Text>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Text style={styles.sliderLabel}>{t('entry.howMuch')}</Text>
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

        <Text style={styles.sectionTitle}>{t('entry.onPlate')}</Text>
        {items.map(it => {
          const isEditing = editingItemId === it.id;
          return (
            <Card key={it.id} style={styles.itemCard}>
              <Pressable
                onPress={() => (isEditing ? closeItemEdit() : startItemEdit(it))}
                style={styles.itemRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>
                    {it.brand ? `${it.brand} ` : ''}{it.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {it.portionGrams > 0 ? `${Math.round(it.portionGrams)}g · ` : ''}{fmtKcal(it.kcal)} kcal
                    {it.sugarG >= 1 ? ` · ${t('entry.itemSugar', { s: Math.round(it.sugarG) })}` : ''}
                    {it.isPackaged ? ` · ${t('entry.savedFood')}` : ''}
                  </Text>
                </View>
                <View style={{ transform: [{ rotate: isEditing ? '90deg' : '0deg' }] }}>
                  <Icon name="chevron" size={15} color={C.faint} weight={2} />
                </View>
              </Pressable>

              {isEditing && (
                <View style={styles.editBox}>
                  <Text style={styles.editLabel}>Name</Text>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    style={styles.input}
                    placeholder="What is it actually?"
                    placeholderTextColor={C.faint}
                  />

                  {it.isPackaged && it.kcalPer100g > 0 && (
                    <Text style={styles.editHint}>
                      Packaged food · {Math.round(it.kcalPer100g)} kcal per 100g — editing weight rescales from this
                    </Text>
                  )}

                  <Text style={styles.editLabel}>Weight (g)</Text>
                  <TextInput
                    value={editGrams}
                    onChangeText={onGramsChange}
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="grams"
                    placeholderTextColor={C.faint}
                  />
                  <View style={styles.quickRow}>
                    {QUICK_DELTAS.map(p => (
                      <Pressable key={p} style={styles.quickBtn} onPress={() => bumpGrams(1 + p / 100)}>
                        <Text style={styles.quickBtnText}>{p > 0 ? `+${p}%` : `${p}%`}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.quickRow}>
                    {QUICK_WEIGHTS.map(g => (
                      <Pressable key={g} style={styles.quickBtn} onPress={() => setGramsTo(g)}>
                        <Text style={styles.quickBtnText}>{g}g</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.editLabel}>Calories</Text>
                  <TextInput
                    value={editKcal}
                    onChangeText={setEditKcal}
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="kcal"
                    placeholderTextColor={C.faint}
                  />
                  <Text style={styles.previewText}>{previewKcal} kcal</Text>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <BigButton label={t('common.save')} onPress={saveItemEdit} style={{ flex: 1 }} />
                    <BigButton label={t('common.cancel')} kind="ghost" onPress={closeItemEdit} style={{ flex: 1 }} />
                  </View>
                  <Pressable onPress={() => onDeleteItem(it.id)} style={styles.deleteRow} hitSlop={8}>
                    <Icon name="trash" size={14} color={C.danger} weight={2} />
                    <Text style={styles.deleteRowText}>{t('entry.delete')}</Text>
                  </Pressable>
                </View>
              )}
            </Card>
          );
        })}

        {adding ? (
          <Card style={{ marginTop: 4 }}>
            <TextInput
              placeholder={t('entry.addNamePlaceholder')}
              placeholderTextColor={C.faint}
              value={newName}
              onChangeText={setNewName}
              style={styles.input}
            />
            <TextInput
              placeholder={t('entry.addKcalPlaceholder')}
              placeholderTextColor={C.faint}
              value={newKcal}
              onChangeText={setNewKcal}
              keyboardType="numeric"
              style={styles.input}
            />
            <BigButton label={t('entry.addItem')} onPress={addItem} />
          </Card>
        ) : (
          <BigButton label={t('entry.addMissed')} kind="ghost" onPress={() => setAdding(true)} style={{ marginTop: 4 }} />
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <BigButton label={t('entry.reanalyze')} kind="ghost" onPress={onReanalyze} style={{ flex: 1 }} />
          <BigButton label={t('entry.delete')} kind="ghost" onPress={onDelete} style={{ flex: 1 }} />
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  // contain, not cover: show the plate exactly as shot, letterboxed on dark
  photoWrap: { width: '100%', height: 320, backgroundColor: '#141210' },
  photo: { width: '100%', height: '100%', resizeMode: 'contain' },
  backBtn: {
    position: 'absolute', left: 14, backgroundColor: 'rgba(28,24,19,0.6)',
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill,
  },
  title: { fontFamily: F.heading, fontSize: 21, color: C.ink },
  subtitle: { color: C.muted, marginTop: 4, textTransform: 'capitalize' },
  timeEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  timeInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14,
    fontSize: 16, color: C.ink, minWidth: 84, textAlign: 'center', backgroundColor: C.card,
  },
  timeBtn: { backgroundColor: C.amber, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  timeBtnGhost: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  kcalBig: { fontFamily: F.heading, fontSize: 36, color: C.ink },
  kcalStrike: { color: C.faint, textDecorationLine: 'line-through', marginTop: 2 },
  macros: { color: C.muted, marginTop: 8, fontSize: 13 },
  sliderLabel: { fontSize: 15, fontWeight: '600', color: C.ink },
  sliderValue: { fontFamily: F.heading, fontSize: 28, color: C.amber, marginTop: 4 },
  sliderMarks: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  sliderMark: { fontSize: 12, color: C.faint },
  sectionTitle: { fontFamily: F.heading, fontSize: 18, color: C.ink, marginTop: 22, marginBottom: 10 },
  itemCard: { marginBottom: 10, padding: 0, overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  itemName: { fontSize: 15, fontWeight: '600', color: C.ink },
  itemMeta: { fontSize: 13, color: C.muted, marginTop: 3 },
  editBox: {
    paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  editLabel: { fontSize: 11, fontWeight: '700', color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 6 },
  editHint: { fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 17 },
  previewText: { fontFamily: F.heading, fontSize: 20, color: C.amber, marginTop: 6 },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quickBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: radius.pill,
    paddingVertical: 6, paddingHorizontal: 12, backgroundColor: C.bg,
  },
  quickBtnText: { fontSize: 12, color: C.ink, fontWeight: '600' },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 14, paddingVertical: 4 },
  deleteRowText: { fontSize: 13, color: C.danger, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12,
    fontSize: 15, color: C.ink, marginBottom: 10, backgroundColor: C.bg,
  },
});

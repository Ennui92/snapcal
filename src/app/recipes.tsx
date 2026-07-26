// Next-meal suggestions: given what's left in today's budget, ask Gemini
// for a few real meals that fit. Runs automatically on open; pull the
// refresh action in the header to get a new batch.
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, label, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { BigButton, Card, Grain, IconButton, Readout, ScreenHeader, Section } from '@/components/ui';
import { Icon } from '@/components/icons';
import { consumedForDay, dayKeyFor, getProfile } from '@/lib/db';
import { fmtKcal } from '@/lib/nutrition';
import { suggestMeals, type MealSuggestion, type SuggestResult } from '@/lib/recipes';
import { goBackOrHome } from '@/lib/nav';

type LoadState = 'loading' | 'ready' | 'error';

const GOAL_TEXT: Record<string, string> = {
  lose: 'Cutting — favoring higher protein, filling meals',
  gain: 'Bulking — favoring calorie-dense, higher protein meals',
  maintain: 'Maintaining — favoring balanced meals',
};

export default function RecipesScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<LoadState>('loading');
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Shown instantly, independent of the AI call finishing.
  const profile = getProfile();
  const dayKey = useMemo(() => dayKeyFor(new Date()), []);
  const consumed = consumedForDay(dayKey);
  const budget = profile.dailyBudgetKcal;
  const remaining = budget - consumed;

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setState('loading');
    setErrorMsg('');
    try {
      const r = await suggestMeals();
      setResult(r);
      setState('ready');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setState('error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = state === 'loading' || refreshing;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Grain />
      <ScreenHeader
        title="NEXT MEAL"
        left={<IconButton icon="back" onPress={() => goBackOrHome()} />}
        right={<IconButton icon="refresh" onPress={() => load(true)} tone={busy ? 'default' : 'signal'} />}
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.remainingBlock}>
          <Text style={styles.remainingLabel}>Remaining today</Text>
          <Readout
            value={fmtKcal(Math.max(0, Math.round(remaining)))}
            unit="kcal left"
            tone={remaining < 0 ? 'danger' : 'signal'}
            size={46}
          />
          <Text style={styles.subline}>
            {fmtKcal(consumed)} eaten of {fmtKcal(budget)} budget
          </Text>
          <Text style={styles.goalNote}>{GOAL_TEXT[profile.goal] ?? ''}</Text>
        </View>

        {state === 'loading' && (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={C.signal} />
            <Text style={styles.statusText}>Finding meals that fit…</Text>
          </View>
        )}

        {state === 'error' && (
          <Card style={{ marginTop: 8 }}>
            <View style={styles.errorHead}>
              <Icon name="warn" size={18} color={C.danger} />
              <Text style={styles.errorTitle}>Couldn't get suggestions</Text>
            </View>
            <Text style={styles.errorBody}>{errorMsg || 'Something went wrong talking to the model.'}</Text>
            <BigButton label="Try again" icon="sparkle" onPress={() => load(false)} style={{ marginTop: 14 }} />
          </Card>
        )}

        {state === 'ready' && result && (
          result.meals.length === 0 ? (
            <Card style={{ marginTop: 8, alignItems: 'center', paddingVertical: 28 }}>
              <Icon name="cutlery" size={26} color={C.faint} weight={1.6} />
              <Text style={styles.emptyText}>No suggestions came back. Try refreshing.</Text>
              <BigButton label="Suggest meals" icon="sparkle" onPress={() => load(false)} style={{ marginTop: 14 }} />
            </Card>
          ) : (
            <Section title={`Suggestions · ${result.meals.length}`}>
              {result.meals.map((meal, i) => (
                <MealCard key={`${meal.name}-${i}`} meal={meal} />
              ))}
              <BigButton
                label={refreshing ? 'Refreshing…' : 'Suggest different meals'}
                icon="refresh"
                kind="ghost"
                disabled={busy}
                onPress={() => load(true)}
                style={{ marginTop: 4 }}
              />
            </Section>
          )
        )}
      </ScrollView>
    </View>
  );
}

function MealCard({ meal }: { meal: MealSuggestion }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [open, setOpen] = useState(false);
  return (
    <Card style={styles.mealCard}>
      <View style={styles.mealHead}>
        <Text style={styles.mealName} numberOfLines={2}>{meal.name}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Readout value={fmtKcal(Math.round(meal.kcal))} unit="kcal" size={19} />
        </View>
      </View>

      <Text style={styles.macroLine}>
        P {Math.round(meal.proteinG)}g · C {Math.round(meal.carbsG)}g · F {Math.round(meal.fatG)}g
      </Text>

      <Text style={styles.blurb}>{meal.blurb}</Text>

      {meal.ingredients.length > 0 && (
        <>
          <Pressable
            onPress={() => setOpen(o => !o)}
            style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.7 }]}
            hitSlop={6}
          >
            <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
              <Icon name="chevron" size={13} color={C.muted} weight={2} />
            </View>
            <Text style={styles.toggleText}>
              {open ? 'Hide ingredients' : `Ingredients (${meal.ingredients.length})`}
            </Text>
          </Pressable>
          {open && (
            <View style={styles.ingredientsList}>
              {meal.ingredients.map((ing, i) => (
                <Text key={i} style={styles.ingredient}>· {ing}</Text>
              ))}
            </View>
          )}
        </>
      )}
    </Card>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  remainingBlock: { alignItems: 'center', paddingVertical: 18, marginBottom: 6 },
  remainingLabel: { ...label, marginBottom: 10 },
  subline: { fontFamily: F.monoLight, fontSize: 12.5, color: C.muted, marginTop: 10 },
  goalNote: { fontSize: 12, color: C.faint, marginTop: 6 },
  centerBlock: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  statusText: { ...label, color: C.muted },
  errorHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  errorTitle: { fontFamily: F.heading, fontSize: 16, color: C.ink },
  errorBody: { fontSize: 13.5, color: C.muted, lineHeight: 19 },
  emptyText: { fontSize: 13.5, color: C.muted, marginTop: 12, textAlign: 'center' },
  mealCard: { marginBottom: 12 },
  mealHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  mealName: { flex: 1, fontFamily: F.heading, fontSize: 16.5, color: C.ink, letterSpacing: -0.2 },
  macroLine: { fontFamily: F.mono, fontSize: 11.5, color: C.muted, marginTop: 8, letterSpacing: 0.3 },
  blurb: { fontSize: 13.5, color: C.ink, lineHeight: 19, marginTop: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  toggleText: { ...label, fontSize: 10, color: C.muted },
  ingredientsList: {
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.hairline, gap: 4,
  },
  ingredient: { fontSize: 13, color: C.muted, lineHeight: 18 },
});

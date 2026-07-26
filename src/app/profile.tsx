// "You": the profile screen. Everything here is computed straight from the
// on-device SQLite (db.ts) plus the display name/bio the user sets for
// themselves (social.ts) — no accounts, no server, no other people. It is the
// part of "social" that can genuinely exist before Firebase lands: a mirror,
// not a network. See feed.tsx and lib/social.ts for the wall this links to.
import { router } from 'expo-router';
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DARK, F, radius, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { BigButton, Card, Grain, IconButton, ScreenHeader, Section } from '@/components/ui';
import { Icon } from '@/components/icons';
import { captureCard, getProfileMeta, setProfileMeta, shareImage } from '@/lib/social';
import {
  consumedForDay, dayKeyFor, daySummaries, getEntriesForDay, getProfile, getWeights, type Profile,
} from '@/lib/db';
import { isPremium, trialDaysLeft } from '@/lib/premium';
import { fmtKcal } from '@/lib/nutrition';
import { goBackOrHome } from '@/lib/nav';

type LifetimeStats = {
  daysLogged: number;
  totalMeals: number;
  currentStreak: number;
  bestStreak: number;
  daysOnBudget: number;
  avgKcalPerDay: number;
  weightChangeKg: number | null;
};

// Every number on this screen comes from daySummaries/getWeights/consumedForDay/
// getEntriesForDay — real history, never a placeholder. "Lifetime" is bounded
// by 1970-01-01 as a floor, which is really just "since the user's first
// entry": daySummaries only ever returns rows for days that have entries.
function computeLifetimeStats(profile: Profile): LifetimeStats {
  const today = dayKeyFor(new Date());
  const sums = daySummaries('1970-01-01', today); // ascending by dayKey
  const loggedDays = sums.filter(s => s.entries > 0);
  const daysLogged = loggedDays.length;
  const totalMeals = loggedDays.reduce((a, s) => a + s.entries, 0);
  const daysOnBudget = loggedDays.filter(s => s.consumed <= profile.dailyBudgetKcal).length;
  const avgKcalPerDay = daysLogged > 0
    ? Math.round(loggedDays.reduce((a, s) => a + s.consumed, 0) / daysLogged)
    : 0;

  let bestStreak = 0;
  let run = 0;
  for (const s of sums) {
    if (s.entries > 0 && s.consumed <= profile.dailyBudgetKcal) { run++; bestStreak = Math.max(bestStreak, run); }
    else run = 0;
  }

  // Today's own status is read straight from entries/consumedForDay (not the
  // sums map above) so the streak agrees with what Today's ring shows right
  // now rather than a stale aggregate.
  const todaysEntries = getEntriesForDay(today).filter(e => e.status === 'done');
  const todayOnBudget = todaysEntries.length > 0 && consumedForDay(today) <= profile.dailyBudgetKcal;
  const byKey = new Map(sums.map(s => [s.dayKey, s]));
  let currentStreak = 0;
  const cursor = new Date();
  if (todayOnBudget) currentStreak++;
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 3650; i++) {
    const key = dayKeyFor(cursor);
    const s = byKey.get(key);
    if (s && s.entries > 0 && s.consumed <= profile.dailyBudgetKcal) currentStreak++;
    else break;
    cursor.setDate(cursor.getDate() - 1);
  }

  const weights = getWeights();
  const weightChangeKg = weights.length > 0
    ? Math.round((weights[weights.length - 1].weightKg - weights[0].weightKg) * 10) / 10
    : null;

  return { daysLogged, totalMeals, currentStreak, bestStreak, daysOnBudget, avgKcalPerDay, weightChangeKg };
}

type Badge = { title: string; detail: string; earned: boolean };

// Only ever awards what the numbers above actually support — no participation
// trophies.
function buildBadges(stats: LifetimeStats): Badge[] {
  return [
    { title: 'First bite', detail: 'Log your first meal', earned: stats.totalMeals >= 1 },
    { title: 'Week streak', detail: '7 days on budget in a row', earned: stats.bestStreak >= 7 },
    { title: '30 days logged', detail: 'Log any 30 days, total', earned: stats.daysLogged >= 30 },
    { title: 'Century club', detail: '100 meals logged', earned: stats.totalMeals >= 100 },
  ];
}

function StatTile({ value, text }: { value: string; text: string }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <Card style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{text}</Text>
    </Card>
  );
}

// --- profile share card -----------------------------------------------------
// No ProfileShareCard exists yet in components/share-card.tsx, so this is
// composed locally, following the exact conventions that file uses: fixed
// size, always the DARK palette (a shared image must look the same for
// everyone, regardless of the viewer's theme), captured off-screen by the
// same captureCard/shareImage pipeline feed.tsx already relies on.
const D = DARK;
const CARD_WIDTH = 340;
const CARD_RATIO = 1.25;

const ProfileShareCard = forwardRef<View, { name: string; bio: string; stats: LifetimeStats }>(
  function ProfileShareCard({ name, bio, stats }, ref) {
    const height = Math.round(CARD_WIDTH * CARD_RATIO);
    const letter = (name.trim().charAt(0) || 'Y').toUpperCase();
    return (
      <View ref={ref} collapsable={false} style={[cardStyles.card, { width: CARD_WIDTH, height }]}>
        <View style={cardStyles.brand}>
          <View style={cardStyles.brandMark}>
            <Icon name="bolt" size={12} color={D.onSignal} weight={2.4} />
          </View>
          <Text style={cardStyles.brandText}>SNAPCAL</Text>
        </View>

        <View style={cardStyles.avatar}>
          <Text style={cardStyles.avatarLetter}>{letter}</Text>
        </View>
        <Text style={cardStyles.name}>{name.trim() || 'Tracking with SnapCal'}</Text>
        {bio.trim() ? <Text style={cardStyles.bio} numberOfLines={2}>{bio.trim()}</Text> : null}

        <View style={cardStyles.statsGrid}>
          <ShareStat value={String(stats.daysLogged)} label="Days logged" />
          <ShareStat value={String(stats.currentStreak)} label="Day streak" />
          <ShareStat value={String(stats.totalMeals)} label="Meals" />
        </View>

        <Text style={cardStyles.tagline}>tracked with SnapCal</Text>
      </View>
    );
  },
);

function ShareStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={cardStyles.statBlock}>
      <Text style={cardStyles.statValue}>{value}</Text>
      <Text style={cardStyles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const profile = getProfile();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [capturing, setCapturing] = useState(false);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    const meta = getProfileMeta();
    setDisplayName(meta.displayName);
    setBio(meta.bio);
  }, []);

  const saveMeta = useCallback((name: string, bioText: string) => {
    setProfileMeta({ displayName: name.trim(), bio: bioText.trim() });
  }, []);

  const stats = useMemo(() => computeLifetimeStats(profile), [profile]);
  const badges = useMemo(() => buildBadges(stats), [stats]);

  const premium = isPremium();
  const daysLeft = trialDaysLeft();
  const planLabel = daysLeft > 0
    ? `Trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
    : premium ? 'Plus member' : 'Free plan';

  const letter = (displayName.trim().charAt(0) || 'Y').toUpperCase();

  const weightLabel = stats.weightChangeKg === null
    ? '—'
    : `${stats.weightChangeKg > 0 ? '+' : ''}${stats.weightChangeKg.toFixed(1)} kg`;

  const shareProfileCard = async () => {
    setCapturing(true);
    try {
      const uri = await captureCard(cardRef);
      await shareImage(uri, `${displayName.trim() || 'My'} SnapCal profile`);
    } catch {
      Alert.alert('Could not share', 'Something went wrong creating the image. Try again.');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      <Grain />
      <ScreenHeader title="You" left={<IconButton icon="back" onPress={() => goBackOrHome()} />} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
        <Card style={styles.identityCard}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>{letter}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.nameInput}
                value={displayName}
                onChangeText={setDisplayName}
                onEndEditing={() => saveMeta(displayName, bio)}
                placeholder="Your name"
                placeholderTextColor={C.faint}
                maxLength={40}
              />
              <TextInput
                style={styles.bioInput}
                value={bio}
                onChangeText={setBio}
                onEndEditing={() => saveMeta(displayName, bio)}
                placeholder="Add a one-line bio"
                placeholderTextColor={C.faint}
                maxLength={80}
              />
            </View>
          </View>
          <View style={styles.planRow}>
            <Icon name={premium ? 'sparkle' : 'clock'} size={13} color={premium ? C.signal : C.muted} weight={2} />
            <Text style={styles.planText}>{planLabel}</Text>
          </View>
        </Card>

        <Section title="Lifetime stats">
          <View style={styles.tileGrid}>
            <StatTile value={String(stats.daysLogged)} text="Days logged" />
            <StatTile value={String(stats.totalMeals)} text="Meals logged" />
            <StatTile value={String(stats.currentStreak)} text="Current streak" />
            <StatTile value={String(stats.bestStreak)} text="Best streak" />
            <StatTile value={String(stats.daysOnBudget)} text="Days on budget" />
            <StatTile value={fmtKcal(stats.avgKcalPerDay)} text="Avg kcal / day" />
            <StatTile value={weightLabel} text="Weight change" />
          </View>
        </Section>

        <Section title="Milestones">
          <Card>
            {badges.map((b, i) => (
              <View key={b.title} style={[styles.badgeRow, i > 0 && styles.badgeRowDivider]}>
                <Icon
                  name={b.earned ? 'check' : 'clock'}
                  size={16}
                  color={b.earned ? C.signal : C.faint}
                  weight={2}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.badgeTitle, !b.earned && { color: C.faint }]}>{b.title}</Text>
                  <Text style={styles.badgeDetail}>{b.detail}</Text>
                </View>
              </View>
            ))}
          </Card>
        </Section>

        <BigButton
          label="Share my profile card"
          icon="share"
          onPress={shareProfileCard}
          style={{ marginBottom: 14 }}
        />

        <View style={styles.linkRow}>
          <BigButton label="Stats" icon="chart" kind="ghost" onPress={() => router.push('/stats')} style={{ flex: 1 }} />
          <BigButton label="Wall" icon="share" kind="ghost" onPress={() => router.push('/feed')} style={{ flex: 1 }} />
        </View>
      </ScrollView>

      <View style={styles.offscreen} collapsable={false} pointerEvents="none">
        <ProfileShareCard ref={cardRef} name={displayName} bio={bio} stats={stats} />
      </View>

      {capturing && (
        <View style={styles.capturingOverlay}>
          <ActivityIndicator color={C.signal} />
          <Text style={styles.capturingText}>Preparing image…</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  identityCard: { marginBottom: 22 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56, height: 56, borderRadius: radius.card, backgroundColor: C.raised,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: F.mono, fontSize: 22, color: C.ink },
  nameInput: { fontFamily: F.heading, fontSize: 18, color: C.ink, letterSpacing: -0.3, padding: 0 },
  bioInput: { fontSize: 13.5, color: C.muted, marginTop: 4, padding: 0 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 },
  planText: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '47%', alignItems: 'center', paddingVertical: 18 },
  tileValue: { fontFamily: F.mono, fontSize: 20, color: C.ink, letterSpacing: -0.5 },
  tileLabel: { fontSize: 11, color: C.muted, marginTop: 4, textAlign: 'center' },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  badgeRowDivider: { borderTopWidth: 1, borderTopColor: C.hairline },
  badgeTitle: { fontSize: 14, color: C.ink, fontWeight: '600' },
  badgeDetail: { fontSize: 12, color: C.muted, marginTop: 2 },

  linkRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },

  offscreen: { position: 'absolute', left: -9999, top: 0, opacity: 1 },
  capturingOverlay: {
    ...StyleSheet.absoluteFill, backgroundColor: C.overlay,
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  capturingText: { fontFamily: F.mono, fontSize: 12, color: C.ink, letterSpacing: 0.5 },
});

// Card styles always use the DARK palette directly — never useColors() — so
// the shared image looks identical no matter the viewer's live theme.
const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: D.bg, borderRadius: radius.card, overflow: 'hidden',
    paddingHorizontal: 22, paddingTop: 20, paddingBottom: 18, alignItems: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginBottom: 30 },
  brandMark: {
    width: 20, height: 20, borderRadius: 5, backgroundColor: D.signal,
    alignItems: 'center', justifyContent: 'center',
  },
  brandText: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2.4, color: '#FFFFFF' },

  avatar: {
    width: 76, height: 76, borderRadius: radius.card, backgroundColor: D.raised,
    borderWidth: 1, borderColor: D.border, alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  avatarLetter: { fontFamily: F.mono, fontSize: 30, color: D.signal },
  name: { fontFamily: F.display, fontSize: 20, color: D.ink, textAlign: 'center' },
  bio: { fontSize: 13, color: D.muted, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  statsGrid: { flexDirection: 'row', gap: 26, marginTop: 22 },
  statBlock: { alignItems: 'center' },
  statValue: { fontFamily: F.mono, fontSize: 20, color: D.ink },
  statLabel: {
    fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: D.faint, marginTop: 3,
  },

  tagline: { fontFamily: F.monoLight, fontSize: 9.5, letterSpacing: 1, color: D.faint, marginTop: 22 },
});

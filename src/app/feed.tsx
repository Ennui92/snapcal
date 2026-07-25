// The feed: compose a share-card for a meal or the whole day, preview the
// captured PNG, share it or post it to the local feed below. See lib/social.ts
// for why "feed" today means "this device only."
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, radius, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { BigButton, Card, Grain, IconButton, ScreenHeader } from '@/components/ui';
import { EntryCard } from '@/components/entry-card';
import { Icon } from '@/components/icons';
import { DayShareCard, MealShareCard, type DaySharePayload } from '@/components/share-card';
import { addPost, captureCard, deletePost, getPosts, shareImage, type Post } from '@/lib/social';
import {
  consumedForDay, dayKeyFor, daySummaries, getEntriesForDay, getProfile, type Entry, type Profile,
} from '@/lib/db';
import { localeTag } from '@/lib/i18n';
import { fmtKcal } from '@/lib/nutrition';

type Preview = {
  kind: 'meal' | 'day';
  uri: string;
  caption: string;
  entryId: number | null;
  dayKey: string | null;
};

function recentEntriesWithPhotos(days = 7): Entry[] {
  const out: Entry[] = [];
  const cursor = new Date();
  for (let i = 0; i < days; i++) {
    const key = dayKeyFor(cursor);
    out.push(...getEntriesForDay(key).filter(e => e.photoUri && e.status === 'done'));
    cursor.setDate(cursor.getDate() - 1);
  }
  return out;
}

// Simple, self-contained streak check (consumed <= flat daily budget), so this
// screen doesn't need to reach into today.tsx's private helper or the tracked-
// activity pipeline just to put a number on a share card.
function computeStreak(profile: Profile): number {
  const today = dayKeyFor(new Date());
  const from = new Date();
  from.setDate(from.getDate() - 60);
  const sums = new Map(daySummaries(dayKeyFor(from), today).map(s => [s.dayKey, s]));
  const onBudget = (key: string) => {
    const s = sums.get(key);
    return !!s && s.entries > 0 && s.consumed <= profile.dailyBudgetKcal;
  };
  let streak = 0;
  const cursor = new Date();
  if (onBudget(today)) streak++;
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 60; i++) {
    if (onBudget(dayKeyFor(cursor))) streak++;
    else break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function buildDaySummary(profile: Profile): DaySharePayload {
  const dayKey = dayKeyFor(new Date());
  const entries = getEntriesForDay(dayKey);
  const done = entries.filter(e => e.status === 'done');
  const proteinG = done.reduce((a, e) => a + (e.proteinG * e.eatenPct) / 100, 0);
  const carbsG = done.reduce((a, e) => a + (e.carbsG * e.eatenPct) / 100, 0);
  const fatG = done.reduce((a, e) => a + (e.fatG * e.eatenPct) / 100, 0);
  const photos = entries.filter(e => e.photoUri).map(e => e.photoUri as string).slice(0, 4);
  const dateLabel = new Date().toLocaleDateString(localeTag(), { weekday: 'long', day: 'numeric', month: 'long' });
  return {
    dayKey,
    dateLabel,
    consumed: consumedForDay(dayKey),
    budget: profile.dailyBudgetKcal,
    proteinG, carbsG, fatG,
    mealCount: done.length,
    streak: computeStreak(profile),
    photos,
  };
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' });
}

function PostRow({ post, onDelete }: { post: Post; onDelete: (id: number) => void }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <Card style={styles.postCard}>
      <Image source={{ uri: post.imageUri }} style={styles.postImage} resizeMode="cover" />
      <View style={styles.postFooter}>
        <View style={{ flex: 1 }}>
          <Text style={styles.postCaption} numberOfLines={2}>{post.caption}</Text>
          <Text style={styles.postTime}>{relativeTime(post.createdAt)}</Text>
        </View>
        <IconButton icon="trash" onPress={() => onDelete(post.id)} />
      </View>
    </Card>
  );
}

export default function FeedScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [posts, setPosts] = useState<Post[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickEntries, setPickEntries] = useState<Entry[]>([]);
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null);
  const [activeDay, setActiveDay] = useState<DaySharePayload | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  const mealCardRef = useRef<View>(null);
  const dayCardRef = useRef<View>(null);

  const loadPosts = useCallback(() => setPosts(getPosts()), []);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    if (confirmMsg == null) return;
    const timer = setTimeout(() => setConfirmMsg(null), 2200);
    return () => clearTimeout(timer);
  }, [confirmMsg]);

  // Give the off-screen card a beat to lay out and its photo to decode before
  // grabbing pixels.
  useEffect(() => {
    if (!activeEntry) return;
    let cancelled = false;
    setCapturing(true);
    const timer = setTimeout(async () => {
      try {
        const uri = await captureCard(mealCardRef);
        if (cancelled) return;
        const consumed = Math.round((activeEntry.totalKcal * activeEntry.eatenPct) / 100);
        setPreview({
          kind: 'meal',
          uri,
          caption: `${activeEntry.description || 'A meal, logged'} — ${fmtKcal(consumed)} kcal`,
          entryId: activeEntry.id,
          dayKey: activeEntry.dayKey,
        });
      } catch {
        if (!cancelled) Alert.alert('Could not create image', 'Something went wrong capturing the card. Try again.');
      } finally {
        if (!cancelled) { setCapturing(false); setActiveEntry(null); }
      }
    }, 280);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeEntry]);

  useEffect(() => {
    if (!activeDay) return;
    let cancelled = false;
    setCapturing(true);
    const timer = setTimeout(async () => {
      try {
        const uri = await captureCard(dayCardRef);
        if (cancelled) return;
        setPreview({
          kind: 'day',
          uri,
          caption: `${activeDay.dateLabel} — ${fmtKcal(activeDay.consumed)} / ${fmtKcal(activeDay.budget)} kcal`,
          entryId: null,
          dayKey: activeDay.dayKey,
        });
      } catch {
        if (!cancelled) Alert.alert('Could not create image', 'Something went wrong capturing the card. Try again.');
      } finally {
        if (!cancelled) { setCapturing(false); setActiveDay(null); }
      }
    }, 280);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeDay]);

  const openMealPicker = () => {
    setPickEntries(recentEntriesWithPhotos());
    setPickerOpen(true);
  };

  const pickMeal = (entry: Entry) => {
    setPickerOpen(false);
    setActiveEntry(entry);
  };

  const shareDay = () => setActiveDay(buildDaySummary(getProfile()));

  const closePreview = () => setPreview(null);

  const doShare = async () => {
    if (!preview) return;
    try {
      await shareImage(preview.uri, preview.caption);
    } catch {
      Alert.alert('Could not share', 'Sharing failed, but the image is still ready to post to your feed.');
    }
  };

  const doPost = () => {
    if (!preview) return;
    addPost({
      kind: preview.kind,
      entryId: preview.entryId,
      dayKey: preview.dayKey,
      caption: preview.caption,
      imageUri: preview.uri,
    });
    loadPosts();
    setConfirmMsg('Posted to your feed.');
    setPreview(null);
  };

  const onDeletePost = (id: number) => {
    Alert.alert('Delete post', 'Remove this post from your feed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deletePost(id); loadPosts(); } },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      <Grain />
      <ScreenHeader title="Feed" left={<IconButton icon="back" onPress={() => router.back()} />} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
        {confirmMsg && (
          <View style={styles.confirmBanner}>
            <Icon name="check" size={14} color={C.onSignal} weight={2.2} />
            <Text style={styles.confirmText}>{confirmMsg}</Text>
          </View>
        )}

        <Card style={styles.composer}>
          <Text style={styles.composerTitle}>Share your progress</Text>
          <Text style={styles.composerSub}>Turn a meal or your whole day into an image worth posting.</Text>
          <View style={styles.composerActions}>
            <BigButton label="Share a meal" icon="cutlery" onPress={openMealPicker} style={{ flex: 1 }} />
            <BigButton label="Share my day" icon="chart" kind="ghost" onPress={shareDay} style={{ flex: 1 }} />
          </View>
        </Card>

        <View style={styles.feedHead}>
          <Text style={styles.feedHeadTitle}>YOUR FEED</Text>
          <View style={styles.rule} />
        </View>

        {posts.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="share" size={24} color={C.faint} weight={1.6} />
            </View>
            <Text style={styles.emptyTitle}>Nothing shared yet</Text>
            <Text style={styles.emptyText}>
              This feed lives on your device only. Share a meal or your day above, then post it here to
              keep a record — a feed you share with friends is coming next.
            </Text>
          </View>
        ) : (
          posts.map(post => <PostRow key={post.id} post={post} onDelete={onDeletePost} />)
        )}
      </ScrollView>

      {/* Off-screen render targets: laid out for real (collapsable={false}) so
          captureRef has real pixels to grab, but positioned far outside the
          viewport rather than hidden, since some capture paths return a blank
          image for opacity-0 views. */}
      <View style={styles.offscreen} collapsable={false} pointerEvents="none">
        {activeEntry && <MealShareCard ref={mealCardRef} entry={activeEntry} />}
        {activeDay && <DayShareCard ref={dayCardRef} summary={activeDay} />}
      </View>

      {capturing && (
        <View style={styles.capturingOverlay}>
          <ActivityIndicator color={C.signal} />
          <Text style={styles.capturingText}>Preparing image…</Text>
        </View>
      )}

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalRoot}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <ScreenHeader title="Pick a meal" left={<IconButton icon="close" onPress={() => setPickerOpen(false)} />} />
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {pickEntries.length === 0 ? (
                <Text style={styles.emptyText}>No meals with photos yet — snap something first.</Text>
              ) : (
                pickEntries.map((e, i) => <EntryCard key={e.id} entry={e} index={i} onPress={() => pickMeal(e)} />)
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!preview} animationType="slide" transparent onRequestClose={closePreview}>
        <View style={styles.modalRoot}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <ScreenHeader
              title={preview?.kind === 'day' ? 'Your day' : 'Your meal'}
              left={<IconButton icon="close" onPress={closePreview} />}
            />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center', paddingBottom: 12 }}>
              {preview && <Image source={{ uri: preview.uri }} style={styles.previewImage} resizeMode="contain" />}
              <View style={styles.previewActions}>
                <BigButton label="Share" icon="share" onPress={doShare} style={{ flex: 1 }} />
                <BigButton label="Post to my feed" icon="plus" kind="ghost" onPress={doPost} style={{ flex: 1 }} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  confirmBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.signal, borderRadius: radius.button,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14,
  },
  confirmText: { fontFamily: F.mono, fontSize: 12, color: C.onSignal, letterSpacing: 0.3 },

  composer: { marginBottom: 22 },
  composerTitle: { fontFamily: F.heading, fontSize: 18, color: C.ink, marginBottom: 6, letterSpacing: -0.3 },
  composerSub: { fontSize: 13.5, color: C.muted, lineHeight: 19, marginBottom: 16 },
  composerActions: { flexDirection: 'row', gap: 10 },

  feedHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  feedHeadTitle: {
    fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint,
  },
  rule: { flex: 1, height: 1, backgroundColor: C.border },

  empty: { alignItems: 'center', paddingVertical: 34 },
  emptyIcon: {
    width: 58, height: 58, borderRadius: radius.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontFamily: F.heading, fontSize: 17, color: C.ink, marginBottom: 6, letterSpacing: -0.3 },
  emptyText: { color: C.muted, fontSize: 13.5, textAlign: 'center', lineHeight: 19 },

  postCard: { padding: 12, marginBottom: 14 },
  postImage: { width: '100%', aspectRatio: 0.8, borderRadius: radius.tile, backgroundColor: C.raised, marginBottom: 10 },
  postFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postCaption: { fontSize: 14, color: C.ink, fontWeight: '600', lineHeight: 19 },
  postTime: {
    fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', color: C.faint, marginTop: 5,
  },

  offscreen: { position: 'absolute', left: -9999, top: 0, opacity: 1 },

  capturingOverlay: {
    ...StyleSheet.absoluteFill, backgroundColor: C.overlay,
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  capturingText: { fontFamily: F.mono, fontSize: 12, color: C.ink, letterSpacing: 0.5 },

  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: C.overlay },
  modalSheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '88%', paddingTop: 8, borderWidth: 1, borderColor: C.border, borderBottomWidth: 0,
  },
  previewImage: { width: 300, aspectRatio: 0.8, borderRadius: radius.card, backgroundColor: C.raised, marginVertical: 18 },
  previewActions: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 8 },
});

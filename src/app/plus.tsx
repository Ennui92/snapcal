// The paywall. Lays out the free vs Plus split from docs/GTM.md. Billing is
// not wired yet (RevenueCat comes with the store launch), so the CTA flips a
// local entitlement for now so the premium flows can be exercised end to end.
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, label, radius } from '@/constants/theme';
import { Grain, IconButton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { setEntitlement, trialDaysLeft } from '@/lib/premium';
import { useStore } from '@/lib/store';

const PLUS_PERKS = [
  'Unlimited AI photo scans',
  'Snappy, your AI nutrition coach',
  'Next-meal recipe suggestions',
  'Barcode scanning',
  'Voice logging',
  'Full history + weight trend',
  'Fasting insights',
  'Strava, Health Connect & Oura sync',
  'Social feed',
  'Light & dark themes',
];

const FREE_PERKS = [
  '3 AI photo scans a day',
  'Unlimited logging of foods you have already scanned',
  'Manual entries',
  'Daily budget, streak, corrections',
  'Last 7 days of history',
];

export default function PlusScreen() {
  const insets = useSafeAreaInsets();
  const { refresh } = useStore();
  const daysLeft = trialDaysLeft();

  const goPlus = (planLabel: string) => {
    // Placeholder for the real purchase flow (RevenueCat).
    setEntitlement(true);
    refresh();
    Alert.alert('You are on Plus', `${planLabel} unlocked. (Billing is a placeholder until the store launch.)`, [
      { text: 'Nice', onPress: () => router.back() },
    ]);
  };

  return (
    <View style={styles.root}>
      <Grain />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 30, paddingHorizontal: 20 }}>
        <View style={styles.head}>
          <IconButton icon="close" onPress={() => router.back()} />
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.hero}>
          <View style={styles.badge}><Icon name="sparkle" size={22} color={C.onSignal} weight={1.8} /></View>
          <Text style={styles.title}>SnapCal <Text style={{ color: C.signal }}>Plus</Text></Text>
          <Text style={styles.sub}>
            {daysLeft > 0
              ? `You are in your free trial: ${daysLeft} day${daysLeft === 1 ? '' : 's'} of everything left.`
              : 'Unlock everything. Your food diary always stays on your phone.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Plus</Text>
          {PLUS_PERKS.map(p => (
            <View key={p} style={styles.perk}>
              <Icon name="check" size={15} color={C.signal} weight={2.4} />
              <Text style={styles.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.muted }]}>Free, forever</Text>
          {FREE_PERKS.map(p => (
            <View key={p} style={styles.perk}>
              <Icon name="check" size={15} color={C.faint} weight={2} />
              <Text style={[styles.perkText, { color: C.muted }]}>{p}</Text>
            </View>
          ))}
        </View>

        <Pressable style={styles.planPrimary} onPress={() => goPlus('Annual')}>
          <View>
            <Text style={styles.planPrimaryName}>Annual</Text>
            <Text style={styles.planPrimarySub}>Best value, about 2.08 a month</Text>
          </View>
          <Text style={styles.planPrice}>24.99</Text>
        </Pressable>

        <View style={styles.row}>
          <Pressable style={styles.planGhost} onPress={() => goPlus('Monthly')}>
            <Text style={styles.planGhostName}>Monthly</Text>
            <Text style={styles.planGhostPrice}>4.99</Text>
          </Pressable>
          <Pressable style={styles.planGhost} onPress={() => goPlus('Lifetime')}>
            <Text style={styles.planGhostName}>Lifetime</Text>
            <Text style={styles.planGhostPrice}>49.99</Text>
          </Pressable>
        </View>

        <Text style={styles.fine}>Prices in EUR. Cancel anytime. Nothing you log ever leaves your device.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  hero: { alignItems: 'center', marginBottom: 24 },
  badge: {
    width: 54, height: 54, borderRadius: 12, backgroundColor: C.signal,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  title: { fontFamily: F.display, fontSize: 30, color: C.ink, letterSpacing: -0.8 },
  sub: { fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 10 },
  card: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.signal, borderRadius: radius.card,
    padding: 18, marginBottom: 12,
  },
  cardTitle: { ...label, fontSize: 10, color: C.signal, marginBottom: 12 },
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 9 },
  perkText: { flex: 1, fontSize: 14.5, color: C.ink, lineHeight: 19 },
  planPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.signal, borderRadius: radius.card, padding: 18, marginTop: 10,
  },
  planPrimaryName: { fontFamily: F.heading, fontSize: 18, color: C.onSignal },
  planPrimarySub: { fontSize: 12, color: 'rgba(10,10,11,0.66)', marginTop: 2 },
  planPrice: { fontFamily: F.mono, fontSize: 24, color: C.onSignal, letterSpacing: -1 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  planGhost: {
    flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: radius.card,
    padding: 16, alignItems: 'center', gap: 4,
  },
  planGhostName: { ...label, fontSize: 9.5, color: C.muted },
  planGhostPrice: { fontFamily: F.mono, fontSize: 18, color: C.ink },
  fine: { fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 16, lineHeight: 16 },
});

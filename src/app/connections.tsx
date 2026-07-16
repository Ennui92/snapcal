// Fitness connections: Strava (OAuth), Google Health Connect (Android),
// Apple Health (placeholder until the iOS build exists). Tracked workout
// burn raises the day's calorie budget — move more, eat more.
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '@/constants/theme';
import { BigButton, Card } from '@/components/ui';
import {
  anyProviderConnected, burnedForDay, lastSyncAt, setUseTrackedActivity, syncActivity, useTrackedActivity,
} from '@/lib/activity';
import { dayKeyFor } from '@/lib/db';
import { localeTag, t } from '@/lib/i18n';
import { fmtKcal } from '@/lib/nutrition';
import {
  connectHealthConnect, disconnectHealthConnect, healthConnectConnected, healthConnectSupported,
} from '@/lib/health-connect';
import {
  connectStrava, disconnectStrava, stravaAthlete, stravaConfigured, stravaConnected,
} from '@/lib/strava';
import { useStore } from '@/lib/store';

export default function ConnectionsScreen() {
  const insets = useSafeAreaInsets();
  const { refresh, version } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // version is read so store refreshes re-render this screen.
  void version;

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 2500);
  };

  const runSync = async () => {
    setBusy('sync');
    try {
      await syncActivity(true);
      flash(t('conn.synced'));
    } catch (e) {
      flash(t('conn.syncFailed', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const onConnectStrava = async () => {
    setBusy('strava');
    try {
      if (await connectStrava()) {
        await syncActivity(true).catch(() => {});
      }
    } catch (e) {
      flash(t('conn.syncFailed', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const onConnectHc = async () => {
    setBusy('hc');
    try {
      if (await connectHealthConnect()) {
        await syncActivity(true).catch(() => {});
      } else {
        flash(t('conn.hcUnavailable'));
      }
    } catch {
      flash(t('conn.hcUnavailable'));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const confirmDisconnect = (name: string, run: () => void | Promise<void>) => {
    Alert.alert(t('conn.disconnectTitle', { name }), t('conn.disconnectBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('conn.disconnect'), style: 'destructive', onPress: async () => { await run(); refresh(); } },
    ]);
  };

  const burn = burnedForDay(dayKeyFor(new Date()));
  const last = lastSyncAt();

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}><Text style={{ fontSize: 16 }}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>{t('conn.title')}</Text>
        <View style={{ width: 42 }} />
      </View>

      <Text style={styles.lead}>{t('conn.lead')}</Text>

      {burn != null && burn > 0 && (
        <Card style={{ marginBottom: 14, backgroundColor: C.greenSoft, borderColor: C.green }}>
          <Text style={{ color: C.green, fontWeight: '700' }}>{t('conn.todayBurn', { kcal: fmtKcal(burn) })}</Text>
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t('conn.useTracked')}</Text>
          <Switch
            value={useTrackedActivity()}
            onValueChange={v => { setUseTrackedActivity(v); refresh(); }}
            trackColor={{ true: C.amber, false: C.border }}
            thumbColor="#fff"
          />
        </View>
        <Text style={styles.hintText}>{t('conn.useTrackedNote')}</Text>
      </Card>

      {/* Strava */}
      <ProviderCard
        emoji="🏃"
        name={t('conn.strava')}
        desc={t('conn.stravaDesc')}
        connected={stravaConnected()}
        connectedNote={stravaAthlete() ? t('conn.connectedAs', { name: stravaAthlete()! }) : t('conn.connected')}
        actionDisabled={!stravaConfigured || busy !== null}
        busy={busy === 'strava'}
        unavailableNote={stravaConfigured ? null : t('conn.stravaNotConfigured')}
        onConnect={onConnectStrava}
        onDisconnect={() => confirmDisconnect(t('conn.strava'), disconnectStrava)}
      />

      {/* Google Health Connect */}
      <ProviderCard
        emoji="❤️"
        name={t('conn.hc')}
        desc={t('conn.hcDesc')}
        connected={healthConnectConnected()}
        connectedNote={t('conn.connected')}
        actionDisabled={!healthConnectSupported || busy !== null}
        busy={busy === 'hc'}
        unavailableNote={healthConnectSupported ? null : t('conn.hcUnavailable')}
        onConnect={onConnectHc}
        onDisconnect={() => confirmDisconnect(t('conn.hc'), disconnectHealthConnect)}
      />

      {/* Apple Health — with the iOS build */}
      <ProviderCard
        emoji="🍎"
        name={t('conn.apple')}
        desc={t('conn.appleDesc')}
        connected={false}
        connectedNote=""
        actionDisabled
        busy={false}
        unavailableNote={null}
        comingSoon
        onConnect={() => {}}
        onDisconnect={() => {}}
      />

      {anyProviderConnected() && (
        <>
          <BigButton
            label={busy === 'sync' ? t('conn.syncing') : t('conn.syncNow')}
            onPress={runSync}
            disabled={busy !== null}
            style={{ marginTop: 6 }}
          />
          <Text style={styles.syncMeta}>
            {t('conn.lastSync', { when: last ? new Date(last).toLocaleString(localeTag(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('conn.never') })}
          </Text>
        </>
      )}

      <Text style={styles.hintText}>{t('conn.doubleCountNote')}</Text>

      {note && (
        <Card style={{ marginTop: 10 }}>
          <Text style={{ color: C.ink, fontSize: 14 }}>{note}</Text>
        </Card>
      )}
    </ScrollView>
  );
}

function ProviderCard({
  emoji, name, desc, connected, connectedNote, actionDisabled, busy, unavailableNote, comingSoon, onConnect, onDisconnect,
}: {
  emoji: string; name: string; desc: string; connected: boolean; connectedNote: string;
  actionDisabled: boolean; busy: boolean; unavailableNote: string | null; comingSoon?: boolean;
  onConnect: () => void; onDisconnect: () => void;
}) {
  return (
    <Card style={{ marginBottom: 12, opacity: comingSoon ? 0.65 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 26, marginRight: 12 }}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.providerName}>{name}</Text>
          <Text style={styles.providerDesc}>{desc}</Text>
          {connected && <Text style={styles.providerStatus}>✓ {connectedNote}</Text>}
        </View>
        {comingSoon ? (
          <Text style={styles.comingSoon}>{t('conn.comingSoon')}</Text>
        ) : connected ? (
          <Pressable onPress={onDisconnect} disabled={actionDisabled} style={styles.ghostBtn}>
            <Text style={styles.ghostBtnText}>{t('conn.disconnect')}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onConnect} disabled={actionDisabled} style={[styles.connectBtn, actionDisabled && { opacity: 0.4 }]}>
            <Text style={styles.connectBtnText}>{busy ? '…' : t('conn.connect')}</Text>
          </Pressable>
        )}
      </View>
      {unavailableNote && <Text style={[styles.hintText, { marginTop: 10, marginBottom: 0 }]}>{unavailableNote}</Text>}
    </Card>
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
  lead: { fontSize: 14, color: C.muted, lineHeight: 20, marginBottom: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 15, color: C.ink, fontWeight: '600', flex: 1, paddingRight: 10 },
  hintText: { fontSize: 13, color: C.muted, lineHeight: 19, marginTop: 8 },
  providerName: { fontFamily: F.heading, fontSize: 16, color: C.ink },
  providerDesc: { fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 17 },
  providerStatus: { fontSize: 12.5, color: C.green, fontWeight: '700', marginTop: 4 },
  comingSoon: { fontSize: 12, color: C.faint, fontWeight: '700', marginLeft: 8 },
  connectBtn: {
    backgroundColor: C.amber, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, marginLeft: 8,
  },
  connectBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  ghostBtn: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, marginLeft: 8,
  },
  ghostBtnText: { color: C.muted, fontWeight: '600', fontSize: 13 },
  syncMeta: { fontSize: 12, color: C.faint, textAlign: 'center', marginTop: 8 },
});

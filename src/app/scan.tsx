// Point the camera at a barcode instead of a plate. Packaged food already
// tells you exactly what's inside, so this skips the AI entirely: scan, look
// it up, log it. Falls back to a two-field manual entry when a code isn't in
// Open Food Facts yet.
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, label, radius, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { Icon } from '@/components/icons';
import { BigButton, Card, Chip } from '@/components/ui';
import { lookupBarcode, logScannedProduct, type ProductLookup } from '@/lib/barcode';
import { fmtKcal, mealLabel, mealTypeForNow } from '@/lib/nutrition';
import { useStore } from '@/lib/store';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const;
const GRAM_STEP = 10;
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;

/** Wide viewfinder — barcodes are horizontal, unlike the photo screen's frame. */
function Frame() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View pointerEvents="none" style={styles.frameWrap}>
      <View style={styles.frame}>
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
      </View>
      <Text style={styles.frameHint}>Align the barcode inside the frame</Text>
    </View>
  );
}

export default function ScanScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { refresh } = useStore();
  const [permission, requestPermission] = useCameraPermissions();

  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductLookup | null>(null);
  const [logged, setLogged] = useState(false);

  const [grams, setGrams] = useState('100');
  const [mealType, setMealType] = useState<string>(mealTypeForNow());
  const [manualName, setManualName] = useState('');
  const [manualKcal, setManualKcal] = useState('');

  const sheetOpen = scannedCode !== null;

  const reset = () => {
    setScannedCode(null);
    setLoading(false);
    setProduct(null);
    setLogged(false);
    setGrams('100');
    setManualName('');
    setManualKcal('');
  };

  // CameraView's onBarcodeScanned prop is only wired up while the sheet is
  // closed (see render below), so once a code lands the camera simply stops
  // reporting new ones — no extra ref bookkeeping needed to debounce.
  const onScan = (result: BarcodeScanningResult) => {
    if (sheetOpen || loading) return;
    Haptics.selectionAsync();
    setScannedCode(result.data);
    setLoading(true);
    lookupBarcode(result.data)
      .then(res => {
        setProduct(res);
        setLoading(false);
        if (res.found) {
          setGrams(String(res.servingGrams && res.servingGrams > 0 ? Math.round(res.servingGrams) : 100));
        }
      })
      .catch(() => {
        setProduct({ found: false });
        setLoading(false);
      });
  };

  if (!permission) return <View style={styles.root} />;
  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.permissionBox]}>
        <View style={styles.permIcon}>
          <Icon name="camera" size={34} color={C.signal} weight={1.6} />
        </View>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionText}>
          SnapCal needs the camera to scan barcodes on packaged food.
        </Text>
        <BigButton label="Enable camera" icon="camera" onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }} hitSlop={8}>
          <Text style={styles.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const gramsNum = parseFloat(grams.replace(',', '.'));
  const validGrams = isFinite(gramsNum) && gramsNum > 0;

  const manualKcalNum = parseFloat(manualKcal.replace(',', '.'));
  const manualValid = manualName.trim().length > 0 && isFinite(manualKcalNum) && manualKcalNum > 0;

  // When the lookup came back empty, the manually-typed fields (once valid)
  // stand in for the product so the rest of the screen — grams, live total,
  // the Log button — works exactly the same as a found product.
  const effectiveProduct: ProductLookup | null =
    product && !product.found
      ? manualValid
        ? {
            found: true,
            name: manualName.trim(),
            brand: null,
            kcalPer100g: manualKcalNum,
            proteinPer100g: 0,
            carbsPer100g: 0,
            fatPer100g: 0,
            sugarPer100g: 0,
            servingGrams: null,
          }
        : null
      : product;

  const totalKcal =
    effectiveProduct?.found && validGrams ? (effectiveProduct.kcalPer100g * gramsNum) / 100 : 0;
  const canLog = !!effectiveProduct?.found && validGrams;

  const adjustGrams = (delta: number) => {
    const base = isFinite(gramsNum) ? gramsNum : 0;
    const next = Math.max(GRAM_STEP, Math.round(base + delta));
    setGrams(String(next));
    Haptics.selectionAsync();
  };

  const onLog = () => {
    if (!canLog || !effectiveProduct?.found) return;
    logScannedProduct(effectiveProduct, gramsNum, mealType);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
    setLogged(true);
    setTimeout(() => router.back(), 650);
  };

  const gramsAndMealSection = (
    <>
      <Text style={styles.fieldLabel}>Amount</Text>
      <Card style={styles.amountCard}>
        <Pressable onPress={() => adjustGrams(-GRAM_STEP)} style={styles.stepBtn} hitSlop={8}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <View style={styles.gramsInputWrap}>
          <TextInput
            value={grams}
            onChangeText={setGrams}
            keyboardType="decimal-pad"
            style={styles.gramsInput}
            textAlign="center"
          />
          <Text style={styles.gramsUnit}>g</Text>
        </View>
        <Pressable onPress={() => adjustGrams(GRAM_STEP)} style={styles.stepBtn} hitSlop={8}>
          <Icon name="plus" size={16} color={C.ink} weight={2.2} />
        </Pressable>
      </Card>

      <Card style={styles.totalCard}>
        <Text style={styles.fieldLabel}>Total</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={styles.totalReadout}>{fmtKcal(totalKcal)}</Text>
          <Text style={styles.kcalUnit}>kcal</Text>
        </View>
      </Card>

      <Text style={styles.fieldLabel}>Meal</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
        {MEALS.map(m => (
          <Chip key={m} label={mealLabel(m)} selected={mealType === m} onPress={() => setMealType(m)} />
        ))}
      </View>
    </>
  );

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={sheetOpen ? undefined : onScan}
      />
      {!sheetOpen && <Frame />}

      <View style={[styles.topBar, { top: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Icon name="back" size={18} color={C.ink} />
        </Pressable>
        <View style={styles.titleChip}>
          <Text style={styles.titleText}>Scan barcode</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {sheetOpen && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
          pointerEvents="box-none"
        >
          <ScrollView
            style={styles.sheet}
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.grabber} />

            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator color={C.signal} />
                <Text style={styles.centerText}>Looking up product…</Text>
              </View>
            ) : logged ? (
              <View style={styles.centerBox}>
                <View style={styles.loggedIcon}>
                  <Icon name="check" size={26} color={C.onSignal} weight={2.4} />
                </View>
                <Text style={styles.centerText}>Logged</Text>
              </View>
            ) : (
              <>
                {product?.found ? (
                  <>
                    <View style={styles.productHead}>
                      <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                      {product.brand ? <Text style={styles.productBrand}>{product.brand}</Text> : null}
                    </View>
                    <Card style={{ marginBottom: 14 }}>
                      <Text style={styles.fieldLabel}>Per 100g</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <Text style={styles.kcalReadout}>{fmtKcal(product.kcalPer100g)}</Text>
                        <Text style={styles.kcalUnit}>kcal</Text>
                      </View>
                    </Card>
                  </>
                ) : (
                  <>
                    <Text style={styles.notFoundTitle}>Product not found</Text>
                    <Text style={styles.notFoundBody}>
                      This barcode isn&apos;t in Open Food Facts. Enter it manually — SnapCal will
                      remember it for next time.
                    </Text>
                    <Card style={{ marginBottom: 14 }}>
                      <Text style={styles.fieldLabel}>Name</Text>
                      <TextInput
                        placeholder="e.g. Rye crackers"
                        placeholderTextColor={C.faint}
                        value={manualName}
                        onChangeText={setManualName}
                        style={styles.input}
                        autoFocus
                      />
                      <Text style={styles.fieldLabel}>Kcal per 100g</Text>
                      <TextInput
                        placeholder="250"
                        placeholderTextColor={C.faint}
                        keyboardType="decimal-pad"
                        value={manualKcal}
                        onChangeText={setManualKcal}
                        style={styles.input}
                      />
                    </Card>
                  </>
                )}

                {gramsAndMealSection}

                <BigButton label="Log it" icon="check" onPress={onLog} disabled={!canLog} style={{ marginTop: 6 }} />
                <Pressable onPress={reset} style={styles.scanAgainBtn} hitSlop={8}>
                  <Text style={styles.scanAgainText}>Scan another</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const FRAME_W = 260;
const FRAME_H = 150;
const makeStyles = (C: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  frameWrap: { position: 'absolute', top: '30%', alignSelf: 'center', alignItems: 'center' },
  frame: { width: FRAME_W, height: FRAME_H },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: 'rgba(255,255,255,0.55)' },
  tl: { top: 0, left: 0, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  tr: { top: 0, right: 0, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  br: { bottom: 0, right: 0, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
  frameHint: { ...label, color: 'rgba(255,255,255,0.55)', fontSize: 9, marginTop: 16 },

  topBar: {
    position: 'absolute', left: 16, right: 16, zIndex: 5,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: radius.button,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.overlay, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  titleChip: {
    backgroundColor: C.overlay, borderRadius: radius.button,
    paddingVertical: 10, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  titleText: { ...label, color: C.ink, fontSize: 10.5 },

  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%' },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 1, borderColor: C.border, borderBottomWidth: 0,
  },
  grabber: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: 'center', marginBottom: 16,
  },

  centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 12 },
  centerText: { fontSize: 14, color: C.muted },
  loggedIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: C.signal,
    alignItems: 'center', justifyContent: 'center',
  },

  productHead: { marginBottom: 12 },
  productName: { fontFamily: F.heading, fontSize: 21, color: C.ink, letterSpacing: -0.4 },
  productBrand: { fontSize: 13, color: C.muted, marginTop: 3 },

  notFoundTitle: { fontFamily: F.heading, fontSize: 19, color: C.ink, marginBottom: 6 },
  notFoundBody: { fontSize: 13.5, color: C.muted, lineHeight: 19, marginBottom: 14 },

  fieldLabel: { ...label, color: C.faint, marginBottom: 8 },
  kcalReadout: { fontFamily: F.mono, fontSize: 28, color: C.ink, letterSpacing: -0.6 },
  totalReadout: { fontFamily: F.mono, fontSize: 30, color: C.signal, letterSpacing: -0.6 },
  kcalUnit: { fontFamily: F.monoLight, fontSize: 12, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2 },

  amountCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, paddingVertical: 10,
  },
  stepBtn: {
    width: 40, height: 40, borderRadius: radius.button,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.raised, borderWidth: 1, borderColor: C.border,
  },
  stepBtnText: { fontFamily: F.mono, fontSize: 19, color: C.ink, lineHeight: 20 },
  gramsInputWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  gramsInput: { fontFamily: F.mono, fontSize: 24, color: C.ink, minWidth: 64, letterSpacing: -0.5, padding: 0 },
  gramsUnit: { fontFamily: F.monoLight, fontSize: 12, color: C.faint, textTransform: 'uppercase' },

  totalCard: { marginBottom: 16 },

  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12,
    fontSize: 15, color: C.ink, marginBottom: 10, backgroundColor: C.bg,
  },

  scanAgainBtn: { alignItems: 'center', paddingVertical: 14 },
  scanAgainText: { ...label, color: C.muted, fontSize: 10.5 },

  permissionBox: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  permIcon: {
    width: 76, height: 76, borderRadius: radius.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 22, backgroundColor: C.card,
  },
  permissionTitle: { fontFamily: F.heading, fontSize: 25, color: C.ink, marginBottom: 10, letterSpacing: -0.5 },
  permissionText: { fontSize: 15, color: C.muted, textAlign: 'center', marginBottom: 28, lineHeight: 22 },
  backLinkText: { color: C.muted, fontSize: 13 },
});

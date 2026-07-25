// Point the camera at a barcode instead of a plate. Packaged food already
// tells you exactly what's inside, so this skips the AI in the common case:
// scan, look it up (local cache/seed catalogue, then country-aware Open Food
// Facts — see lib/food-db), log it. When nothing knows the barcode, offer to
// snap the nutrition label instead and let Gemini read it, with a two-field
// manual entry as the last resort.
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, label, radius, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { Icon } from '@/components/icons';
import { BigButton, Card, Chip } from '@/components/ui';
import { lookupBarcode, logScannedProduct, type ProductLookup } from '@/lib/barcode';
import { UPLOAD_JPEG_QUALITY, UPLOAD_WIDTH } from '@/lib/config';
import { identifyProductByPhoto, isLiquidProduct, saveProduct, type AiPhotoProduct } from '@/lib/food-db';
import { fmtKcal, mealLabel, mealTypeForNow } from '@/lib/nutrition';
import { useStore } from '@/lib/store';

const SOURCE_LABEL: Record<string, string> = {
  local: 'Saved locally',
  off: 'Open Food Facts',
  ai: 'Read from label',
  user: 'Corrected by you',
};

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const;
const GRAM_STEP = 10;
const ML_STEP = 50;
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;

// Sensible defaults when we don't know the product's actual serving/package
// size: a standard-ish single bottle for drinks, a round hundred for solids.
// NOT 500 — that was the old AI-guessed fallback that caused a 250ml/3kcal
// bottle to be logged as if it were 500g of something else entirely.
const DEFAULT_LIQUID_ML = 330;
const DEFAULT_SOLID_G = 100;

const LIQUID_QUICK_SIZES = [250, 330, 500, 1000];
const SOLID_QUICK_SIZES = [30, 100, 200];

/** Known serving size if we have one, else the liquid/solid default above. */
function defaultPortion(p: {
  name: string; brand: string | null; kcalPer100g: number;
  proteinPer100g: number; fatPer100g: number; servingGrams: number | null;
}): number {
  if (p.servingGrams && p.servingGrams > 0) return Math.round(p.servingGrams);
  return isLiquidProduct(p.name, p.brand, p) ? DEFAULT_LIQUID_ML : DEFAULT_SOLID_G;
}

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
  const cameraRef = useRef<CameraView>(null);

  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductLookup | null>(null);
  const [logged, setLogged] = useState(false);

  const [grams, setGrams] = useState('100');
  const [mealType, setMealType] = useState<string>(mealTypeForNow());
  const [manualName, setManualName] = useState('');
  const [manualKcal, setManualKcal] = useState('');

  // Editable copies of a FOUND product's name/kcal (barcode match or AI label
  // read) — pre-filled from the lookup, but the user can correct either one
  // right here instead of being stuck with a wrong match or a wrong number.
  const [foundName, setFoundName] = useState('');
  const [foundKcal, setFoundKcal] = useState('');
  const kcalInputRef = useRef<TextInput>(null);

  // AI label-photo fallback: only reachable once a barcode lookup comes back
  // empty. 'idle' -> 'capturing' (shutter) -> 'analyzing' (Gemini) -> 'done' | 'error'.
  const [aiState, setAiState] = useState<'idle' | 'capturing' | 'analyzing' | 'done' | 'error'>('idle');
  const [aiResult, setAiResult] = useState<AiPhotoProduct | null>(null);

  const sheetOpen = scannedCode !== null;

  const reset = () => {
    setScannedCode(null);
    setLoading(false);
    setProduct(null);
    setLogged(false);
    setGrams('100');
    setManualName('');
    setManualKcal('');
    setFoundName('');
    setFoundKcal('');
    setAiState('idle');
    setAiResult(null);
  };

  const onSnapLabel = async () => {
    if (!cameraRef.current || aiState === 'capturing' || aiState === 'analyzing') return;
    setAiState('capturing');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) {
        setAiState('error');
        return;
      }
      setAiState('analyzing');
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: UPLOAD_WIDTH } }],
        { compress: UPLOAD_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!manipulated.base64) {
        setAiState('error');
        return;
      }
      const result = await identifyProductByPhoto(manipulated.base64, scannedCode ?? undefined);
      if (!result) {
        setAiState('error');
        return;
      }
      setAiResult(result);
      setAiState('done');
      setFoundName(result.name);
      setFoundKcal(String(result.kcalPer100g));
      setGrams(String(defaultPortion(result)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setAiState('error');
    }
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
          setFoundName(res.name);
          setFoundKcal(String(res.kcalPer100g));
          setGrams(String(defaultPortion(res)));
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

  // A real lookup (barcode match or AI label read) — as opposed to manual
  // entry, which never goes through here. Kept separate from
  // `effectiveProduct` below so onLog can diff the user's edits against it.
  const baseFound: Extract<ProductLookup, { found: true }> | null =
    product?.found ? product : aiResult
      ? {
          found: true,
          name: aiResult.name,
          brand: aiResult.brand,
          kcalPer100g: aiResult.kcalPer100g,
          proteinPer100g: aiResult.proteinPer100g,
          carbsPer100g: aiResult.carbsPer100g,
          fatPer100g: aiResult.fatPer100g,
          sugarPer100g: aiResult.sugarPer100g,
          servingGrams: aiResult.servingGrams,
          source: 'ai',
        }
      : null;

  const foundKcalNum = parseFloat(foundKcal.replace(',', '.'));
  const foundKcalValid = isFinite(foundKcalNum) && foundKcalNum > 0;

  // When the lookup came back empty, the manually-typed fields (once valid)
  // stand in for the product so the rest of the screen — grams, live total,
  // the Log button — works exactly the same as a found product. When it came
  // back non-empty, the user's edits to name/kcal (pre-filled from the
  // lookup, editable right in this sheet) win over the raw lookup values.
  const effectiveProduct: ProductLookup | null = baseFound
    ? {
        ...baseFound,
        name: foundName.trim() || baseFound.name,
        kcalPer100g: foundKcalValid ? foundKcalNum : baseFound.kcalPer100g,
      }
    : manualValid
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
      : null;

  // Drink vs. food only changes the unit LABEL (g -> ml) shown below; the
  // maths is unchanged (1 ml ~= 1 g here). Macros are only passed to the
  // heuristic when they're real (a lookup), not manual entry's zeroed
  // placeholders, which would otherwise misread e.g. a low-kcal solid as a drink.
  const liquid = effectiveProduct
    ? isLiquidProduct(effectiveProduct.name, effectiveProduct.brand, baseFound ? effectiveProduct : undefined)
    : isLiquidProduct(manualName, null);
  const unit = liquid ? 'ml' : 'g';
  const per100Label = liquid ? 'Per 100 ml' : 'Per 100g';

  const totalKcal =
    effectiveProduct?.found && validGrams ? (effectiveProduct.kcalPer100g * gramsNum) / 100 : 0;
  const canLog = !!effectiveProduct?.found && validGrams;

  const quickSizes: { label: string; value: number }[] = (liquid ? LIQUID_QUICK_SIZES : SOLID_QUICK_SIZES)
    .map(v => ({ label: `${v} ${unit}`, value: v }));
  if (!liquid && baseFound?.servingGrams && baseFound.servingGrams > 0) {
    const pkg = Math.round(baseFound.servingGrams);
    if (!SOLID_QUICK_SIZES.includes(pkg)) quickSizes.push({ label: `Package (${pkg} g)`, value: pkg });
  }

  // Liquids step in bigger increments (50ml) than solids (10g) — a bottle is
  // measured in swigs, not single grams.
  const adjustGrams = (sign: 1 | -1) => {
    const step = liquid ? ML_STEP : GRAM_STEP;
    const base = isFinite(gramsNum) ? gramsNum : 0;
    const next = Math.max(step, Math.round(base + sign * step));
    setGrams(String(next));
    Haptics.selectionAsync();
  };

  const onLog = () => {
    if (!canLog || !effectiveProduct?.found) return;

    if (baseFound && scannedCode) {
      const nameChanged = effectiveProduct.name.trim() !== baseFound.name.trim();
      const kcalChanged = effectiveProduct.kcalPer100g !== baseFound.kcalPer100g;
      // AI-read labels aren't in any cache yet — save them keyed by the
      // barcode that triggered the fallback so the next scan is an instant
      // hit. A found product only gets re-saved when the user actually
      // corrected something, and then it's saved as 'user' so it visibly
      // wins over a plain cached OFF row on the next scan (see food-db's
      // resolveBarcode: one row per barcode, last write wins).
      if (baseFound.source === 'ai' || nameChanged || kcalChanged) {
        saveProduct({
          barcode: scannedCode,
          name: effectiveProduct.name,
          brand: effectiveProduct.brand,
          kcalPer100g: effectiveProduct.kcalPer100g,
          proteinPer100g: effectiveProduct.proteinPer100g,
          carbsPer100g: effectiveProduct.carbsPer100g,
          fatPer100g: effectiveProduct.fatPer100g,
          sugarPer100g: effectiveProduct.sugarPer100g,
          servingGrams: effectiveProduct.servingGrams,
          source: (nameChanged || kcalChanged) ? 'user' : 'ai',
        });
      }
    }

    logScannedProduct(effectiveProduct, gramsNum, mealType);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
    setLogged(true);
    setTimeout(() => router.back(), 650);
  };

  const gramsAndMealSection = (
    <>
      <Text style={styles.fieldLabel}>Amount</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
        {quickSizes.map(o => (
          <Chip key={o.label} label={o.label} selected={gramsNum === o.value} onPress={() => setGrams(String(o.value))} />
        ))}
      </View>
      <Card style={styles.amountCard}>
        <Pressable onPress={() => adjustGrams(-1)} style={styles.stepBtn} hitSlop={8}>
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
          <Text style={styles.gramsUnit}>{unit}</Text>
        </View>
        <Pressable onPress={() => adjustGrams(1)} style={styles.stepBtn} hitSlop={8}>
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
        ref={cameraRef}
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
                {baseFound ? (
                  <>
                    <View style={styles.productHead}>
                      {baseFound.source ? (
                        <Text style={styles.sourceBadge}>{SOURCE_LABEL[baseFound.source] ?? baseFound.source}</Text>
                      ) : null}
                      <TextInput
                        value={foundName}
                        onChangeText={setFoundName}
                        style={styles.productNameInput}
                        placeholder="Product name"
                        placeholderTextColor={C.faint}
                      />
                      {baseFound.brand ? <Text style={styles.productBrand}>{baseFound.brand}</Text> : null}
                    </View>

                    {baseFound.source === 'ai' ? (
                      <View style={styles.cautionRow}>
                        <Icon name="warn" size={14} color={C.danger} weight={1.8} />
                        <Text style={styles.cautionText}>
                          Read from a photo — this is a best-effort guess. Check the number below
                          against the label.
                        </Text>
                      </View>
                    ) : null}

                    <Card style={{ marginBottom: 14 }}>
                      <View style={styles.per100Head}>
                        <Text style={styles.fieldLabel}>{per100Label}</Text>
                        <Pressable onPress={() => kcalInputRef.current?.focus()} hitSlop={8}>
                          <Text style={styles.fixItText}>Wrong? Fix it</Text>
                        </Pressable>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <TextInput
                          ref={kcalInputRef}
                          value={foundKcal}
                          onChangeText={setFoundKcal}
                          keyboardType="decimal-pad"
                          style={styles.kcalReadoutInput}
                        />
                        <Text style={styles.kcalUnit}>kcal</Text>
                      </View>
                    </Card>
                  </>
                ) : (
                  <>
                    <Text style={styles.notFoundTitle}>Product not found</Text>
                    <Text style={styles.notFoundBody}>
                      This barcode isn&apos;t in Open Food Facts. Snap a photo of the nutrition
                      label instead and SnapCal will read it — or enter it manually below.
                    </Text>

                    {aiState === 'capturing' || aiState === 'analyzing' ? (
                      <View style={styles.aiRow}>
                        <ActivityIndicator color={C.signal} />
                        <Text style={styles.aiRowText}>
                          {aiState === 'capturing' ? 'Taking photo…' : 'Reading label…'}
                        </Text>
                      </View>
                    ) : (
                      <BigButton
                        label="Snap the label"
                        icon="camera"
                        onPress={() => { void onSnapLabel(); }}
                        style={{ marginBottom: 10 }}
                      />
                    )}
                    {aiState === 'error' ? (
                      <Text style={styles.aiErrorText}>
                        Couldn&apos;t read that label. Try again, or enter it manually below.
                      </Text>
                    ) : null}

                    <View style={styles.orDivider}>
                      <View style={styles.orLine} />
                      <Text style={styles.orText}>or enter manually</Text>
                      <View style={styles.orLine} />
                    </View>

                    <Card style={{ marginBottom: 14 }}>
                      <Text style={styles.fieldLabel}>Name</Text>
                      <TextInput
                        placeholder="e.g. Rye crackers"
                        placeholderTextColor={C.faint}
                        value={manualName}
                        onChangeText={setManualName}
                        style={styles.input}
                      />
                      <Text style={styles.fieldLabel}>{`Kcal per 100${unit === 'ml' ? ' ml' : 'g'}`}</Text>
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
  productNameInput: {
    fontFamily: F.heading, fontSize: 21, color: C.ink, letterSpacing: -0.4, padding: 0,
  },
  productBrand: { fontSize: 13, color: C.muted, marginTop: 3 },
  sourceBadge: { ...label, color: C.signal, fontSize: 9.5, marginBottom: 6 },

  cautionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12, borderRadius: radius.button,
    backgroundColor: C.raised, borderWidth: 1, borderColor: C.border,
  },
  cautionText: { flex: 1, fontSize: 12.5, color: C.muted, lineHeight: 17 },

  notFoundTitle: { fontFamily: F.heading, fontSize: 19, color: C.ink, marginBottom: 6 },
  notFoundBody: { fontSize: 13.5, color: C.muted, lineHeight: 19, marginBottom: 14 },

  aiRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, marginBottom: 10, borderRadius: radius.button,
    backgroundColor: C.raised, borderWidth: 1, borderColor: C.border,
  },
  aiRowText: { fontSize: 13.5, color: C.muted },
  aiErrorText: { fontSize: 12.5, color: C.danger, marginBottom: 10, lineHeight: 17 },
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: C.border },
  orText: { ...label, color: C.faint, fontSize: 9.5 },

  fieldLabel: { ...label, color: C.faint, marginBottom: 8 },
  per100Head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fixItText: { ...label, color: C.signal, fontSize: 9.5, marginBottom: 8 },
  kcalReadout: { fontFamily: F.mono, fontSize: 28, color: C.ink, letterSpacing: -0.6 },
  kcalReadoutInput: { fontFamily: F.mono, fontSize: 28, color: C.ink, letterSpacing: -0.6, padding: 0, minWidth: 70 },
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

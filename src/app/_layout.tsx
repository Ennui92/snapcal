import {
  Archivo_600SemiBold_Italic, Archivo_700Bold, Archivo_800ExtraBold, useFonts,
} from '@expo-google-fonts/archivo';
import { IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { retryPending } from '@/lib/analyzer';
import { initFoodDb, refreshCatalog, syncCountryCatalogue } from '@/lib/food-db';
import { initDb } from '@/lib/db';
import { initLanguage } from '@/lib/i18n';
import { StoreProvider } from '@/lib/store';
import { ThemeProvider, useColors, useThemeMode } from '@/lib/theme-context';

SplashScreen.preventAutoHideAsync();

// Show nudges even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

initDb();
initLanguage();
// The product catalogue is seeded for the user's country and topped up on
// every launch, so barcode scanning is instant and works offline.
initFoodDb();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Archivo_700Bold, Archivo_800ExtraBold, Archivo_600SemiBold_Italic,
    IBMPlexMono_500Medium, IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
      // Anything that never finished analyzing gets another shot on launch.
      retryPending();
      // Re-seed the local product catalogue if the bundled data moved on, then
      // pull a few more pages of this country's products in the background so
      // the on-device database keeps growing wherever the user lives.
      refreshCatalog();
      void syncCountryCatalogue().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <StoreProvider>
          <ThemedStack />
        </StoreProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// Inside the provider so the Stack background and status bar follow the theme.
function ThemedStack() {
  const C = useColors();
  const { isDark } = useThemeMode();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="today" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}

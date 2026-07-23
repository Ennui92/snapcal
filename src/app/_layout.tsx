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
import { C } from '@/constants/theme';
import { retryPending } from '@/lib/analyzer';
import { initDb } from '@/lib/db';
import { initLanguage } from '@/lib/i18n';
import { StoreProvider } from '@/lib/store';

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
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StoreProvider>
        <StatusBar style="light" />
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
      </StoreProvider>
    </GestureHandlerRootView>
  );
}

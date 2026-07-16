import { Fraunces_500Medium_Italic, Fraunces_600SemiBold, useFonts } from '@expo-google-fonts/fraunces';
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
  const [fontsLoaded] = useFonts({ Fraunces_600SemiBold, Fraunces_500Medium_Italic });

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
        <StatusBar style="dark" />
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

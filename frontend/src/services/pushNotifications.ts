import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushRegistrationResult {
  token: string;
  timezone: string;
}

function getExpoProjectId(): string | undefined {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId
  );
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.log('[push] Skipping registration on simulator/emulator');
    return null;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    console.warn('[push] Missing EAS project ID — run eas init and set extra.eas.projectId');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MemoryLane',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('[push] Notification permission not granted');
    return null;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  return {
    token: tokenResponse.data,
    timezone,
  };
}

export function addNotificationResponseListener(
  handler: (screen: string | undefined) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const screen = response.notification.request.content.data?.screen;
    handler(typeof screen === 'string' ? screen : undefined);
  });
}

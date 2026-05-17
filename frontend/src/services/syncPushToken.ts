import { API_BASE_URL } from '../config/api';
import { getToken } from '../utils/auth';
import { registerForPushNotificationsAsync } from './pushNotifications';

export async function syncCaregiverPushToken(): Promise<void> {
  const jwt = await getToken();
  if (!jwt) return;

  const registration = await registerForPushNotificationsAsync();
  if (!registration) return;

  try {
    await fetch(`${API_BASE_URL}/auth/push-token`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token: registration.token }),
    });
  } catch (err) {
    console.warn('[push] Failed to sync caregiver push token', err);
  }
}

export async function syncPatientDeviceToken(patientId: string): Promise<void> {
  const registration = await registerForPushNotificationsAsync();
  if (!registration) return;

  try {
    await fetch(`${API_BASE_URL}/patients/${patientId}/device-token`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: registration.token,
        timezone: registration.timezone,
      }),
    });
  } catch (err) {
    console.warn('[push] Failed to sync patient device token', err);
  }
}

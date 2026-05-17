/** @type {import('expo/config').ExpoConfig} */
const base = require('./app.json');

const GOOGLE_SUFFIX = '.apps.googleusercontent.com';

function reversedGoogleIosUrlScheme(iosClientId) {
  if (!iosClientId || !iosClientId.endsWith(GOOGLE_SUFFIX)) {
    return null;
  }
  return `com.googleusercontent.apps.${iosClientId.slice(0, -GOOGLE_SUFFIX.length)}`;
}

function buildPlugins(iosUrlScheme) {
  const plugins = [...base.expo.plugins];
  const googlePluginIndex = plugins.findIndex(
    (p) => Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin',
  );
  if (googlePluginIndex >= 0) {
    plugins[googlePluginIndex] = [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme },
    ];
  }
  if (!plugins.includes('expo-notifications')) {
    plugins.push([
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#1E4D30',
      },
    ]);
  }
  return plugins;
}

module.exports = () => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const iosUrlScheme =
    reversedGoogleIosUrlScheme(iosClientId) ??
    'com.googleusercontent.apps.REPLACE_WITH_REVERSED_IOS_CLIENT_ID';

  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
    process.env.EAS_PROJECT_ID?.trim() ||
    base.expo.extra?.eas?.projectId;

  const androidPermissions = [
    ...(base.expo.android?.permissions ?? []),
    'android.permission.POST_NOTIFICATIONS',
  ].filter((p, i, arr) => arr.indexOf(p) === i);

  return {
    ...base.expo,
    plugins: buildPlugins(iosUrlScheme),
    android: {
      ...base.expo.android,
      permissions: androidPermissions,
    },
    ios: {
      ...base.expo.ios,
      infoPlist: {
        ...base.expo.ios?.infoPlist,
        NSUserNotificationsUsageDescription:
          'MemoryLane sends reminders when it is time for a memory quiz and alerts caregivers about care team updates.',
      },
    },
    extra: {
      ...base.expo.extra,
      eas: {
        ...(base.expo.extra?.eas ?? {}),
        ...(projectId ? { projectId } : {}),
      },
    },
  };
};

export default {
  expo: {
    name: "memorylane",
    slug: "memorylane",
    version: "1.0.0",
    // ... your other existing config ...
    extra: {
      eas: {
        projectId: "72125389-abd1-48a8-92fa-99af7986623d"
      }
    }
  }
};

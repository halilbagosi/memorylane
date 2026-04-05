import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(caregiver-tabs)/patients');
  }, []);

  return null;
}

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, lightColors, darkColors } from './colors';

export type AppearanceMode = 'system' | 'light' | 'dark';
export type ThemeColors = typeof colors;

interface ThemeContextType {
  appearance: AppearanceMode;
  setAppearance: (mode: AppearanceMode) => Promise<void>;
  isDark: boolean;
  colors: ThemeColors;
}

const THEME_STORAGE_KEY = '@app_appearance';

const ThemeContext = createContext<ThemeContextType>({
  appearance: 'system',
  setAppearance: async () => {},
  isDark: false,
  colors: colors,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const [appearance, setAppearanceState] = useState<AppearanceMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
          setAppearanceState(storedTheme);
        }
      } catch (error) {
        console.error('Failed to load theme preference', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTheme();
  }, []);

  const setAppearance = async (mode: AppearanceMode) => {
    try {
      setAppearanceState(mode);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.error('Failed to save theme preference', error);
    }
  };

  const isDark = useMemo(() => {
    if (appearance === 'system') {
      return systemColorScheme === 'dark';
    }
    return appearance === 'dark';
  }, [appearance, systemColorScheme]);

  const themeColors = isDark ? darkColors : lightColors;

  if (!isLoaded) {
    return null; // or a minimal splash screen component if needed
  }

  return (
    <ThemeContext.Provider value={{ appearance, setAppearance, isDark, colors: themeColors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

import { useMemo } from 'react';

import { useSettingsStore, type ThemeScheme } from '../store/settings';
import { themeFor, type Theme } from './theme';

/** Access the active theme object. */
export function useTheme(): Theme {
  const scheme: ThemeScheme = useSettingsStore((state) => state.theme);

  return useMemo(() => themeFor(scheme), [scheme]);
}

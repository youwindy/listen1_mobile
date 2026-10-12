import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/useTheme';

export interface ScreenProps {
  children: ReactNode;
  /** Skip the top safe-area inset (screens with a navigation header). */
  edges?: ('top' | 'bottom')[];
  style?: ViewStyle;
}

/** Themed full-screen container. */
export function Screen({ children, edges = ['bottom'], style }: ScreenProps) {
  const theme = useTheme();

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safe, { backgroundColor: theme.backgroundColor }]}
    >
      <View style={[styles.content, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1 },
});

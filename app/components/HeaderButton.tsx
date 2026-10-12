import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

export interface HeaderButtonProps {
  label: string;
  onPress(): void;
  /** Accent colouring for the primary action. */
  accent?: boolean;
  style?: ViewStyle;
}

/** Compact text button used in navigation headers. */
export function HeaderButton({ label, onPress, accent = false, style }: HeaderButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.5 }, style]}
    >
      <AppText variant="body" style={{ color: accent ? theme.accentColor : theme.primaryColor }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Placeholder shown when a list has no content or a request failed. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <AppText variant="subtitle" tone="secondary" center>
        {title}
      </AppText>
      {description ? (
        <AppText variant="caption" tone="tertiary" center style={styles.description}>
          {description}
        </AppText>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 4, paddingVertical: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6 },
  description: { marginTop: 2 },
  action: { marginTop: 12 },
});

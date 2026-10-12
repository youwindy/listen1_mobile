/**
 * Typography primitives.
 *
 * `AppText` pins `allowFontScaling={false}`, which the legacy app did globally by
 * mutating `Text.defaultProps` — a pattern React 19 no longer supports.
 */
import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '../theme/useTheme';

export interface AppTextProps extends TextProps {
  /** Semantic role, mapped to a size/weight pair. */
  variant?: 'title' | 'subtitle' | 'body' | 'caption' | 'label';
  /** Use the secondary/tertiary colour instead of the primary one. */
  tone?: 'primary' | 'secondary' | 'tertiary' | 'accent' | 'disabled';
  center?: boolean;
}

const SIZES: Record<NonNullable<AppTextProps['variant']>, TextStyle> = {
  title: { fontSize: 18, fontWeight: '600' },
  subtitle: { fontSize: 16, fontWeight: '500' },
  body: { fontSize: 14 },
  caption: { fontSize: 12 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
};

export function AppText({
  variant = 'body',
  tone = 'primary',
  center = false,
  style,
  ...rest
}: AppTextProps) {
  const theme = useTheme();

  const color =
    tone === 'secondary'
      ? theme.secondaryColor
      : tone === 'tertiary'
        ? theme.thirdColor
        : tone === 'accent'
          ? theme.accentColor
          : tone === 'disabled'
            ? theme.disableColor
            : theme.primaryColor;

  return (
    <Text
      allowFontScaling={false}
      style={[SIZES[variant], { color }, center && { textAlign: 'center' }, style]}
      {...rest}
    />
  );
}

/**
 * Settings list.
 *
 * Replaces `legacy/src/views/setting/setting.screen.js`. The legacy screen was a
 * `FlatList` over a dummy `[1, 2, 3, 4]` array because `react-native-elements`
 * could not render mixed row types; a plain `ScrollView` of rows is clearer.
 * The rows keep the legacy wording ("夜间模式", "备份", "恢复", "关于 Listen 1")
 * and add the playlist entry points the rewrite introduced.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useSettingsStore } from '../store/settings';
import { useTheme } from '../theme/useTheme';

interface SettingsRowProps {
  label: string;
  /** Secondary line under the label, used for destructive-action warnings. */
  hint?: string;
  /** Right-hand control; defaults to a chevron when the row navigates. */
  trailing?: ReactNode;
  onPress?(): void;
}

function SettingsRow({ label, hint, trailing, onPress }: SettingsRowProps) {
  const theme = useTheme();

  const content = (
    <View style={[styles.row, { borderBottomColor: theme.borderColor }]}>
      <View style={styles.labelBlock}>
        <AppText variant="body">{label}</AppText>
        {hint ? (
          <AppText variant="caption" tone="tertiary" style={styles.hint}>
            {hint}
          </AppText>
        ) : null}
      </View>
      {trailing ?? <AppText tone="tertiary">›</AppText>}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {content}
    </Pressable>
  );
}

export function SettingsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const scheme = useSettingsStore((state) => state.theme);
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsRow
          label="夜间模式"
          trailing={
            <Switch
              value={scheme === 'dark'}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.disableColor, true: theme.accentColor }}
              thumbColor={theme.surfaceColor}
            />
          }
        />

        <SettingsRow label="我的歌单" onPress={() => navigation.navigate('MyPlaylists')} />
        <SettingsRow
          label="导入歌单"
          hint="从分享链接或浏览器插件导入"
          onPress={() => navigation.navigate('ImportPlaylist')}
        />
        <SettingsRow
          label="恢复备份"
          hint="将覆盖当前所有的歌单信息"
          onPress={() => navigation.navigate('ImportLocal')}
        />
        <SettingsRow label="备份数据" onPress={() => navigation.navigate('ExportLocal')} />
        <SettingsRow label="关于 Listen 1" onPress={() => navigation.navigate('About')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  labelBlock: { flex: 1 },
  hint: { marginTop: 2 },
  pressed: { opacity: 0.6 },
});

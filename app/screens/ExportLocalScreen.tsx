/**
 * Backup the current data as Listen1 JSON.
 *
 * Replaces `legacy/src/views/setting/export-local.screen.js`. The legacy screen
 * stringified the backup without indentation and rendered it as read-only text;
 * the rewrite pretty-prints it into a selectable `TextInput` so the JSON can be
 * selected or copied with the platform's own affordance too. The copy
 * confirmation replaces the `react-native-root-toast` toast.
 */
import { useCallback, useMemo, useState } from 'react';
import { Clipboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Screen } from '../components/Screen';
import { buildBackup } from '../modules/backup';
import { useMyPlaylistStore } from '../store/myPlaylist';
import { usePlayerStore } from '../store/player';
import { useTheme } from '../theme/useTheme';

export function ExportLocalScreen() {
  const theme = useTheme();

  // The backup is a snapshot taken when the screen opens, as in the legacy
  // `componentDidMount`; the JSON preview must not shift under the user's finger.
  const [backup] = useState(() =>
    buildBackup({
      playerState: usePlayerStore.getState(),
      myPlaylistState: useMyPlaylistStore.getState(),
    })
  );
  const [isCopied, setIsCopied] = useState(false);

  const jsonText = useMemo(() => JSON.stringify(backup, null, 2), [backup]);
  const playlistCount = backup.playerlists.length;
  const queueCount = backup['current-playing'].length;

  const onCopy = useCallback(() => {
    // `Clipboard` is deprecated in React Native 0.87 (it moved to
    // `@react-native-clipboard/clipboard`), but it is still exported and this
    // project does not depend on the extracted package.
    Clipboard.setString(JSON.stringify(backup, null, 2));
    setIsCopied(true);
  }, [backup]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <View style={[styles.summaryRow, { borderBottomColor: theme.borderColor }]}>
            <AppText variant="body">歌单数量</AppText>
            <AppText variant="body" tone="secondary">
              {playlistCount}
            </AppText>
          </View>
          <View style={[styles.summaryRow, { borderBottomColor: theme.borderColor }]}>
            <AppText variant="body">当前播放队列</AppText>
            <AppText variant="body" tone="secondary">
              {queueCount} 首
            </AppText>
          </View>
        </View>

        <TextInput
          value={jsonText}
          // Read-only keeps the text selectable (React Native 0.87 removed the
          // separate `selectable` prop from `TextInputProps`).
          editable={false}
          multiline
          textAlignVertical="top"
          style={[
            styles.preview,
            {
              backgroundColor: theme.surfaceColor,
              color: theme.secondaryColor,
              borderColor: theme.borderColor,
            },
          ]}
        />

        <Pressable
          onPress={onCopy}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.surfaceColor, borderColor: theme.accentColor },
            pressed && styles.pressed,
          ]}
        >
          <AppText variant="body" tone="accent">
            复制到剪贴板
          </AppText>
        </Pressable>

        {isCopied ? (
          <AppText variant="caption" tone="accent" style={styles.status}>
            已复制到剪切板
          </AppText>
        ) : null}

        <AppText variant="caption" tone="tertiary" style={styles.note}>
          备份方法：点击复制后，将内容粘贴到文本文件或笔记中，恢复时在恢复窗口粘贴回来就可以了。
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  summary: { marginBottom: 12 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  preview: {
    minHeight: 200,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
  },
  button: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.6 },
  status: { marginTop: 12 },
  note: { marginTop: 10 },
});

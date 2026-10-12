/**
 * Restore from a Listen1 backup.
 *
 * Replaces `legacy/src/views/setting/import-local.screen.js`. The legacy screen
 * only accepted pasted text (no file picker) and kept the text read-only until
 * the clipboard had been validated; the rewrite keeps the paste flow but uses an
 * editable multiline `TextInput`, so a backup can also be typed or pasted with
 * the keyboard. `react-native-root-toast` is gone, so feedback is an inline
 * themed message line instead of a toast.
 */
import { useCallback, useState } from 'react';
import { Clipboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Screen } from '../components/Screen';
import { parseBackup } from '../modules/backup';
import { useMyPlaylistStore } from '../store/myPlaylist';
import { usePlayerStore } from '../store/player';
import { useTheme } from '../theme/useTheme';

interface Status {
  kind: 'success' | 'error';
  text: string;
}

export function ImportLocalScreen() {
  const theme = useTheme();

  const [backupText, setBackupText] = useState('');
  const [status, setStatus] = useState<Status | null>(null);

  const onPaste = useCallback(async () => {
    try {
      // `Clipboard` is deprecated in React Native 0.87 (it moved to
      // `@react-native-clipboard/clipboard`), but it is still exported and this
      // project does not depend on the extracted package.
      const clipboardText = await Clipboard.getString();

      try {
        JSON.parse(clipboardText);
      } catch {
        setBackupText('');
        setStatus({ kind: 'error', text: '未在剪切板找到可用的备份文本' });

        return;
      }

      setBackupText(clipboardText);
      setStatus({ kind: 'success', text: '已粘贴' });
    } catch {
      setStatus({ kind: 'error', text: '读取剪切板失败' });
    }
  }, []);

  const onRestore = useCallback(() => {
    try {
      const restored = parseBackup(backupText);

      // `replaceAll` only exists on some store versions, so patch the two data
      // fields directly; `setState` merges, so the actions stay intact.
      useMyPlaylistStore.setState({
        playlists: restored.playlists,
        favoriteIds: restored.favoriteIds,
      });
      usePlayerStore.setState({
        tracks: restored.tracks,
        nowplayingTrack: restored.tracks[0] ?? null,
        isPlaying: false,
      });

      setStatus({ kind: 'success', text: '恢复成功,请返回' });
    } catch (cause) {
      // `parseBackup` throws a readable Chinese message for malformed backups.
      setStatus({
        kind: 'error',
        text: cause instanceof Error ? cause.message : '恢复失败',
      });
    }
  }, [backupText]);

  const messageColor = status?.kind === 'error' ? theme.playingColor : theme.accentColor;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          value={backupText}
          onChangeText={setBackupText}
          multiline
          textAlignVertical="top"
          placeholder="在此粘贴备份文本"
          placeholderTextColor={theme.thirdColor}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            {
              backgroundColor: theme.surfaceColor,
              color: theme.primaryColor,
              borderColor: theme.borderColor,
            },
          ]}
        />

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              void onPaste();
            }}
            style={({ pressed }) => [
              styles.button,
              { borderColor: theme.accentColor },
              pressed && styles.pressed,
            ]}
          >
            <AppText variant="body" tone="accent">
              从剪切板粘贴
            </AppText>
          </Pressable>

          <Pressable
            onPress={onRestore}
            disabled={backupText.trim() === ''}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.surfaceColor, borderColor: theme.accentColor },
              backupText.trim() === '' && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <AppText variant="body" tone="accent">
              恢复（警告：将覆盖当前数据）
            </AppText>
          </Pressable>
        </View>

        {status ? (
          <AppText variant="caption" style={[styles.status, { color: messageColor }]}>
            {status.text}
          </AppText>
        ) : null}

        <AppText variant="caption" tone="tertiary" style={styles.note}>
          恢复方法：复制之前备份的文本，点击“从剪切板粘贴”, 再点击“恢复”就可以了。
        </AppText>
        <AppText variant="caption" tone="tertiary" style={styles.note}>
          警告：恢复功能将覆盖当前所有的歌单信息，请谨慎操作。
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  input: {
    minHeight: 200,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  actions: { marginTop: 16, gap: 12 },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
  status: { marginTop: 12 },
  note: { marginTop: 10 },
});

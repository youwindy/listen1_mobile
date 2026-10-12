/**
 * Import a playlist from a pasted Listen1 share URL.
 * Replaces `import-playlist.screen.js`, which resolved and navigated in one
 * header action. Here the URL is parsed first and the resolved playlist is
 * loaded by an explicit action, so the paste can be corrected without leaving
 * the screen.
 */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { parseUrl } from '../api/client';
import type { ParsedUrl } from '../api/types';
import { AppText } from '../components/AppText';
import { HeaderButton } from '../components/HeaderButton';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'ImportPlaylist'>;

export function ImportPlaylistScreen({ navigation }: Props) {
  const theme = useTheme();

  const [url, setUrl] = useState('');
  const [parsed, setParsed] = useState<ParsedUrl | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onChangeText = useCallback((text: string) => {
    setUrl(text);
    // A result from the previous link must not stay loadable.
    setParsed(null);
    setNotice(null);
  }, []);

  const parse = useCallback(() => {
    const result = parseUrl(url.trim());

    if (!result) {
      setParsed(null);
      setNotice('无法识别该链接，请检查是否为支持平台的歌单链接');

      return;
    }

    setParsed(result);
    setNotice(null);
  }, [url]);

  const load = useCallback(() => {
    if (!parsed) return;

    navigation.navigate('Playlist', { playlistId: parsed.id });
  }, [navigation, parsed]);

  return (
    <Screen>
      <View style={styles.form}>
        <TextInput
          value={url}
          onChangeText={onChangeText}
          onSubmitEditing={parse}
          placeholder="请粘贴歌单分享中复制链接的内容"
          placeholderTextColor={theme.thirdColor}
          selectTextOnFocus
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[
            styles.input,
            {
              borderColor: theme.borderColor,
              backgroundColor: theme.surfaceColor,
              color: theme.primaryColor,
            },
          ]}
        />

        <Pressable onPress={parse} hitSlop={8} style={styles.parseAction}>
          <AppText tone="accent">解析</AppText>
        </Pressable>
      </View>

      {notice ? (
        <AppText variant="caption" tone="accent" style={styles.notice}>
          {notice}
        </AppText>
      ) : null}

      {parsed ? (
        <View style={[styles.result, { borderTopColor: theme.borderColor }]}>
          <AppText variant="caption" tone="secondary">
            类型：{parsed.type}
          </AppText>
          <AppText variant="body" numberOfLines={2}>
            歌单 ID：{parsed.id}
          </AppText>
          <HeaderButton label="载入歌单" accent onPress={load} style={styles.loadAction} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 12,
  },
  parseAction: { paddingHorizontal: 4, paddingVertical: 4 },
  notice: { paddingHorizontal: 16 },
  result: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  loadAction: { marginTop: 6 },
});

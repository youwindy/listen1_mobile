/**
 * Create a playlist, or rename one when `route.params.playlistId` is present.
 * Replaces `create-playlist.screen.js`, which always created a new playlist and
 * only prefilled the title.
 */
import { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AppText } from '../components/AppText';
import { HeaderButton } from '../components/HeaderButton';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMyPlaylistStore } from '../store/myPlaylist';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePlaylist'>;

export function CreatePlaylistScreen({ navigation, route }: Props) {
  const theme = useTheme();

  const playlistId = route.params?.playlistId;
  const existingTitle = useMyPlaylistStore(
    (state) =>
      state.playlists.find((playlist) => playlist.info.id === playlistId)?.info.title ?? ''
  );

  // The legacy screen prefilled the field with '新建歌单'; it starts empty here
  // so that the empty-title guard below is reachable, with that wording kept as
  // the placeholder.
  const [title, setTitle] = useState(existingTitle);
  const trimmedTitle = title.trim();
  const isSaveDisabled = trimmedTitle === '';

  const save = useCallback(() => {
    const nextTitle = title.trim();

    if (nextTitle === '') {
      Alert.alert('提示', '歌单名称不能为空');

      return;
    }

    if (playlistId) {
      useMyPlaylistStore.getState().editPlaylistTitle(playlistId, nextTitle);
    } else {
      useMyPlaylistStore.getState().createPlaylist(nextTitle);
    }

    navigation.goBack();
  }, [navigation, playlistId, title]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: playlistId ? '重命名歌单' : '新建歌单',
      headerRight: () => (
        <HeaderButton
          label="完成"
          accent
          onPress={save}
          style={isSaveDisabled ? styles.disabledAction : undefined}
        />
      ),
    });
  }, [isSaveDisabled, navigation, playlistId, save]);

  return (
    <Screen>
      <View style={styles.form}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={save}
          placeholder="新建歌单"
          placeholderTextColor={theme.thirdColor}
          selectTextOnFocus
          autoFocus
          returnKeyType="done"
          style={[
            styles.input,
            {
              borderColor: theme.borderColor,
              backgroundColor: theme.surfaceColor,
              color: theme.primaryColor,
            },
          ]}
        />
        <AppText variant="caption" tone="tertiary">
          {isSaveDisabled ? '请输入歌单名称后点击“完成”' : '点击右上角“完成”保存'}
        </AppText>
      </View>

      {/* Kept from the legacy screen: the shortcut into the import flow. */}
      <Pressable onPress={() => navigation.navigate('ImportPlaylist')} style={styles.importLink}>
        <AppText variant="body" tone="secondary">
          导入外部歌单 &gt;
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, gap: 8 },
  input: {
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 12,
  },
  disabledAction: { opacity: 0.4 },
  importLink: { alignItems: 'center', padding: 10, marginTop: 40 },
});

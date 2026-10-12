/**
 * Bottom "now playing" bar, ported from the legacy `MiniPlayer`.
 * Tapping it opens the full player; the play/pause control toggles the store.
 */
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { usePlayerStore } from '../store/player';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';
import type { RootStackParamList } from '../navigation/AppNavigator';

const HEIGHT = 52;

export function MiniPlayer() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const track = usePlayerStore((state) => state.nowplayingTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isLoading = usePlayerStore((state) => state.isLoadingTrack);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);

  if (!track) return null;

  return (
    <Pressable
      onPress={() => navigation.navigate('Player')}
      style={[styles.container, { backgroundColor: theme.windowColor, borderTopColor: theme.borderColor }]}
    >
      <Image
        source={track.img_url ? { uri: track.img_url } : require('../assets/images/logo.png')}
        style={styles.cover}
      />

      <View style={styles.info}>
        <AppText variant="body" numberOfLines={1}>
          {track.title}
        </AppText>
        <AppText variant="caption" tone="secondary" numberOfLines={1}>
          {track.artist}
        </AppText>
      </View>

      <Pressable
        onPress={togglePlay}
        hitSlop={10}
        style={styles.control}
        disabled={isLoading}
        accessibilityLabel={isPlaying ? '暂停' : '播放'}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={theme.accentColor} />
        ) : (
          <AppText variant="title">{isPlaying ? '❚❚' : '▶'}</AppText>
        )}
      </Pressable>

      <Pressable onPress={next} hitSlop={10} style={styles.control} accessibilityLabel="下一首">
        <AppText variant="title">▶▶</AppText>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  cover: { width: 38, height: 38, borderRadius: 4 },
  info: { flex: 1 },
  control: { paddingHorizontal: 6, paddingVertical: 4 },
});

import { Image, Pressable, StyleSheet, View } from 'react-native';

import type { PlaylistInfo } from '../api/types';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

export interface PlaylistCardProps {
  playlist: PlaylistInfo;
  /** Width of the card; the grid computes it from the screen size. */
  size: number;
  onPress(playlist: PlaylistInfo): void;
}

/**
 * A playlist tile for the browse/search grids.
 *
 * `Image` is React Native's built-in component; the legacy app used a custom
 * `image.component.js` wrapper for the same fallback behaviour.
 */
export function PlaylistCard({ playlist, size, onPress }: PlaylistCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => onPress(playlist)}
      style={({ pressed }) => [{ width: size }, pressed && { opacity: 0.6 }]}
    >
      <Image
        source={
          playlist.cover_img_url
            ? { uri: playlist.cover_img_url }
            : require('../assets/images/logo.png')
        }
        style={[styles.cover, { width: size, height: size, backgroundColor: theme.windowColor }]}
        resizeMode="cover"
      />
      <View style={styles.caption}>
        <AppText variant="caption" numberOfLines={2} style={styles.title}>
          {playlist.title}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: 6 },
  caption: { paddingTop: 6, paddingBottom: 10 },
  title: { lineHeight: 16 },
});

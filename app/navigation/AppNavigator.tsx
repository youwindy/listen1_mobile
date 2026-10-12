/**
 * Navigation graph.
 *
 * Replaces the legacy `Routes.js` (react-navigation 3 + `react-navigation-transitions`
 * + `react-native-scrollable-tab-view`). React Navigation 7 provides the native
 * stack, the platform transition animation and typed routes.
 *
 * The mini player and the full-screen player from the legacy root layout are now
 * real components: `MiniPlayer` is anchored inside the tab screen so it can sit
 * above the tab bar, and the player modal is a normal stack screen presented as
 * a modal.
 */
import { NavigationContainer, type Theme as NavTheme, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'react-native';
import { useMemo } from 'react';

import type { PlaylistId, Track } from '../api/types';
import { useTheme } from '../theme/useTheme';
import { PlaylistTabsScreen } from '../screens/PlaylistTabsScreen';
import { PlaylistScreen } from '../screens/PlaylistScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { MyPlaylistsScreen } from '../screens/MyPlaylistsScreen';
import { CreatePlaylistScreen } from '../screens/CreatePlaylistScreen';
import { ReorderScreen } from '../screens/ReorderScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { ImportPlaylistScreen } from '../screens/ImportPlaylistScreen';
import { ImportLocalScreen } from '../screens/ImportLocalScreen';
import { ExportLocalScreen } from '../screens/ExportLocalScreen';
import { AddToPlaylistScreen } from '../screens/AddToPlaylistScreen';

/** Every route in the app and the params it accepts. */
export type RootStackParamList = {
  Home: undefined;
  /** A platform playlist, opened from browse/search or a shared URL. */
  Playlist: { playlistId: PlaylistId };
  /** Search results for one platform. */
  Search: { platformId: string };
  Player: undefined;
  MyPlaylists: undefined;
  CreatePlaylist: { playlistId?: string } | undefined;
  Reorder: undefined;
  Settings: undefined;
  About: undefined;
  ImportPlaylist: undefined;
  ImportLocal: undefined;
  ExportLocal: undefined;
  /** Bottom sheet: add a track to one of the user's playlists. */
  AddToPlaylist: { track: Track; trackId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const theme = useTheme();

  const navigationTheme = useMemo<NavTheme>(() => {
    const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;

    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.accentColor,
        background: theme.backgroundColor,
        card: theme.windowColor,
        text: theme.primaryColor,
        border: theme.borderColor,
      },
    };
  }, [theme]);

  return (
    <NavigationContainer theme={navigationTheme}>
      {/* Android draws a background colour behind the status bar; on iOS only
          the bar style applies (the prop was removed in RN 0.87). */}
      <StatusBar barStyle={theme.barStyle} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.windowColor },
          headerTitleStyle: { color: theme.primaryColor, fontSize: 16 },
          headerTintColor: theme.accentColor,
          contentStyle: { backgroundColor: theme.backgroundColor },
          // The legacy app forced a right-to-left 200ms transition.
          animation: 'slide_from_right',
          animationDuration: 200,
        }}
      >
        <Stack.Screen name="Home" component={PlaylistTabsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Playlist" component={PlaylistScreen} options={{ title: '歌单' }} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ title: '搜索' }} />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen name="MyPlaylists" component={MyPlaylistsScreen} options={{ title: '我的歌单' }} />
        <Stack.Screen name="CreatePlaylist" component={CreatePlaylistScreen} options={{ title: '新建歌单' }} />
        <Stack.Screen name="Reorder" component={ReorderScreen} options={{ title: '排序歌单' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '设置' }} />
        <Stack.Screen name="About" component={AboutScreen} options={{ title: '关于' }} />
        <Stack.Screen name="ImportPlaylist" component={ImportPlaylistScreen} options={{ title: '导入歌单' }} />
        <Stack.Screen name="ImportLocal" component={ImportLocalScreen} options={{ title: '恢复备份' }} />
        <Stack.Screen name="ExportLocal" component={ExportLocalScreen} options={{ title: '备份数据' }} />
        <Stack.Screen
          name="AddToPlaylist"
          component={AddToPlaylistScreen}
          options={{ presentation: 'formSheet', title: '添加到歌单' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

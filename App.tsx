/**
 * App root.
 *
 * Replaces the legacy `App.js` + `Routes.js` pair. Redux's `Provider` and
 * `PersistGate` are gone: the Zustand stores rehydrate from AsyncStorage on
 * their own, so there is no gate to render.
 */
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from './app/navigation/AppNavigator';
import { PlaybackBridge } from './app/playback/PlaybackBridge';

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Headless: keeps the native player in sync with the store. */}
      <PlaybackBridge />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

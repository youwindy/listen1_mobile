/**
 * @format
 */

import { AppRegistry } from 'react-native';
import TrackPlayer from 'react-native-track-player';

import App from './App';
import { playbackService } from './app/playback/service';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

// Must be registered outside the component tree so remote controls keep working
// when the app is in the background or has been swiped away.
TrackPlayer.registerPlaybackService(() => playbackService);

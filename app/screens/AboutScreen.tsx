/**
 * About screen.
 *
 * Replaces `legacy/src/views/setting/about.screen.js`. The legacy screen had no
 * acknowledgements section; the list below is ported from the "鸣谢" section of
 * the project README, which is the only place the project credited them.
 */
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/useTheme';

/**
 * Mirrors the `version` field of package.json. Kept as a literal on purpose:
 * importing package.json from app code pulls the whole manifest into the
 * bundle and breaks Metro's module resolution for path-based fields.
 */
const APP_VERSION = '1.0.0';

const HOMEPAGE_URL = 'https://listen1.github.io/listen1';

interface Acknowledgment {
  name: string;
  url: string;
  description: string;
}

const ACKNOWLEDGMENTS: Acknowledgment[] = [
  {
    name: 'git-point',
    url: 'https://github.com/gitpoint/git-point',
    description: 'github 的 RN 客户端，提供本项目开发环境搭建的结构支持。',
  },
  {
    name: 'Binaryify/NeteaseCloudMusicApi',
    url: 'https://github.com/Binaryify/NeteaseCloudMusicApi',
    description: '网易 API，参考了网络协议部分代码。',
  },
  {
    name: 'yezihaohao/NeteaseCloudMusic',
    url: 'https://github.com/yezihaohao/NeteaseCloudMusic',
    description: '网易音乐 RN 端，参考了 RN 导航，播放部分的库代码实现。',
  },
  {
    name: 'soimort/you-get',
    url: 'https://github.com/soimort/you-get',
    description: '音乐下载命令行，参考了协议和法律相关声明。',
  },
];

export function AboutScreen() {
  const theme = useTheme();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.logoBlock}>
          <Image style={styles.logo} source={require('../assets/images/logo.png')} />
          <AppText variant="title" style={styles.appName}>
            Listen 1
          </AppText>
          <AppText variant="caption" tone="tertiary">
            一款支持多平台音乐播放和搜索的移动音乐 App
          </AppText>
        </View>

        <View style={[styles.row, { borderBottomColor: theme.borderColor }]}>
          <AppText variant="body">Listen 1 版本</AppText>
          <AppText variant="body" tone="secondary">
            v{APP_VERSION}
          </AppText>
        </View>
        <View style={[styles.row, { borderBottomColor: theme.borderColor }]}>
          <AppText variant="body">开源协议</AppText>
          <AppText variant="body" tone="secondary">
            MIT
          </AppText>
        </View>

        <Pressable
          onPress={() => {
            void Linking.openURL(HOMEPAGE_URL);
          }}
          style={({ pressed }) => [
            styles.row,
            { borderBottomColor: theme.borderColor },
            pressed && styles.pressed,
          ]}
        >
          <AppText variant="body">检查更新</AppText>
          <AppText variant="caption" tone="accent">
            {HOMEPAGE_URL}
          </AppText>
        </Pressable>

        <AppText variant="label" tone="tertiary" style={styles.sectionTitle}>
          鸣谢
        </AppText>
        {ACKNOWLEDGMENTS.map((item) => (
          <Pressable
            key={item.url}
            onPress={() => {
              void Linking.openURL(item.url);
            }}
            style={({ pressed }) => [styles.acknowledgment, pressed && styles.pressed]}
          >
            <AppText variant="body" tone="accent">
              {item.name}
            </AppText>
            <AppText variant="caption" tone="tertiary" style={styles.acknowledgmentText}>
              {item.description}
            </AppText>
          </Pressable>
        ))}
        <AppText variant="caption" tone="tertiary" style={styles.note}>
          开发过程还有很多开源软件提供了各种问题的解决方案，详见代码注释，篇幅原因不一一列出，感谢开源社区的各位开发者。
        </AppText>

        <AppText variant="label" tone="tertiary" style={styles.sectionTitle}>
          开源协议
        </AppText>
        <AppText variant="caption" tone="secondary" style={styles.note}>
          This software is distributed under the MIT license.
        </AppText>
        <AppText variant="caption" tone="tertiary" style={styles.note}>
          本软件基于 MIT 协议开源免费，可自由使用、修改和分发；请保留原始版权声明，并自行承担使用风险。
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  logoBlock: { alignItems: 'center', gap: 6, paddingVertical: 24 },
  logo: { width: 80, height: 80 },
  appName: { marginTop: 4 },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.6 },
  sectionTitle: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 4 },
  acknowledgment: { paddingHorizontal: 20, paddingVertical: 8 },
  acknowledgmentText: { marginTop: 2 },
  note: { paddingHorizontal: 20, paddingTop: 8 },
});

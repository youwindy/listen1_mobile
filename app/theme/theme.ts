/**
 * Colour palette, ported from `legacy/src/config/colors.js` so the rewrite keeps
 * the original Listen1 look. `theme` is the app's accent red.
 */
export const palette = {
  lightBlue: '#3498db',
  blue: '#0366d6',
  black: '#000000',
  white: '#ffffff',
  transparent: 'transparent',

  grey: '#bbb',
  greyDarkest: '#808080',
  greyBlue: '#6a737d',
  greyDark: '#999',
  greyMid: '#d1d5da',
  greyLight: '#f1f1f1',
  greyMidLight: '#f6f8fa',
  greyVeryLight: '#fbfbfb',

  green: '#2cbe4e',
  darkGreen: '#27ae60',
  red: '#ee0701',
  orange: '#e67e22',
  purple: '#8e44ad',

  /** Listen1 accent red. */
  theme: '#D43C33',
  alabaster: '#f7f7f7',

  nicewhite: '#f2f2f2',
  niceblack: '#666666',
  backgroundBlack: '#111111',
  windowBlack: '#171717',
  primaryBlack: '#7E7E7E',
  secondaryBlack: '#5a5a5a',
  inactiveGrey: '#393939',
  disableGreyInWhite: '#cfcfcf',
  secondaryWhite: '#666666',
  disableGreyInBlack: '#202020',
  borderWhite: '#eaeaea',
  borderBlack: '#2b2b2b',
  heartRed: '#cd2929',
  nowPlayingHighlight: '#ff4444',
  thirdWhite: '#afafaf',
  thirdBlack: '#555555',
} as const;

export interface Theme {
  /** Light or dark. */
  scheme: 'light' | 'dark';
  /** StatusBar barStyle value. */
  barStyle: 'light-content' | 'dark-content';
  backgroundColor: string;
  windowColor: string;
  primaryColor: string;
  secondaryColor: string;
  thirdColor: string;
  inactiveColor: string;
  disableColor: string;
  borderColor: string;
  playingColor: string;
  /** Accent used for buttons and active tabs. */
  accentColor: string;
  /** Card/row surface colour. */
  surfaceColor: string;
}

export const lightTheme: Theme = {
  scheme: 'light',
  barStyle: 'dark-content',
  backgroundColor: palette.white,
  windowColor: palette.nicewhite,
  primaryColor: palette.black,
  secondaryColor: palette.secondaryWhite,
  thirdColor: palette.thirdWhite,
  inactiveColor: palette.inactiveGrey,
  disableColor: palette.disableGreyInWhite,
  borderColor: palette.borderWhite,
  playingColor: palette.nowPlayingHighlight,
  accentColor: palette.theme,
  surfaceColor: palette.white,
};

export const darkTheme: Theme = {
  scheme: 'dark',
  barStyle: 'light-content',
  backgroundColor: palette.backgroundBlack,
  windowColor: palette.windowBlack,
  primaryColor: palette.white,
  secondaryColor: palette.primaryBlack,
  thirdColor: palette.thirdBlack,
  inactiveColor: palette.inactiveGrey,
  disableColor: palette.disableGreyInBlack,
  borderColor: palette.borderBlack,
  playingColor: palette.nowPlayingHighlight,
  accentColor: palette.theme,
  surfaceColor: palette.windowBlack,
};

export function themeFor(scheme: 'light' | 'dark'): Theme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

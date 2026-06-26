import { Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

export const SCREEN = {
  width,
  height,
  contentWidth: Math.min(width - 32, 392),
  isTall: height >= 850,
  isVeryTall: height >= 900,
};

export const LAYOUT = {
  maxWidth: SCREEN.contentWidth,
};

export const sx = (value) => (width / BASE_WIDTH) * value;
export const sy = (value) => (height / BASE_HEIGHT) * value;
export const s = (value) => Math.min(sx(value), sy(value));

export const COLORS = {
  bg: '#F7F6F1',
  bgWarm: '#F8F7F2',
  card: 'rgba(255,255,255,0.88)',
  cardStrong: 'rgba(255,255,255,0.94)',
  whiteSoft: 'rgba(255,255,255,0.72)',
  line: 'rgba(234, 236, 227, 0.95)',
  lineSoft: 'rgba(230, 232, 223, 0.72)',
  olive: '#56733F',
  oliveDeep: '#425E34',
  oliveSoft: '#A9B99C',
  olivePale: '#E6E9DB',
  text: '#232926',
  textSoft: '#8A9087',
  textMuted: '#9AA095',
  iconBg: '#EEF1E5',
  shadow: '#8B927A',
};

export const RADIUS = {
  card: 34,
  button: 36,
  input: 26,
  pill: 999,
};

export const SHADOWS = {
  soft: Platform.select({
    ios: {
      shadowColor: COLORS.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    android: {
      elevation: 6,
    },
  }),
  card: Platform.select({
    ios: {
      shadowColor: COLORS.shadow,
      shadowOpacity: 0.07,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
    },
    android: {
      elevation: 5,
    },
  }),
  button: Platform.select({
    ios: {
      shadowColor: COLORS.oliveDeep,
      shadowOpacity: 0.12,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
    },
    android: {
      elevation: 6,
    },
  }),
};

export const SHADOW = {
  card: SHADOWS.card,
  floating: SHADOWS.soft,
};

export const TYPO = {
  logoTag: {
    fontSize: 9,
    letterSpacing: 2.1,
    color: COLORS.olive,
  },
  titleXL: {
    fontSize: SCREEN.width > 410 ? 33 : 31,
    lineHeight: SCREEN.width > 410 ? 45 : 42,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  titleLG: {
    fontSize: SCREEN.width > 410 ? 28 : 27,
    lineHeight: SCREEN.width > 410 ? 38 : 36,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    lineHeight: 22,
    color: COLORS.textSoft,
    textAlign: 'center',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.text,
    fontWeight: '800',
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 22,
    color: COLORS.textSoft,
    fontWeight: '500',
  },
  cta: {
    fontSize: 16,
    lineHeight: 20,
    color: '#FFFFFF',
    fontWeight: '800',
  },
};

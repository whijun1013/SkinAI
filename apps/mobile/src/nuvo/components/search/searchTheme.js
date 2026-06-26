import { Platform } from 'react-native';

export const SEARCH_COLORS = {
  card: '#FFFFFF',
  cardAlt: '#FCFBF8',
  chip: '#E6E9DB',
  chipBorder: '#C8D5B9',
  chipText: '#4A6B38',
  border: '#E0DDD4',
  oliveLight: '#DFF0E8',
  oliveMuted: '#2E7D50',
};

export const searchShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      }
    : { elevation: 2 };

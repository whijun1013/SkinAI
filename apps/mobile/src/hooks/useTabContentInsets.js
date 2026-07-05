import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * MainTabScreen SafeAreaView(top) + 화면 자체 padding 조합.
 * paddingTop 64 고정값은 safe area와 겹쳐 상단 여백이 과하게 보임.
 */
export default function useTabContentInsets() {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: Math.max(20, 54 - insets.top),
    paddingBottom: Math.max(104, 132 - insets.bottom),
  };
}

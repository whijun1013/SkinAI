import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * MainTabScreen 하위 상세 화면 레이아웃.
 *
 * MainTabScreen SafeAreaView가 top/bottom safe area를 이미 적용하므로
 * 서브 화면에서 insets.top / insets.bottom 을 다시 더하면 여백이 2배가 됨.
 *
 * 서브 화면 진입 시 탭 바는 숨김 (MainTabScreen).
 */
/** footer paddingTop(12) + button(52) + paddingBottom(12) */
export const SUB_SCREEN_FOOTER_HEIGHT = 76;

export default function useSubScreenLayout() {
  return {
    /** 상단 바 — safe area 재적용 금지 (MainTabScreen SafeAreaView가 처리) */
    headerPaddingTop: 8,
    /** 하단 고정 버튼 영역 */
    footerPaddingBottom: 12,
    /** ScrollView 하단 여유 (고정 footer + 버퍼) */
    scrollPaddingBottom: SUB_SCREEN_FOOTER_HEIGHT + 16,
  };
}

/**
 * MainTab 밖 fullScreen Modal용 (식단 기록 상세 등).
 * SafeAreaView 대신 insets를 루트에 직접 적용 — iOS 상태바·다이나믹 아일랜드와 겹침 방지.
 */
export function useModalScreenLayout() {
  const insets = useSafeAreaInsets();

  return {
    rootStyle: {
      flex: 1,
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
    },
    headerPaddingTop: 8,
    footerPaddingBottom: 12,
    scrollPaddingBottom: SUB_SCREEN_FOOTER_HEIGHT + 16,
  };
}

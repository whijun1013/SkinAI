import React, { useMemo } from 'react';
import { Platform, PanResponder, View } from 'react-native';

/** 왼쪽 가장자리 터치 허용 폭 (px) */
const EDGE_WIDTH = 28;
/** 제스처 인식에 필요한 최소 오른쪽 이동 (px) */
const MOVE_ACTIVATE_DX = 14;
/** 뒤로가기 실행에 필요한 이동 (px) */
const SWIPE_THRESHOLD = 73;
/** 수직 드리프트 허용 (px) */
const MAX_VERTICAL_DRIFT = 26;
/** 가로가 세로보다 이 배수 이상 커야 스와이프로 인정 */
const HORIZONTAL_DOMINANCE = 1.5;

/** iOS 왼쪽 가장자리 스와이프 → 뒤로가기 */
export default function SwipeBackView({ onBack, children, style, enabled = true }) {
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (evt) => {
          if (!enabled || Platform.OS !== 'ios' || !onBack) return false;
          return evt.nativeEvent.pageX <= EDGE_WIDTH;
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          if (!enabled || Platform.OS !== 'ios' || !onBack) return false;
          const { x0, dx, dy } = gestureState;
          if (x0 > EDGE_WIDTH) return false;
          if (dx < MOVE_ACTIVATE_DX) return false;
          if (Math.abs(dy) > MAX_VERTICAL_DRIFT) return false;
          if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return false;
          return true;
        },
        onPanResponderRelease: (_, gestureState) => {
          const { dx, dy } = gestureState;
          if (dx < SWIPE_THRESHOLD) return;
          if (Math.abs(dy) > MAX_VERTICAL_DRIFT + 12) return;
          if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return;
          onBack();
        },
      }),
    [onBack, enabled]
  );

  if (Platform.OS !== 'ios' || !enabled || !onBack) {
    return <View style={style}>{children}</View>;
  }

  return (
    <View style={style} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

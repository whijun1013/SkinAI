import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_SLIDE_OFFSET = 480;
const DRAG_CLOSE_THRESHOLD = 80;
const DRAG_EXPAND_THRESHOLD = 22;
const DRAG_VELOCITY_THRESHOLD = 0.5;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function runSheetLayoutAnimation() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(
      280,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity
    )
  );
}

export function BottomSheetHandle() {
  return (
    <View style={handleStyles.wrap}>
      <View style={handleStyles.bar} />
    </View>
  );
}

const handleStyles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  bar: { width: 40, height: 4, borderRadius: 999, backgroundColor: 'rgba(0, 0, 0, 0.14)' },
});

export default function BottomSheet({
  visible,
  onDismiss,
  onClosed,
  children,
  header,
  slideOffset = DEFAULT_SLIDE_OFFSET,
  expanded = false,
  collapsedHeight = 360,
  expandedHeight,
  backgroundColor = '#FFFFFF',
  dimFullScreen = false,
  draggable = false,
  embedded = false,
  onExpand,
  onCollapse,
}) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const [previewHeight, setPreviewHeight] = useState(null);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(slideOffset)).current;
  const dragBaseYRef = useRef(0);
  const prevVisibleRef = useRef(visible);
  const onClosedRef = useRef(onClosed);
  const onDismissRef = useRef(onDismiss);
  const onExpandRef = useRef(onExpand);
  const onCollapseRef = useRef(onCollapse);
  const expandedRef = useRef(expanded);
  const collapsedHeightRef = useRef(collapsedHeight);
  const expandedHeightRef = useRef(expandedHeight);
  const isMountedRef = useRef(false);
  const renderedRef = useRef(rendered);
  renderedRef.current = rendered;

  const clearPreviewHeight = useCallback(() => setPreviewHeight(null), []);

  const finishClose = useCallback(
    (wasVisible) => {
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(slideOffset);
      clearPreviewHeight();
      setRendered(false);
      if (wasVisible) onClosedRef.current?.();
    },
    [backdropOpacity, clearPreviewHeight, sheetTranslateY, slideOffset]
  );

  useEffect(() => { onClosedRef.current = onClosed; }, [onClosed]);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);
  useEffect(() => { onExpandRef.current = onExpand; }, [onExpand]);
  useEffect(() => { onCollapseRef.current = onCollapse; }, [onCollapse]);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);
  useEffect(() => { collapsedHeightRef.current = collapsedHeight; }, [collapsedHeight]);
  useEffect(() => { expandedHeightRef.current = expandedHeight; }, [expandedHeight]);

  const springBack = () => {
    Animated.spring(sheetTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  };

  const handlePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => draggable,
        onMoveShouldSetPanResponder: (_, g) =>
          draggable && Math.abs(g.dy) > 2 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value) => {
            dragBaseYRef.current = typeof value === 'number' ? value : 0;
          });
        },
        onPanResponderMove: (_, g) => {
          const base = dragBaseYRef.current;
          const collapsed = collapsedHeightRef.current;
          const expandedH = expandedHeightRef.current;

          if (expandedH && onExpandRef.current) {
            if (expandedRef.current) {
              // 펼친 상태 — 아래로 드래그 시 높이만 줄임 (translateY 변경 없음)
              sheetTranslateY.setValue(0);
              if (g.dy > 0) {
                const delta = Math.min(g.dy, expandedH - collapsed);
                setPreviewHeight(expandedH - delta);
              } else {
                clearPreviewHeight();
              }
              return;
            }

            if (g.dy < 0) {
              // 접힌 상태 — 위로 드래그 시 높이만 키움 (translateY 변경 없음)
              sheetTranslateY.setValue(0);
              const delta = Math.min(-g.dy, expandedH - collapsed);
              setPreviewHeight(collapsed + delta);
              return;
            }
          }

          clearPreviewHeight();
          if (g.dy > 0) {
            sheetTranslateY.setValue(base + g.dy);
          } else {
            sheetTranslateY.setValue(Math.max(0, base));
          }
        },
        onPanResponderRelease: (_, g) => {
          clearPreviewHeight();

          const swipedDown = g.dy > DRAG_CLOSE_THRESHOLD || g.vy > DRAG_VELOCITY_THRESHOLD;
          const swipedUp = g.dy < -DRAG_EXPAND_THRESHOLD;

          if (swipedDown) {
            if (expandedRef.current && onCollapseRef.current) {
              springBack();
              onCollapseRef.current();
            } else {
              Animated.timing(sheetTranslateY, {
                toValue: slideOffset,
                duration: 200,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
              }).start(() => onDismissRef.current?.());
            }
          } else if (swipedUp && onExpandRef.current && !expandedRef.current) {
            springBack();
            onExpandRef.current();
          } else {
            springBack();
          }
        },
        onPanResponderTerminate: () => {
          clearPreviewHeight();
          springBack();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draggable, slideOffset]
  );

  const prevExpandedRef = useRef(expanded);
  useEffect(() => {
    const wasExpanded = prevExpandedRef.current;
    prevExpandedRef.current = expanded;

    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    // visible 변경 시에는 LayoutAnimation 제외 — 전역 레이아웃 애니메이션이
    // 뒤에 있는 다른 뷰(등록 페이지 등)까지 움직이게 하는 원인이 됨
    if (expandedHeight && visible && wasExpanded !== expanded) {
      runSheetLayoutAnimation();
    }
  }, [expanded, expandedHeight, visible]);

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (Platform.OS === 'android') {
      setRendered(visible);
      if (visible) {
        backdropOpacity.setValue(1);
        sheetTranslateY.setValue(0);
        dragBaseYRef.current = 0;
        clearPreviewHeight();
      } else if (wasVisible) {
        clearPreviewHeight();
        onClosedRef.current?.();
      }
      return undefined;
    }

    if (visible) {
      setRendered(true);
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(slideOffset);
      dragBaseYRef.current = 0;
      clearPreviewHeight();

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return undefined;
    }

    if (!renderedRef.current) return undefined;

    clearPreviewHeight();

    const closeAnim = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: slideOffset,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    closeAnim.start(({ finished }) => {
      if (finished) finishClose(wasVisible);
    });

    const safetyTimer = setTimeout(() => {
      if (!visible && renderedRef.current) finishClose(wasVisible);
    }, 400);

    return () => {
      closeAnim.stop();
      clearTimeout(safetyTimer);
    };
  }, [visible, backdropOpacity, sheetTranslateY, slideOffset, finishClose]);

  if (!rendered) return null;

  const resolvedHeight = expandedHeight
    ? previewHeight ?? (expanded ? expandedHeight : collapsedHeight)
    : null;

  const sheetSizeStyle = expandedHeight
    ? { height: resolvedHeight, maxHeight: expandedHeight }
    : styles.sheetAuto;

  const panHandlers = draggable ? handlePanResponder.panHandlers : null;

  const sheetBody = (
    <GestureHandlerRootView style={[styles.overlay, embedded && styles.embeddedOverlay]}>
      <Animated.View
        style={[
          styles.backdrop,
          { opacity: backdropOpacity, top: dimFullScreen ? 0 : insets.top },
        ]}
        pointerEvents={rendered ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onDismiss} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheetWrap,
          { transform: [{ translateY: sheetTranslateY }], backgroundColor },
        ]}
      >
        <View style={[styles.sheet, sheetSizeStyle, { paddingBottom: insets.bottom }]}>
          {draggable ? (
            <View style={styles.dragZone}>
              <View style={styles.dragCapture} {...panHandlers}>
                <View style={styles.dragHandle}>
                  <View style={styles.dragHandleBar} />
                </View>
                {header}
              </View>
            </View>
          ) : header ? (
            <View style={styles.staticHeader}>{header}</View>
          ) : null}
          {children}
        </View>
      </Animated.View>
    </GestureHandlerRootView>
  );

  if (embedded) {
    return <View style={styles.embeddedShell}>{sheetBody}</View>;
  }

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onDismiss}>
      {sheetBody}
    </Modal>
  );
}

const styles = StyleSheet.create({
  embeddedShell: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  embeddedOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  sheetWrap: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheet: { width: '100%', overflow: 'hidden' },
  sheetAuto: { maxHeight: '92%' },
  dragZone: { width: '100%' },
  dragCapture: { width: '100%' },
  staticHeader: { width: '100%' },
  dragHandle: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 60,
  },
  dragHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
  },
});

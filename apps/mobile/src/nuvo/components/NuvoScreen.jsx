import React from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView, Image, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SCREEN, COLORS } from '../constants/theme';
import { NUVO_ASSETS } from '../constants/assets';

export default function NuvoScreen({
  children,
  scroll = true,
  showBack = false,
  backLabel = '카메라',
  stepLabel,
  centerLogo = true,
  showSideLeaves = false,
  variant = 'default',
  contentContainerStyle,
}) {
  const content = (
    <View style={styles.base}>
      <BackgroundOrnaments variant={variant} showSideLeaves={showSideLeaves} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            {showBack ? (
              <>
                <Feather name="chevron-left" size={20} color="#101512" />
                <Text style={styles.backText}>{backLabel}</Text>
              </>
            ) : (
              <View />
            )}
          </View>

          {centerLogo ? (
            <Image source={NUVO_ASSETS.logo} style={styles.logo} resizeMode="contain" />
          ) : (
            <View />
          )}

          <View style={styles.topRight}>
            {stepLabel ? <Text style={styles.stepLabel}>{stepLabel}</Text> : <View />}
          </View>
        </View>

        <View style={[styles.contentContainer, contentContainerStyle]}>{children}</View>
      </SafeAreaView>
    </View>
  );

  if (!scroll) return content;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {content}
    </ScrollView>
  );
}

function BackgroundOrnaments({ variant, showSideLeaves }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.blobLeft} />
      <View style={styles.blobRight} />
      <View style={styles.blobLeftLower} />
      <View style={styles.blobRightLower} />

      {variant === 'flow' && <View style={styles.flowOrb} />}
      {variant === 'permission' && <View style={styles.permissionOrb} />}
      {variant === 'login' && <View style={styles.loginOrb} />}

      {showSideLeaves && (
        <>
          <Image source={NUVO_ASSETS.leafLeft} style={styles.leftLeaf} resizeMode="contain" />
          <Image source={NUVO_ASSETS.leafRight} style={styles.rightLeaf} resizeMode="contain" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: COLORS.bgWarm,
  },
  scrollContent: {
    flexGrow: 1,
  },
  base: {
    minHeight: SCREEN.height,
    backgroundColor: COLORS.bgWarm,
  },
  safe: {
    flex: 1,
    minHeight: SCREEN.height,
  },
  topBar: {
    height: 72,
    marginTop: 2,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLeft: {
    width: 86,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topRight: {
    width: 86,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  backText: {
    marginLeft: 2,
    fontSize: 14,
    color: '#121612',
    fontWeight: '500',
  },
  stepLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.oliveDeep,
    letterSpacing: -0.2,
  },
  logo: {
    width: 94,
    height: 36,
    opacity: 0.96,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 42,
  },

  blobLeft: {
    position: 'absolute',
    top: 34,
    left: -38,
    width: 170,
    height: 260,
    borderRadius: 90,
    backgroundColor: 'rgba(232,233,223,0.46)',
    transform: [{ rotate: '28deg' }],
  },
  blobRight: {
    position: 'absolute',
    top: 46,
    right: -28,
    width: 166,
    height: 246,
    borderRadius: 90,
    backgroundColor: 'rgba(232,233,223,0.46)',
    transform: [{ rotate: '-30deg' }],
  },
  blobLeftLower: {
    position: 'absolute',
    top: 190,
    left: -54,
    width: 210,
    height: 320,
    borderRadius: 120,
    backgroundColor: 'rgba(245,245,239,0.52)',
    transform: [{ rotate: '18deg' }],
  },
  blobRightLower: {
    position: 'absolute',
    top: 210,
    right: -60,
    width: 222,
    height: 340,
    borderRadius: 120,
    backgroundColor: 'rgba(245,245,239,0.52)',
    transform: [{ rotate: '-16deg' }],
  },

  flowOrb: {
    position: 'absolute',
    top: 520,
    alignSelf: 'center',
    width: SCREEN.width * 0.78,
    height: SCREEN.width * 0.78,
    borderRadius: 999,
    backgroundColor: 'rgba(230,233,219,0.50)',
  },
  permissionOrb: {
    position: 'absolute',
    top: 525,
    alignSelf: 'center',
    width: SCREEN.width * 0.72,
    height: SCREEN.width * 0.72,
    borderRadius: 999,
    backgroundColor: 'rgba(230,233,219,0.42)',
  },
  loginOrb: {
    position: 'absolute',
    top: 514,
    alignSelf: 'center',
    width: SCREEN.width * 0.94,
    height: 230,
    borderRadius: 130,
    backgroundColor: 'rgba(230,233,219,0.30)',
  },

  leftLeaf: {
    position: 'absolute',
    left: -8,
    top: 560,
    width: 96,
    height: 210,
    opacity: 0.95,
  },
  rightLeaf: {
    position: 'absolute',
    right: -2,
    top: 170,
    width: 96,
    height: 210,
    opacity: 0.95,
  },
});

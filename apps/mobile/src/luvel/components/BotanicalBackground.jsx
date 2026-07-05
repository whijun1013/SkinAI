import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ASSETS } from '../constants/assets';
import { COLORS } from '../constants/colors';
import { s, sx, sy } from '../constants/theme';

const flowCircle = sx(372);
const permissionCircle = sx(360);
const introCircle = sx(250);

export default function BotanicalBackground({ variant = 'flow' }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.base} />

      <View style={styles.vignetteTop} />
      <View style={styles.vignetteBottom} />

      <View style={styles.softLeafShadowLeft} />
      <View style={styles.softLeafShadowRight} />
      <View style={styles.softBlobLeft} />
      <View style={styles.softBlobRight} />

      {variant === 'intro' && (
        <>
          <View style={styles.introCircleOuter} />
          <View style={styles.introCircleMid} />
          <View style={styles.introCircleInner} />
        </>
      )}

      {variant === 'flow' && (
        <>
          <View style={styles.flowCircleOuter} />
          <View style={styles.flowCircleMid} />
          <View style={styles.flowCircleInner} />

          <Image source={ASSETS.leafLeft} style={styles.leafLeftFlow} resizeMode="contain" />
          <Image source={ASSETS.leafRight} style={styles.leafRightFlow} resizeMode="contain" />

          <View style={styles.waveLeft} />
          <View style={styles.waveRight} />
          <View style={styles.waveDotLeft} />
          <View style={styles.waveDotRight} />
        </>
      )}

      {variant === 'permission' && (
        <>
          <View style={styles.permissionCircleOuter} />
          <View style={styles.permissionCircleMid} />
          <View style={styles.permissionCircleInner} />

          <Image source={ASSETS.leafLeft} style={styles.leafLeftPermission} resizeMode="contain" />
          <Image
            source={ASSETS.leafRight}
            style={styles.leafRightPermission}
            resizeMode="contain"
          />

          <View style={styles.connect1} />
          <View style={styles.connect2} />
          <View style={styles.connect3} />

          <ConnectionDot top={sy(404)} />
          <ConnectionDot top={sy(500)} />
          <ConnectionDot top={sy(596)} />
          <ConnectionDot top={sy(692)} />
        </>
      )}

      {variant === 'login' && (
        <>
          <View style={styles.loginCircleOuter} />
          <View style={styles.loginCircleMid} />
          <Image source={ASSETS.leafRight} style={styles.loginLeafRight} resizeMode="contain" />
          <Image source={ASSETS.leafLeft} style={styles.loginLeafLeft} resizeMode="contain" />
        </>
      )}
    </View>
  );
}

function ConnectionDot({ top }) {
  return <View style={[styles.connectionDot, { top }]} />;
}

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
  },

  vignetteTop: {
    position: 'absolute',
    top: 0,
    width: '100%',
    height: sy(210),
    backgroundColor: 'rgba(255,255,255,0.28)',
  },

  vignetteBottom: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: sy(260),
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  softLeafShadowLeft: {
    position: 'absolute',
    top: sy(8),
    left: sx(-8),
    width: sx(120),
    height: sy(180),
    borderRadius: s(100),
    backgroundColor: 'rgba(74,93,78,0.035)',
    transform: [{ rotate: '-42deg' }],
  },

  softLeafShadowRight: {
    position: 'absolute',
    top: sy(40),
    right: sx(-18),
    width: sx(130),
    height: sy(190),
    borderRadius: s(110),
    backgroundColor: 'rgba(74,93,78,0.035)',
    transform: [{ rotate: '39deg' }],
  },

  softBlobLeft: {
    position: 'absolute',
    top: sy(130),
    left: sx(-72),
    width: sx(150),
    height: sy(230),
    borderRadius: s(100),
    backgroundColor: 'rgba(232,234,221,0.2)',
    transform: [{ rotate: '-22deg' }],
  },

  softBlobRight: {
    position: 'absolute',
    top: sy(162),
    right: sx(-78),
    width: sx(160),
    height: sy(245),
    borderRadius: s(120),
    backgroundColor: 'rgba(232,234,221,0.22)',
    transform: [{ rotate: '20deg' }],
  },

  introCircleOuter: {
    position: 'absolute',
    top: sy(365),
    width: introCircle,
    height: introCircle,
    borderRadius: introCircle / 2,
    backgroundColor: 'rgba(230,233,219,0.68)',
    alignSelf: 'center',
  },

  introCircleMid: {
    position: 'absolute',
    top: sy(386),
    width: introCircle * 0.82,
    height: introCircle * 0.82,
    borderRadius: (introCircle * 0.82) / 2,
    backgroundColor: 'rgba(232,234,221,0.38)',
    alignSelf: 'center',
  },

  introCircleInner: {
    position: 'absolute',
    top: sy(415),
    width: introCircle * 0.58,
    height: introCircle * 0.58,
    borderRadius: (introCircle * 0.58) / 2,
    backgroundColor: 'rgba(255,255,255,0.24)',
    alignSelf: 'center',
  },

  flowCircleOuter: {
    position: 'absolute',
    top: sy(338),
    width: flowCircle,
    height: flowCircle,
    borderRadius: flowCircle / 2,
    backgroundColor: 'rgba(230,233,219,0.6)',
    alignSelf: 'center',
  },

  flowCircleMid: {
    position: 'absolute',
    top: sy(372),
    width: flowCircle * 0.88,
    height: flowCircle * 0.88,
    borderRadius: (flowCircle * 0.88) / 2,
    backgroundColor: 'rgba(232,234,221,0.34)',
    alignSelf: 'center',
  },

  flowCircleInner: {
    position: 'absolute',
    top: sy(430),
    width: flowCircle * 0.62,
    height: flowCircle * 0.62,
    borderRadius: (flowCircle * 0.62) / 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
  },

  permissionCircleOuter: {
    position: 'absolute',
    top: sy(360),
    width: permissionCircle,
    height: permissionCircle,
    borderRadius: permissionCircle / 2,
    backgroundColor: 'rgba(230,233,219,0.36)',
    alignSelf: 'center',
  },

  permissionCircleMid: {
    position: 'absolute',
    top: sy(402),
    width: permissionCircle * 0.86,
    height: permissionCircle * 0.86,
    borderRadius: (permissionCircle * 0.86) / 2,
    backgroundColor: 'rgba(232,234,221,0.25)',
    alignSelf: 'center',
  },

  permissionCircleInner: {
    position: 'absolute',
    top: sy(458),
    width: permissionCircle * 0.62,
    height: permissionCircle * 0.62,
    borderRadius: (permissionCircle * 0.62) / 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignSelf: 'center',
  },

  loginCircleOuter: {
    position: 'absolute',
    top: sy(395),
    width: sx(330),
    height: sx(330),
    borderRadius: sx(165),
    backgroundColor: 'rgba(230,233,219,0.46)',
    alignSelf: 'center',
  },

  loginCircleMid: {
    position: 'absolute',
    top: sy(455),
    width: sx(250),
    height: sx(250),
    borderRadius: sx(125),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
  },

  leafLeftFlow: {
    position: 'absolute',
    left: sx(-88),
    top: sy(302),
    width: sx(170),
    height: sy(405),
    opacity: 0.95,
  },

  leafRightFlow: {
    position: 'absolute',
    right: sx(-118),
    top: sy(268),
    width: sx(175),
    height: sy(405),
    opacity: 0.7,
  },

  leafLeftPermission: {
    position: 'absolute',
    left: sx(-96),
    top: sy(548),
    width: sx(172),
    height: sy(385),
    opacity: 0.9,
  },

  leafRightPermission: {
    position: 'absolute',
    right: sx(-82),
    top: sy(216),
    width: sx(176),
    height: sy(400),
    opacity: 0.92,
  },

  loginLeafRight: {
    position: 'absolute',
    right: sx(-64),
    top: sy(42),
    width: sx(150),
    height: sy(230),
    opacity: 0.7,
  },

  loginLeafLeft: {
    position: 'absolute',
    left: sx(-84),
    top: sy(522),
    width: sx(150),
    height: sy(260),
    opacity: 0.5,
  },

  waveLeft: {
    position: 'absolute',
    left: sx(-62),
    top: sy(526),
    width: sx(188),
    height: sy(108),
    borderTopWidth: s(3),
    borderColor: 'rgba(255,255,255,0.9)',
    borderTopLeftRadius: s(120),
    borderTopRightRadius: s(120),
    transform: [{ rotate: '12deg' }],
  },

  waveRight: {
    position: 'absolute',
    right: sx(-58),
    top: sy(536),
    width: sx(188),
    height: sy(108),
    borderTopWidth: s(3),
    borderColor: 'rgba(255,255,255,0.88)',
    borderTopLeftRadius: s(120),
    borderTopRightRadius: s(120),
    transform: [{ rotate: '-12deg' }],
  },

  waveDotLeft: {
    position: 'absolute',
    left: sx(52),
    top: sy(516),
    width: s(23),
    height: s(23),
    borderRadius: s(12),
    backgroundColor: 'rgba(255,255,255,0.92)',
  },

  waveDotRight: {
    position: 'absolute',
    right: sx(46),
    top: sy(520),
    width: s(23),
    height: s(23),
    borderRadius: s(12),
    backgroundColor: 'rgba(255,255,255,0.92)',
  },

  connect1: {
    position: 'absolute',
    left: sx(48),
    top: sy(400),
    width: sx(82),
    height: sy(100),
    borderLeftWidth: s(3),
    borderTopWidth: s(3),
    borderColor: 'rgba(255,255,255,0.9)',
    borderTopLeftRadius: s(80),
  },

  connect2: {
    position: 'absolute',
    left: sx(48),
    top: sy(496),
    width: sx(82),
    height: sy(100),
    borderLeftWidth: s(3),
    borderTopWidth: s(3),
    borderColor: 'rgba(255,255,255,0.9)',
    borderTopLeftRadius: s(80),
  },

  connect3: {
    position: 'absolute',
    left: sx(48),
    top: sy(592),
    width: sx(82),
    height: sy(100),
    borderLeftWidth: s(3),
    borderTopWidth: s(3),
    borderColor: 'rgba(255,255,255,0.9)',
    borderTopLeftRadius: s(80),
  },

  connectionDot: {
    position: 'absolute',
    left: sx(62),
    width: s(14),
    height: s(14),
    borderRadius: s(8),
    backgroundColor: COLORS.oliveSoft,
    borderWidth: s(4),
    borderColor: COLORS.white,
  },
});

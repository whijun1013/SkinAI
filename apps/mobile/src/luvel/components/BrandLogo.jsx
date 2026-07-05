import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ASSETS } from '../constants/assets';

export default function BrandLogo({ size = 'default', style }) {
  const logoStyle = size === 'small' ? styles.small : size === 'tiny' ? styles.tiny : styles.logo;

  return (
    <View style={[styles.wrap, style]}>
      <Image source={ASSETS.logo} style={logoStyle} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  logo: {
    width: 218,
    height: 78,
  },

  small: {
    width: 170,
    height: 62,
  },

  tiny: {
    width: 120,
    height: 44,
  },
});

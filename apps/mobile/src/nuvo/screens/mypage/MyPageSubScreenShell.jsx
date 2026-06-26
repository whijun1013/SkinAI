import React from 'react';
import { StyleSheet } from 'react-native';

import { SubScreenRoot } from '../record/components/SubScreenLayout';

const BG = '#F7F8F5';

export default function MyPageSubScreenShell({ onBack, children, enabled = true }) {
  return (
    <SubScreenRoot onBack={onBack} enabled={enabled} style={styles.root}>
      {children}
    </SubScreenRoot>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
});

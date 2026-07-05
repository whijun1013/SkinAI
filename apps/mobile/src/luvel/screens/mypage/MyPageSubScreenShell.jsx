import React from 'react';
import { StyleSheet } from 'react-native';

import { SubScreenRoot, RECORD_COLORS } from '../record/components/SubScreenLayout';

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
    backgroundColor: RECORD_COLORS.bg,
  },
});

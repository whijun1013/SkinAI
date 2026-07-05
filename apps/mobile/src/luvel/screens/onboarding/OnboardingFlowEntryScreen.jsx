import { useRef } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';

import FlowOnboardingScreen from './FlowOnboardingScreen';
import OnboardingScreen from './OnboardingScreen';
import PermissionGuideScreen from './PermissionGuideScreen';

const { width } = Dimensions.get('window');

export default function OnboardingFlowEntryScreen({ onComplete }) {
  const scrollRef = useRef(null);

  const goToPage = (index) => {
    scrollRef.current?.scrollTo({
      x: width * index,
      animated: true,
    });
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      bounces={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      style={styles.root}
      scrollEventThrottle={16}
    >
      <View style={styles.page}>
        <OnboardingScreen onNext={() => goToPage(1)} />
      </View>
      <View style={styles.page}>
        <FlowOnboardingScreen onNext={() => goToPage(2)} />
      </View>
      <View style={styles.page}>
        <PermissionGuideScreen
          onBack={() => goToPage(1)}
          onNext={onComplete}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  page: {
    width,
  },
});

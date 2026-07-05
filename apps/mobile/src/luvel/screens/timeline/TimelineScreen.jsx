import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTimelineSummary } from '../../../api/timeline';

const COLORS = {
  bg: '#F8F7F2',
  surface: '#FFFCF7',
  line: '#DED9CD',
  olive: '#4F603C',
  oliveSoft: '#E8EEDD',
  text: '#1F2520',
  muted: '#8B9184',
  warning: '#A45F48',
};

const formatDate = (dateObj) => {
  const d = new Date(dateObj);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${m}월 ${day}일 (${days[d.getDay()]})`;
};

export default function TimelineScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [timelineData, setTimelineData] = useState([]);
  
  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date();
      const past = new Date();
      past.setDate(today.getDate() - 14); // Fetch last 14 days
      
      const startStr = past.toISOString().split('T')[0];
      const endStr = today.toISOString().split('T')[0];
      
      const res = await getTimelineSummary(startStr, endStr);
      // reverse to show latest first
      setTimelineData(res.reverse());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.olive} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.olive} />
        </Pressable>
        <Text style={styles.title}>통합 타임라인 뷰</Text>
      </View>
      
      {timelineData.map((day) => (
        <View key={day.date} style={styles.card}>
          <View style={styles.dateRow}>
            <Text style={styles.dateText}>{formatDate(day.date)}</Text>
            {day.skin.score ? (
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreText}>피부 {day.skin.score}점</Text>
              </View>
            ) : null}
          </View>
          
          <View style={styles.events}>
            {/* Skin */}
            {day.skin.tags.length > 0 && (
              <View style={styles.eventRow}>
                <Ionicons name="body-outline" size={16} color={COLORS.olive} />
                <Text style={styles.eventText}>{day.skin.tags.join(', ')}</Text>
              </View>
            )}
            
            {/* Diet */}
            {day.diet.meal_count > 0 && (
              <View style={styles.eventRow}>
                <Ionicons name="restaurant-outline" size={16} color={COLORS.olive} />
                <Text style={styles.eventText}>식사 {day.diet.meal_count}번 ({day.diet.signals.join(', ')})</Text>
              </View>
            )}
            
            {/* Cosmetics */}
            {day.cosmetics.recent_started > 0 && (
              <View style={styles.eventRow}>
                <Ionicons name="flask-outline" size={16} color={COLORS.warning} />
                <Text style={styles.eventText}>새 화장품 시작: {day.cosmetics.names.join(', ')}</Text>
              </View>
            )}
            
            {/* Medications */}
            {day.medications.recent_started > 0 && (
              <View style={styles.eventRow}>
                <Ionicons name="medkit-outline" size={16} color={COLORS.warning} />
                <Text style={styles.eventText}>새 약 시작: {day.medications.names.join(', ')}</Text>
              </View>
            )}

            {!day.skin.score && day.diet.meal_count === 0 && (
              <Text style={styles.emptyText}>기록이 없는 날이에요.</Text>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: { marginRight: 10 },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  scoreBadge: {
    backgroundColor: COLORS.oliveSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreText: { fontSize: 12, fontWeight: '700', color: COLORS.olive },
  events: { gap: 8 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  eventText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
  emptyText: { fontSize: 13, color: COLORS.muted, fontStyle: 'italic' }
});

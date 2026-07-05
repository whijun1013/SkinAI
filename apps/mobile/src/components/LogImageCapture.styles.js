import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  // ===== 트리거 버튼 ("📸 기록 시작") =====
  triggerButton: {
    height: 48, // HomeScreen의 primaryButton과 동일 높이
    paddingHorizontal: 18,
    borderRadius: 15, // HomeScreen의 primaryButton과 동일
    backgroundColor: '#4f704f', // ← HomeScreen의 주요 색!
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f704f',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },

  triggerButtonText: {
    color: '#ffffff',
    fontSize: 13.5, // HomeScreen의 primaryButtonText와 동일
    fontWeight: 'bold',
  },

  // ===== 모달 (팝업 화면) =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },

  modalContainer: {
    backgroundColor: '#fbfaf6', // ← HomeScreen의 배경색!
    padding: 20,
    borderTopLeftRadius: 26, // HomeScreen의 heroCard와 동일
    borderTopRightRadius: 26,
    minHeight: 400,
  },

  closeButton: {
    fontSize: 24,
    textAlign: 'right',
    marginBottom: 20,
    color: '#1f2822', // HomeScreen의 텍스트 색
  },

  // ===== 타이틀 =====
  title: {
    fontSize: 26, // HomeScreen의 heroTitle와 동일
    fontWeight: 'bold',
    color: '#26362a', // HomeScreen의 heroTitle 색
    letterSpacing: -1,
    marginBottom: 20,
  },

  subtitle: {
    fontSize: 17, // HomeScreen의 cardTitle와 동일
    fontWeight: 'bold',
    color: '#1f2822', // HomeScreen의 cardTitle 색
    letterSpacing: -0.5,
    marginBottom: 20,
  },

  // ===== 선택 버튼 (피부/식단) =====
  selectionButton: {
    padding: 15,
    backgroundColor: '#ffffff', // HomeScreen의 카드 배경색
    borderRadius: 22, // HomeScreen의 card와 동일
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#dde6d8', // HomeScreen의 card 테두리와 동일
    shadowColor: '#363f37',
    shadowOpacity: 0.05,
    shadowRadius: 9,
    elevation: 2,
  },

  selectionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2822', // HomeScreen의 텍스트 색
  },

  // ===== 끼니 선택 =====
  mealTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },

  mealTypeButton: {
    flex: 1,
    minWidth: '45%',
    padding: 12,
    borderRadius: 16, // HomeScreen의 factorCard와 동일
    borderWidth: 2,
    borderColor: '#dce9d6', // HomeScreen의 factorCard 테두리와 유사
    backgroundColor: '#ffffff',
  },

  mealTypeButtonActive: {
    borderColor: '#4f704f', // ← HomeScreen의 주요 색!
    backgroundColor: '#eef6ec', // ← HomeScreen의 SKIN_CHANGES 배경과 유사 (#eef6ec)
  },

  mealTypeButtonText: {
    textAlign: 'center',
    fontWeight: '600',
    color: '#5f695e', // HomeScreen의 보조 텍스트 색
  },

  mealTypeButtonTextActive: {
    color: '#4f704f', // ← HomeScreen의 주요 색!
    fontWeight: 'bold',
  },

  // ===== 액션 버튼 =====
  actionButton: {
    padding: 15,
    borderRadius: 15, // HomeScreen의 primaryButton과 동일
    marginBottom: 10,
  },

  primaryButton: {
    backgroundColor: '#4f704f', // ← HomeScreen의 주요 색!
    shadowColor: '#4f704f',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },

  primaryButtonText: {
    fontSize: 13.5, // HomeScreen의 primaryButtonText와 동일
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },

  secondaryButton: {
    backgroundColor: '#f5faf2', // ← HomeScreen의 heroCard 배경과 유사!
    borderWidth: 1,
    borderColor: '#dfe9da', // HomeScreen의 heroCard 테두리와 동일
  },

  secondaryButtonText: {
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
    color: '#4f704f', // ← HomeScreen의 주요 색!
  },

  disabledButton: {
    opacity: 0.5,
  },
});

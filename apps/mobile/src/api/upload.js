import { API_BASE_URL } from '@env';

console.log('📍 upload.js 파일 로드됨!');

// ===== 1️⃣ 피부 사진 업로드 =====
// 💡 매개변수로 imageUri를 추가로 받습니다!
export const uploadSkinImage = async (userId, imageUri, authToken) => {
  console.log('🚀 uploadSkinImage API 호출됨!');

  try {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      name: 'skin_photo.jpg',
      type: 'image/jpeg',
    });

    const response = await fetch(`${API_BASE_URL}/upload/skin-log/image?user_id=${userId}`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${authToken}`,
        // fetch에서 FormData를 보낼 때 Content-Type은 자동 설정되게 냅두는 것이 좋습니다.
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || '피부 사진 업로드 실패');
    }

    console.log('✅ 피부 사진 업로드 성공:', data);
    return data;
  } catch (error) {
    console.error('❌ 피부 업로드 에러:', error.message);
    // 에러를 던져서 LogImageCapture.jsx의 catch 구문에서 Alert를 띄우게 합니다.
    throw error;
  }
};

// ===== 2️⃣ 식단 사진 업로드 =====
// 💡 매개변수로 imageUri를 추가로 받습니다!
export const uploadDietImage = async (userId, mealType, imageUri, authToken) => {
  console.log(`🍽️ uploadDietImage API 호출됨!`);

  try {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      name: `${mealType}_photo.jpg`,
      type: 'image/jpeg',
    });

    const response = await fetch(
      `${API_BASE_URL}/upload/diet-log/image?user_id=${userId}&meal_type=${mealType}`,
      {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || '식단 사진 업로드 실패');
    }

    console.log(`✅ ${mealType} 사진 업로드 성공:`, data);
    return data;
  } catch (error) {
    console.error(`❌ ${mealType} 업로드 에러:`, error.message);
    throw error;
  }
};

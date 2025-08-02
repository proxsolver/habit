// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyC6bvEaHsxpLtPv5zM99PmgAwOnRXnhkBM",
    authDomain: "habit-dc62a.firebaseapp.com",
    projectId: "habit-dc62a",
    storageBucket: "habit-dc62a.firebasestorage.app",
    messagingSenderId: "668374525477",
    appId: "1:668374525477:web:ecbecd95ec631fb82cc1cc",
    measurementId: "G-DV5Z9YVTZG"
};

// Firebase 초기화 (안전하게)
function initFirebase() {
    try {
        if (typeof firebase !== 'undefined') {
            firebase.initializeApp(firebaseConfig);
            window.auth = firebase.auth();
            window.db = firebase.firestore();
            console.log('✅ Firebase 초기화 성공!');
            console.log('🔥 프로젝트 ID:', firebaseConfig.projectId);
            return true;
        } else {
            console.log('⏳ Firebase SDK 로딩 중...');
            return false;
        }
    } catch (error) {
        console.error('❌ Firebase 초기화 실패:', error);
        return false;
    }
}

// Firebase 로드 대기
if (!initFirebase()) {
    // Firebase가 아직 로드되지 않았다면 잠시 기다리기
    const checkFirebase = setInterval(() => {
        if (initFirebase()) {
            clearInterval(checkFirebase);
        }
    }, 100);
}
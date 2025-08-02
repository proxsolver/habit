// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyC6bvEaHsxpLtPv5zM99PmgAwOnRXnhkBM",
    authDomain: "habit-dc62a.firebaseapp.com",
    projectId: "habit-dc62a",
    storageBucket: "habit-dc62a.firebasestorage.app",
    messagingSenderId: "668374525477",
    appId: "1:668374525477:web:ecbecd95ec631fb82cc1cc",
    measurementId: "G-DV5Z9YVTZG"
  };


firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();
window.db = firebase.firestore();
console.log('✅ Firebase 초기화 성공!');
// Firebase 설정 - 실제 프로젝트에서는 여러분의 Firebase 설정으로 교체하세요
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

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 전역 변수
let currentUser = null;
let userRole = 'parent';
let familyId = null;
let routines = [];
let familyMembers = [];

// 기본 명언들
const quotes = [
    "성공은 매일의 작은 노력들이 쌓여서 만들어진다.",
    "오늘 하루도 최선을 다하는 하루가 되길.",
    "작은 습관이 큰 변화를 만든다.",
    "꾸준함이 천재를 이긴다.",
    "매일 조금씩 나아지는 것이 중요하다."
];

// 초기화
function init() {
    updateCurrentDate();
    updateDailyQuote();
    
    // 인증 상태 변경 감지
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserProfile();
            showMainApp();
            startRealtimeListeners();
        } else {
            currentUser = null;
            showLoginPage();
        }
    });
}

// 역할 선택
function selectRole(role) {
    userRole = role;
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    const familyCodeInput = document.getElementById('familyCodeInput');
    if (role === 'child') {
        familyCodeInput.style.display = 'block';
    } else {
        familyCodeInput.style.display = 'none';
    }
}

// 인증 처리
async function handleAuth(type) {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const familyCode = document.getElementById('familyCode').value;

    if (!email || !password) {
        showNotification('이메일과 비밀번호를 입력해주세요.', 'error');
        return;
    }

    if (userRole === 'child' && type === 'register' && !familyCode) {
        showNotification('가족 코드를 입력해주세요.', 'error');
        return;
    }

    setLoading(true);

    try {
        let userCredential;
        
        if (type === 'login') {
            userCredential = await auth.signInWithEmailAndPassword(email, password);
        } else {
            userCredential = await auth.createUserWithEmailAndPassword(email, password);
            
            // 회원가입 시 사용자 프로필 생성
            await createUserProfile(userCredential.user, familyCode);
        }

        showNotification('성공적으로 ' + (type === 'login' ? '로그인' : '회원가입') + '되었습니다!');
        
    } catch (error) {
        console.error('인증 오류:', error);
        showNotification(getErrorMessage(error.code), 'error');
    } finally {
        setLoading(false);
    }
}

// 사용자 프로필 생성
async function createUserProfile(user, familyCode = null) {
    const userData = {
        email: user.email,
        role: userRole,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (userRole === 'parent') {
        // 부모인 경우 새 가족 생성
        const newFamilyId = generateFamilyCode();
        userData.familyId = newFamilyId;
        userData.isParent = true;

        // 가족 정보 생성
        await db.collection('families').doc(newFamilyId).set({
            parentId: user.uid,
            members: [user.uid],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            familyCode: newFamilyId
        });

        // 가족 코드 표시
        document.getElementById('generatedFamilyCode').textContent = newFamilyId;
        document.getElementById('familyCodeDisplay').classList.remove('hidden');
        
    } else {
        // 자녀인 경우 기존 가족에 참여
        if (familyCode) {
            const familyDoc = await db.collection('families').doc(familyCode).get();
            if (familyDoc.exists) {
                userData.familyId = familyCode;
                userData.isParent = false;

                // 가족 구성원에 추가
                await db.collection('families').doc(familyCode).update({
                    members: firebase.firestore.FieldValue.arrayUnion(user.uid)
                });
            } else {
                throw new Error('존재하지 않는 가족 코드입니다.');
            }
        }
    }

    await db.collection('users').doc(user.uid).set(userData);
    
    // 기본 루틴 생성
    await createDefaultRoutines(user.uid, userData.familyId);
}

// 사용자 프로필 로드
async function loadUserProfile() {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data();
        userRole = userData.role;
        familyId = userData.familyId;
        
        document.getElementById('userEmail').textContent = currentUser.email;
        document.getElementById('userRole').textContent = userRole === 'parent' ? '부모' : '자녀';
        
        await loadRoutines();
        await loadFamilyMembers();
        renderRoutines();
    }
}

// 기본 루틴 생성
async function createDefaultRoutines(userId, familyId) {
    const defaultRoutines = [
        {
            name: '취침 시간',
            type: 'time',
            time: 'evening',
            frequency: 'daily',
            order: 1
        },
        {
            name: '기상 시간',
            type: 'time',
            time: 'morning',
            frequency: 'daily',
            order: 2
        },
        {
            name: '운동하기',
            type: 'yesno',
            time: 'morning',
            frequency: 'daily',
            order: 3
        },
        {
            name: '물 마시기 (잔)',
            type: 'number',
            time: 'evening',
            frequency: 'daily',
            order: 4
        }
    ];

    const batch = db.batch();
    defaultRoutines.forEach((routine, index) => {
        const routineRef = db.collection('routines').doc();
        batch.set(routineRef, {
            ...routine,
            userId: userId,
            familyId: familyId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    });

    await batch.commit();
}

// 루틴 로드
async function loadRoutines() {
    if (!currentUser || !familyId) return;
    
    const routinesSnapshot = await db.collection('routines')
        .where('userId', '==', currentUser.uid)
        .where('familyId', '==', familyId)
        .orderBy('order')
        .get();

    routines = routinesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

// 가족 구성원 로드
async function loadFamilyMembers() {
    if (!familyId) return;

    const familyDoc = await db.collection('families').doc(familyId).get();
    if (familyDoc.exists) {
        const familyData = familyDoc.data();
        const memberIds = familyData.members;

        const membersPromises = memberIds.map(async (memberId) => {
            const userDoc = await db.collection('users').doc(memberId).get();
            return { id: memberId, ...userDoc.data() };
        });

        familyMembers = await Promise.all(membersPromises);
        renderFamilyMembers();
    }
}

// 실시간 리스너 시작
function startRealtimeListeners() {
    if (!currentUser || !familyId) return;

    // 자녀 루틴 완료 알림 (부모만)
    if (userRole === 'parent') {
        const today = new Date().toISOString().split('T')[0];
        
        db.collection('routine_logs')
            .where('familyId', '==', familyId)
            .where('date', '==', today)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (data.userId !== currentUser.uid && data.completed) {
                            showRoutineCompletionNotification(data);
                        }
                    }
                });
            });
    }

    // 가족 구성원 상태 업데이트
    db.collection('users')
        .where('familyId', '==', familyId)
        .onSnapshot(() => {
            loadFamilyMembers();
        });
}

// 루틴 완료 알림 표시
function showRoutineCompletionNotification(routineData) {
    const member = familyMembers.find(m => m.id === routineData.userId);
    const memberName = member ? member.email.split('@')[0] : '가족';
    
    showNotification(`${memberName}님이 "${routineData.routineName}" 루틴을 완료했습니다! 🎉`);
}

// 현재 날짜 업데이트
function updateCurrentDate() {
    const today = new Date();
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
    };
    document.getElementById('currentDate').textContent = 
        today.toLocaleDateString('ko-KR', options);
}

// 일일 명언 업데이트
function updateDailyQuote() {
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const quoteIndex = dayOfYear % quotes.length;
    document.getElementById('dailyQuote').textContent = quotes[quoteIndex];
}

// 수면시간 계산
function calculateSleepHours() {
    const bedtimeRoutine = routines.find(r => r.name === '취침 시간');
    const wakeupRoutine = routines.find(r => r.name === '기상 시간');
    
    if (bedtimeRoutine?.value && wakeupRoutine?.value) {
        const bed = new Date(`2024-01-01 ${bedtimeRoutine.value}`);
        let wake = new Date(`2024-01-01 ${wakeupRoutine.value}`);
        
        if (wake <= bed) {
            wake.setDate(wake.getDate() + 1);
        }
        
        const diff = wake - bed;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        return `${hours}시간 ${minutes}분`;
    }
    
    return '-';
}

// 루틴 렌더링
function renderRoutines() {
    const container = document.getElementById('routineList');
    container.innerHTML = '';

    routines.forEach(routine => {
        if (routine.name === '취침 시간' || routine.name === '기상 시간') return;
        
        const routineEl = document.createElement('div');
        routineEl.className = 'routine-item';
        
        let controlsHtml = '';
        
        if (routine.type === 'yesno') {
            controlsHtml = `
                <div class="yes-no-btns">
                    <button class="yes-btn ${routine.value === 'yes' ? 'active' : ''}" 
                            onclick="updateRoutine('${routine.id}', 'yes')">예</button>
                    <button class="no-btn ${routine.value === 'no' ? 'active' : ''}" 
                            onclick="updateRoutine('${routine.id}', 'no')">아니오</button>
                </div>
            `;
        } else if (routine.type === 'number') {
            controlsHtml = `
                <input type="number" class="number-input" 
                       value="${routine.value || ''}" 
                       placeholder="0"
                       onchange="updateRoutine('${routine.id}', this.value)">
            `;
        } else if (routine.type === 'time') {
            controlsHtml = `
                <input type="time" class="time-input" 
                       value="${routine.value || ''}"
                       onchange="updateRoutine('${routine.id}', this.value)">
            `;
        }

        routineEl.innerHTML = `
            <div class="routine-title">${routine.name}</div>
            <div class="routine-controls">
                ${controlsHtml}
            </div>
        `;

        container.appendChild(routineEl);
    });

    document.getElementById('sleepHours').textContent = calculateSleepHours();
}

// 가족 구성원 렌더링
function renderFamilyMembers() {
    if (userRole !== 'parent') return;
    
    const container = document.getElementById('familyMembers');
    container.innerHTML = '';

    familyMembers.forEach(member => {
        if (member.id === currentUser.uid) return; // 본인 제외
        
        const memberEl = document.createElement('div');
        memberEl.className = 'member-card';
        
        const memberName = member.email.split('@')[0];
        const isOnline = member.lastActive && 
            (Date.now() - member.lastActive.toDate().getTime()) < 5 * 60 * 1000;

        memberEl.innerHTML = `
            <div class="member-header">
                <div class="member-name">${memberName}</div>
                <div class="member-status ${isOnline ? 'online' : 'offline'}">
                    ${isOnline ? '온라인' : '오프라인'}
                </div>
            </div>
            <div class="routine-progress" id="member-${member.id}-progress">
                <!-- 루틴 진행상황이 여기에 표시됩니다 -->
            </div>
        `;

        container.appendChild(memberEl);
        
        // 구성원의 루틴 진행상황 로드
        loadMemberRoutineProgress(member.id);
    });
}

// 구성원 루틴 진행상황 로드
async function loadMemberRoutineProgress(memberId) {
    const today = new Date().toISOString().split('T')[0];
    
    const logsSnapshot = await db.collection('routine_logs')
        .where('userId', '==', memberId)
        .where('familyId', '==', familyId)
        .where('date', '==', today)
        .get();

    const progressContainer = document.getElementById(`member-${memberId}-progress`);
    progressContainer.innerHTML = '';

    const routinesSnapshot = await db.collection('routines')
        .where('userId', '==', memberId)
        .where('familyId', '==', familyId)
        .get();

    const memberRoutines = routinesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const logs = {};
    
    logsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        logs[data.routineId] = data;
    });

    memberRoutines.forEach(routine => {
        const log = logs[routine.id];
        let status = 'pending';
        let statusText = '대기중';
        
        if (log) {
            if (log.completed) {
                status = 'completed';
                statusText = '완료';
            } else if (log.skipped) {
                status = 'skipped';
                statusText = '건너뜀';
            }
        }

        const badgeEl = document.createElement('div');
        badgeEl.className = `routine-badge ${status}`;
        badgeEl.textContent = `${routine.name}: ${statusText}`;
        
        progressContainer.appendChild(badgeEl);
    });
}

// 루틴 값 업데이트
async function updateRoutine(routineId, value) {
    const routine = routines.find(r => r.id === routineId);
    if (!routine) return;

    routine.value = value;
    
    // Firebase에 저장
    const today = new Date().toISOString().split('T')[0];
    const logData = {
        routineId: routineId,
        routineName: routine.name,
        userId: currentUser.uid,
        familyId: familyId,
        value: value,
        completed: true,
        date: today,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('routine_logs').doc(`${routineId}_${currentUser.uid}_${today}`).set(logData);
        renderRoutines();
        
        // 자녀가 루틴을 완료했을 때 부모에게 알림을 위해 lastActive 업데이트
        await db.collection('users').doc(currentUser.uid).update({
            lastActive: firebase.firestore.FieldValue.serverTimestamp()
        });
        
    } catch (error) {
        console.error('루틴 업데이트 오류:', error);
        showNotification('루틴 업데이트에 실패했습니다.', 'error');
    }
}

// 새 루틴 추가
async function addRoutine() {
    const name = document.getElementById('routineName').value;
    const type = document.getElementById('routineType').value;
    const time = document.getElementById('routineTime').value;
    const frequency = document.getElementById('routineFreq').value;

    if (!name.trim()) {
        showNotification('루틴 이름을 입력해주세요.', 'error');
        return;
    }

    const newRoutine = {
        name: name.trim(),
        type: type,
        time: time,
        frequency: frequency,
        order: routines.length + 1,
        userId: currentUser.uid,
        familyId: familyId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        const docRef = await db.collection('routines').add(newRoutine);
        routines.push({ id: docRef.id, ...newRoutine });
        renderRoutines();
        closeModal();
        
        document.getElementById('routineName').value = '';
        showNotification('새 루틴이 추가되었습니다!');
        
    } catch (error) {
        console.error('루틴 추가 오류:', error);
        showNotification('루틴 추가에 실패했습니다.', 'error');
    }
}

// 페이지 전환
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    
    if (page === 'home') {
        document.getElementById('homePage').style.display = 'block';
        document.querySelectorAll('.nav-item')[0].classList.add('active');
    } else if (page === 'manage') {
        document.getElementById('managePage').style.display = 'block';
        document.querySelectorAll('.nav-item')[1].classList.add('active');
    } else if (page === 'family') {
        document.getElementById('familyPage').style.display = 'block';
        document.querySelectorAll('.nav-item')[4].classList.add('active');
        if (userRole === 'parent') {
            loadFamilyMembers();
        }
    }
}

// 유틸리티 함수들
function generateFamilyCode() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function getErrorMessage(errorCode) {
    const messages = {
        'auth/user-not-found': '등록되지 않은 이메일입니다.',
        'auth/wrong-password': '비밀번호가 잘못되었습니다.',
        'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
        'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
        'auth/invalid-email': '유효하지 않은 이메일 형식입니다.'
    };
    return messages[errorCode] || '오류가 발생했습니다.';
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function setLoading(loading) {
    const loginBtn = document.getElementById('loginBtn');
    if (loading) {
        loginBtn.disabled = true;
        loginBtn.textContent = '처리 중...';
        document.querySelector('.login-form').classList.add('loading');
    } else {
        loginBtn.disabled = false;
        loginBtn.textContent = '로그인';
        document.querySelector('.login-form').classList.remove('loading');
    }
}

// 모달 관련
function openAddRoutineModal() {
    document.getElementById('addRoutineModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('addRoutineModal').style.display = 'none';
}

// 로그아웃
async function logout() {
    try {
        await auth.signOut();
        showNotification('로그아웃되었습니다.');
    } catch (error) {
        console.error('로그아웃 오류:', error);
        showNotification('로그아웃에 실패했습니다.', 'error');
    }
}

function showLoginPage() {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
}

// 초기화 실행
init();

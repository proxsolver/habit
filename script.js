console.log('🛰️ [Satellite] script.js: 스크립트 파일 로드 및 구문 분석 완료.');

// ====================================================================
// 1. 전역 변수 (Global Variables)
// ====================================================================
let sampleRoutines = [];
let userAreas = [];
let userStats = {};
let currentUser = null; // 로그인된 사용자 정보를 저장할 변수
let sortableInstance = null;
let orderChanged = false;
let activeRoutineForModal = null;
let areaChartInstance = null;
let weeklyChartInstance = null; 
let currentStatsPeriod = 'weekly'; // <-- 이 라인을 추가하세요.
// ▼▼▼ 08/17(수정일) 목표 편집을 위한 전역 변수 추가 ▼▼▼
let isEditingGoal = false;
let editingGoalId = null;
let isEditingRoutine = false; // ★★★ 이 라인 추가
let editingRoutineId = null; // ★★★ 이 라인 추가
// ▲▲▲ 여기까지 08/17(수정일) 목표 편집을 위한 전역 변수 추가 ▲▲▲
// ▼▼▼ 08/20(수정일) '현재 페이지' 상태 변수 추가 ▼▼▼
let activePage = 'home'; // 앱 시작 시 기본 페이지는 '홈'
// ▲▲▲ 여기까지 08/20(수정일) '현재 페이지' 상태 변수 추가 ▲▲▲
// ▼▼▼ 2025-08-22 작전 모드 기록 변수 추가 ▼▼▼
let currentRoutineMode = null; // 'parent' 또는 'child' 모드를 저장
let isInitialized = false; // 선임 지휘관 임명 여부 플래그

// ▲▲▲ 여기까지 2025-08-22 작전 모드 기록 변수 추가 ▲▲▲
const DEBUG_MODE = true;
const MAX_AREAS = 5; // <-- 영역의 최대 갯수 저장

const today = new Date();
const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;



// ====================================================================
// 3. 앱 시작점 (Application Entry Point)
// ====================================================================
// ▼▼▼ 08/19(수정일) 초기화 로직 안정화 ▼▼▼
// ▼▼▼ 2025-08-25(최종 작전) 인증 지휘 체계 전면 재구축 (script.js) ▼▼▼
// ▼▼▼ 2025-08-25(작전일) 중복 실행 방지 가드 배치 (script.js) ▼▼▼


document.addEventListener('DOMContentLoaded', () => {
    console.log('🛰️ [Satellite] DOMContentLoaded: HTML 문서 로딩 완료.');
    console.log('📱 [Debug] 디바이스 정보:', {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        isStandalone: window.navigator.standalone,
        viewport: `${window.innerWidth}x${window.innerHeight}`
    });
    if (isInitialized) {
        console.warn('⚠️ 중복 초기화 시도 감지. 작전을 중단합니다.');
        return;
    }
    isInitialized = true; // 선임 지휘관 임명!
    console.log('🛰️ [Satellite] DOMContentLoaded: 작전 개시.');
// ▲▲▲ 여기까지 2025-08-25(작전일) 중복 실행 방지 가드 배치 (script.js) ▲▲▲


    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    // --- 임무 1: 통신 채널 보안 설정 및 완료 대기 ---
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            console.log('🔒 Firebase Auth persistence set to LOCAL. 부모 인증 작전 개시.');

            // --- 임무 2: '저장소 설정 완료' 보고 후, 정규 지휘관(onAuthStateChanged) 투입 ---
            firebase.auth().onAuthStateChanged(async (user) => {
                console.log('🔍 [onAuthStateChanged] 인증 상태 변경 감지:', user ? '로그인' : '로그아웃');
                
                if (user) {
                    try {
                        // 사용자 데이터 로딩 완료까지 대기
                        const fullUserData = await loadAllDataForUser(user);
                        
                        currentUser = {
                            uid: user.uid,
                            displayName: user.displayName,
                            email: user.email,
                            photoURL: user.photoURL,
                            ...fullUserData
                        };
                        
                        console.log("✅ 최종 지휘관 정보(currentUser) 임명 완료:", currentUser);
                        
                        // 자녀 페이지 리다이렉트 체크
                        if (currentUser.role === 'child') {
                            if (!window.location.pathname.endsWith('child.html')) {
                                window.location.href = 'child.html';
                            }
                            return;
                        }
                        
                        // UI 업데이트는 데이터 로딩 완료 후에만 실행
                        updateUserInfoUI(currentUser);
                        
                        const bottomTabBar = document.querySelector('.bottom-tab-bar');
                        if (bottomTabBar) {
                            bottomTabBar.style.display = 'flex';
                        }
                        
                        // 페이지 렌더링도 지연 실행
                        setTimeout(() => {
                            renderCurrentPage();
                        }, 100);
                        
                    } catch (error) {
                        console.error('❌ [onAuthStateChanged] 사용자 데이터 로딩 실패:', error);
                        // 실패 시 로그아웃 처리
                        firebase.auth().signOut();
                    }
                } else {
                    currentUser = null;
                    updateUserInfoUI(null);
                    
                    const bottomTabBar = document.querySelector('.bottom-tab-bar');
                    if (bottomTabBar) {
                        bottomTabBar.style.display = 'none';
                    }
                }
            });
            
            // --- 임무 3: 리다이렉트 특수부대(getRedirectResult) 투입 ---
            firebase.auth().getRedirectResult()
            .then((result) => {
                if (result.user) {
                    console.log('📌 [getRedirectResult] 리다이렉트 로그인 성공:', result.user.displayName);
                } else {
                    console.log('📌 [getRedirectResult] 리다이렉트 결과 없음 (일반 페이지 로드)');
                }
            })
            .catch((error) => {
                console.error('❌ [getRedirectResult] 리다이렉트 처리 중 오류:', error);
                showNotification('로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
            });
                })
        .catch((error) => {
            console.error('💣 [CRITICAL] Firebase Auth persistence 설정 실패! 앱 작동 불가:', error);
            alert("앱 인증 시스템을 시작하는 데 실패했습니다. 네트워크 연결을 확인하거나 브라우저를 재시작해주세요.");
        });

    // --- 임무 4: 로그인 버튼 등 기타 UI 이벤트 리스너 설정 ---
// ▼▼▼ 2025-08-25(작전일) 로그인 방식 단일화 (script.js) ▼▼▼
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        console.log('🖱️ [Login Button Click] 모든 환경에서 Redirect 방식으로 로그인을 시도합니다.');
        // 분기 로직을 제거하고 signInWithRedirect로 통일
        firebase.auth().signInWithRedirect(provider).catch(error => {
            console.error("❌ 로그인 리다이렉트 실패:", error);
            showNotification('로그인에 실패했습니다. 다시 시도해주세요.', 'error');
        });
    });
}
// ▲▲▲ 여기까지 2025-08-25(작전일) 로그인 방식 단일화 (script.js) ▲▲▲    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => firebase.auth().signOut());
    }

    setupAllEventListeners();
});
// ▲▲▲ 여기까지 2025-08-25(최종 작전) 인증 지휘 체계 전면 재구축 (script.js) ▲▲▲
// // ▼▼▼ 2025-08-25(수정일) 부모 페이지 모바일 리다이렉트 로그인 안정성 강화 ▼▼▼
// ▼▼▼ 2025-08-25(작전일) 지휘 체계 단일화 (script.js) ▼▼▼


// ▲▲▲ 여기까지 2025-08-25(작전일) 지휘 체계 단일화 (script.js) ▲▲▲
// // ▲▲▲ 여기까지 2025-08-25(수정일) 부모 페이지 모바일 리다이렉트 로그인 안정성 강화 ▲▲▲


  // --- 임무 3: Firebase 인증 상태 감지 및 관문 운용 ---
// ▼▼▼ 2025-08-21 로그인 시 마이그레이션 절차 추가 ▼▼▼
// ▼▼▼ 2025-08-25(수정일) Optional Chaining 문법 호환성 문제 해결 ▼▼▼
// 기존 onAuthStateChanged 함수를 이 코드로 완전히 교체합니다.호환성 문제 해결 ▲▲▲

// ▲▲▲ 여기까지 2025-08-25(작전일) 잔존 병력 소탕 (script.js) ▲▲▲

// ▲▲▲ 여기까지 08/19(수정일) 3번 소대(DOMContentLoaded) 최종 임무 수첩 ▲▲▲

// ====================================================================
// 4. 사용자 데이터 로직 (User Data Logic)
// ====================================================================

// ▼▼▼ 08/21(수정일) loadAllDataForUser가 사용자 정보를 '반환'하도록 수정 ▼▼▼
// ▼▼▼ 2025-08-23 '가족 공유' 모델에 맞춰 데이터 로딩 방식 변경 ▼▼▼
async function loadAllDataForUser(user) {
    try {
        const userId = user.uid;
        console.log(`📌 [loadAllDataForUser]: 사용자(${userId}) 데이터 보급 시작...`);
        const userDocRef = db.collection('users').doc(userId);
        const userDoc = await userDocRef.get();

        let userData = {};
        if (!userDoc.exists) {
            // 신규 사용자의 경우, 기본 데이터 생성 후 다시 로드
            await uploadInitialDataForUser(user);
            const newUserDoc = await userDocRef.get();
            if (newUserDoc.exists) userData = newUserDoc.data();
        } else {
            userData = userDoc.data();
        }

        // ★★★ 핵심 변경: familyId를 기반으로 공유 routines 컬렉션을 쿼리합니다. ★★★
        if (userData.familyId) {
            const routinesSnapshot = await db.collection('families').doc(userData.familyId).collection('routines').get();
            sampleRoutines = routinesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`✅ [loadAllDataForUser]: 가족 공유 루틴 ${sampleRoutines.length}개 보급 완료.`);
        } else {
            sampleRoutines = []; // 가족이 없으면 루틴은 비어있습니다.
            console.log(`⚠️ [loadAllDataForUser]: 소속된 가족이 없어 루틴을 로드하지 않습니다.`);
        }

        // 기존의 areas, stats 로딩 로직은 user 하위에 그대로 유지 (변경 없음)
        const [areasSnapshot, statsDoc] = await Promise.all([
            userDocRef.collection('areas').get(),
            userDocRef.collection('stats').doc('userStats').get()
        ]);
        userAreas = areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        userStats = statsDoc.exists ? statsDoc.data() : {};
        
        await resetDailyProgressForUser(userId, userData.familyId); // familyId 전달
        
        console.log(`[loadAllDataForUser] >> 보급 완료. 사용자 프로필 반환.`);
        return userData;

    } catch (error) {
        console.error("[loadAllDataForUser] >> 데이터 보급 실패: ", error);
        showNotification("데이터를 불러오는데 실패했습니다.", "error");
        return {};
    }
}
// ▲▲▲ 여기까지 2025-08-23 '가족 공유' 모델에 맞춰 데이터 로딩 방식 변경 ▲▲▲


// ▼▼▼ 2025-08-21 신규 사용자 오류 해결 3/3 ▼▼▼
// ▼▼▼ 2025-08-25(작전일) 신병 훈련소 현대화 작전 ▼▼▼
// 기존 uploadInitialDataForUser 함수를 이 코드로 완전히 교체합니다.
async function uploadInitialDataForUser(user) {
    console.log(`[uploadInitialDataForUser] 신병(${user.displayName})을 위한 개인 인식표(users 문서)를 생성합니다.`);
    const batch = db.batch();
    const userDocRef = db.collection('users').doc(user.uid);
    
    // 임무 1: 신규 사용자의 users 문서만 생성합니다. (email, name 등 기본 정보)
    batch.set(userDocRef, { 
        email: user.email, 
        name: user.displayName, 
        createdAt: new Date(),
        familyId: null, // 가족은 아직 없습니다.
        role: null      // 역할도 아직 없습니다.
    });

    // 임무 2: 기본 영역(Areas)을 설정합니다. (이것은 개인 데이터이므로 유지)
    const DEFAULT_AREAS = [
        { id: 'health', name: '건강' },
        { id: 'relationships', name: '관계' },
        { id: 'work', name: '업무' }
    ];
    DEFAULT_AREAS.forEach(area => {
        const docRef = userDocRef.collection('areas').doc(area.id);
        batch.set(docRef, area);
    });

    // 임무 3: 초기 통계(Stats) 및 메타(Meta) 데이터를 생성합니다.
    const initialStats = {};
    DEFAULT_AREAS.forEach(area => { initialStats[area.id] = 0; });
    batch.set(userDocRef.collection('stats').doc('userStats'), initialStats);
    batch.set(userDocRef.collection('meta').doc('lastReset'), { date: todayDateString });
    
    // 폐기된 임무: 샘플 루틴을 users 하위에 더 이상 생성하지 않습니다.
    // 이 조치를 통해 Firestore 권한 오류가 발생하는 원인을 제거합니다.

    await batch.commit();
    console.log(`[uploadInitialDataForUser] 신병(${user.displayName})의 개인 인식표 생성이 완료되었습니다.`);
}
// ▲▲▲ 여기까지 2025-08-25(작전일) 신병 훈련소 현대화 작전 ▲▲▲


// ▼▼▼ 2025-08-23 [재설계] 일일 초기화 경로 수정 (전체 버전) ▼▼▼
async function resetDailyProgressForUser(userId, familyId) {
    // 1. 메타데이터를 확인하여 오늘 이미 초기화를 진행했는지 확인합니다.
    const userDocRef = db.collection('users').doc(userId);
    const metaRef = userDocRef.collection('meta').doc('lastReset');
    
    const lastResetDoc = await metaRef.get();
    const lastResetDate = lastResetDoc.exists ? lastResetDoc.data().date : null;

    // 2. 마지막 초기화 날짜가 오늘과 다를 경우에만 작전을 개시합니다.
    if (lastResetDate !== todayDateString) {
        debugLog(`사용자(${userId})의 일일 진행 상황 초기화 시작...`);
        
        // 2-1. 소속된 가족이 없으면 초기화할 루틴도 없으므로 작전을 중단합니다.
        if (!familyId) {
            debugLog("가족 ID가 없어 초기화할 루틴이 없습니다.");
            // 마지막 초기화 날짜만 오늘로 기록하여 불필요한 재검사를 방지합니다.
            await metaRef.set({ date: todayDateString });
            return;
        }

        // 3. 여러 문서를 한 번에 업데이트하기 위해 Batch 작전을 준비합니다.
        const batch = db.batch();
        const routinesRef = db.collection('families').doc(familyId).collection('routines');

        // 4. 로컬에 로드된 모든 가족 루틴을 순회하며 초기화 대상을 식별합니다.
        sampleRoutines.forEach(routine => {
            const routineRef = routinesRef.doc(String(routine.id));
            const updatedFields = {};
            
            // 4-1. 어제 목표를 달성하지 못한 루틴은 연속 기록(streak)을 0으로 초기화합니다.
            if (!isGoalAchieved(routine)) {
                updatedFields.streak = 0;
            }
            
            // 4-2. 루틴 타입에 따라 진행 상황(value, status)을 초기화합니다.
            if (routine.type === 'yesno' || routine.type === 'time' || (routine.type === 'number' && !routine.continuous)) {
                updatedFields.value = null;
                updatedFields.status = null;
            } else if (routine.type === 'number' && routine.continuous) {
                updatedFields.value = 0;
                updatedFields.status = null;
                updatedFields.dailyGoalMetToday = false;
            } else if (routine.type === 'reading') {
                updatedFields.dailyReadPagesToday = 0;
                updatedFields.dailyGoalMetToday = false;
                updatedFields.status = null;
            }
            
            // 4-3. 오늘 포인트를 받을 수 있도록 '포인트 지급 여부'를 초기화합니다.
            updatedFields.pointsGivenToday = false;
            
            // 4-4. 변경할 필드가 있는 경우에만 Batch 작전에 추가합니다.
            if (Object.keys(updatedFields).length > 0) {
                batch.update(routineRef, updatedFields);
            }
        });
        
        // 5. 마지막 초기화 날짜를 오늘로 기록하는 명령을 Batch에 추가합니다.
        batch.set(metaRef, { date: todayDateString });
        
        // 6. 준비된 모든 업데이트 명령을 데이터베이스에 일괄 전송합니다.
        try {
            await batch.commit();
            debugLog("일일 진행 상황 초기화 완료.");
        } catch (error) {
            console.error("일일 진행 상황 초기화 실패: ", error);
        }
    } else {
        debugLog("일일 진행 상황 초기화 필요 없음. 이미 최신.");
    }
}
// ▲▲▲ 여기까지 2025-08-23 [재설계] 일일 초기화 경로 수정 (전체 버전) ▲▲▲




// ====================================================================
// 5. Firebase 데이터 처리 함수 (CRUD)
// ====================================================================

// ▼▼▼ [최종 버전 1/3] updateRoutineInFirebase ▼▼▼
async function updateRoutineInFirebase(routineId, updatedFields) {
    if (!currentUser || !currentUser.familyId) return;
    const routineRef = db.collection('families').doc(currentUser.familyId).collection('routines').doc(String(routineId));
    await routineRef.update(updatedFields);

    // 로컬 데이터('sampleRoutines' 배열) 업데이트
    const index = sampleRoutines.findIndex(r => String(r.id) === String(routineId));
    if (index !== -1) {
        sampleRoutines[index] = { ...sampleRoutines[index], ...updatedFields };
    }
}
// ▲▲▲ [최종 버전 1/3] updateRoutineInFirebase ▲▲▲

// ▼▼▼ 2025-08-23 [재설계] 루틴 순서 저장 경로 수정 ▼▼▼
async function updateRoutineOrderInFirebase(orderedRoutines) {
    if (!currentUser || !currentUser.familyId) return;

    const batch = db.batch();
    // ★★★ 핵심: 새로운 'families' 컬렉션 경로를 사용합니다. ★★★
    const routinesRef = db.collection('families').doc(currentUser.familyId).collection('routines');

    orderedRoutines.forEach(routine => {
        // 루틴 ID를 문자열로 변환하여 안정성을 확보합니다.
        const docRef = routinesRef.doc(String(routine.id));
        batch.update(docRef, { order: routine.order });
    });

    try {
        await batch.commit();
        
        // 로컬 데이터(sampleRoutines)에도 변경된 순서를 반영합니다.
        orderedRoutines.forEach(updatedRoutine => {
            const index = sampleRoutines.findIndex(r => r.id === updatedRoutine.id);
            if (index !== -1) {
                sampleRoutines[index].order = updatedRoutine.order;
            }
        });

    } catch (error) {
        console.error("❌ 루틴 순서 업데이트 실패:", error);
        showNotification('순서 저장에 실패했습니다.', 'error');
        // 실패 시에는 페이지를 새로고침하여 데이터 불일치를 방지합니다.
        window.location.reload();
    }
}
// ▲▲▲ 여기까지 2025-08-23 [재설계] 루틴 순서 저장 경로 수정 ▲▲▲

async function updateUserStatsInFirebase(updatedStats) {
    if (!currentUser) return;
    const statsRef = db.collection('users').doc(currentUser.uid).collection('stats').doc('userStats');
    await statsRef.set(updatedStats, { merge: true });
    userStats = updatedStats;
    renderAreaStats();
}

// ▼▼▼ [최종 버전 2/3] addRoutineToFirebase ▼▼▼
async function addRoutineToFirebase(newRoutineData) {
    if (!currentUser || !currentUser.familyId) {
        showNotification("가족이 설정되지 않아 루틴을 추가할 수 없습니다.", "error");
        return;
    }
    const routinesRef = db.collection('families').doc(currentUser.familyId).collection('routines');
    const docRef = await routinesRef.add(newRoutineData);
    
    // 로컬 데이터('sampleRoutines' 배열) 업데이트
    const newRoutine = { ...newRoutineData, id: docRef.id };
    sampleRoutines.push(newRoutine);
}
// ▲▲▲ [최종 버전 2/3] addRoutineToFirebase ▲▲▲

// ▼▼▼ 2025-08-23 [재설계] 루틴 삭제 경로 수정 ▼▼▼
async function deleteRoutineFromFirebase(routineId) {
    if (!currentUser || !currentUser.familyId) return;
    await db.collection('families').doc(currentUser.familyId).collection('routines').doc(routineId).delete();
}
// ▲▲▲ 여기까지 2025-08-23 [재설계] 루틴 삭제 경로 수정 ▲▲▲

async function updateAreasInFirebase(updatedAreas) {
    if (!currentUser) return;
    const batch = db.batch();
    const areasRef = db.collection('users').doc(currentUser.uid).collection('areas');
    const oldAreasSnapshot = await areasRef.get();
    oldAreasSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    updatedAreas.forEach(area => batch.set(areasRef.doc(area.id), area));
    await batch.commit();
    userAreas = updatedAreas;
    renderAreaStats();
}

// ▼▼▼ 2025-08-21 가족 구성원 정보 수집 함수 추가 ▼▼▼
// ▼▼▼ 2025-08-25(수정일) Firestore 권한 문제를 해결하기 위해 가족 문서에서 멤버를 직접 읽어오도록 수정 ▼▼▼
async function getFamilyMembers() {
    if (!currentUser || !currentUser.familyId) {
        console.log('⚠️ [getFamilyMembers]: 가족 정보 없음. "나"만 반환.');
        return [{ id: currentUser.uid, name: `${currentUser.displayName} (나)`, role: 'parent' }];
    }
    
    console.log('📌 [getFamilyMembers]: 가족 문서에서 구성원 정보 수집 시작...');
    try {
        // 1. users 컬렉션 대신, 현재 가족의 문서를 직접 조회합니다.
        const familyDoc = await db.collection('families').doc(currentUser.familyId).get();

        if (!familyDoc.exists) {
            console.error("❌ [getFamilyMembers]: 가족 문서를 찾을 수 없습니다!");
            return [{ id: currentUser.uid, name: `${currentUser.displayName} (나)`, role: 'parent' }];
        }

        const familyData = familyDoc.data();
        const membersMap = familyData.members || {};

        // 2. members 맵(map)을 사용하기 쉬운 배열 형태로 변환합니다.
        const members = Object.keys(membersMap).map(uid => ({
            id: uid,
            name: membersMap[uid].name,
            role: membersMap[uid].role
        }));
        
        // '나'를 목록 맨 위에 표시하고 "(나)"를 추가합니다.
        const me = members.find(m => m.id === currentUser.uid);
        const others = members.filter(m => m.id !== currentUser.uid);
        
        const sortedMembers = [
            { ...me, name: `${me.name} (나)` },
            ...others
        ];

        console.log('✅ [getFamilyMembers]: 수집 완료.', sortedMembers);
        return sortedMembers;

    } catch (error) {
        console.error("❌ [getFamilyMembers]: 가족 구성원 정보 수집 실패", error);
        // 실패 시에도 최소한 '나'의 정보는 반환하여 UI 오류를 방지합니다.
        return [{ id: currentUser.uid, name: `${currentUser.displayName} (나)`, role: 'parent' }];
    }
}
// ▲▲▲ 여기까지 2025-08-25(수정일) Firestore 권한 문제를 해결하기 위해 가족 문서에서 멤버를 직접 읽어오도록 수정 ▲▲▲
// // ▲▲▲ 여기까지 2025-08-21 가족 구성원 정보 수집 함수 추가 ▲▲▲

// ▼▼▼ 2025-08-24 보상 관리 CRUD 함수 블록 ▼▼▼

// 전역 변수 추가
let isEditingReward = false;
let editingRewardId = null;
let userRewards = [];

// [Create/Update] Firebase에 보상 정보 저장/수정
async function saveRewardToFirebase(rewardData) {
    if (!currentUser || !currentUser.familyId) return null;
    const rewardsRef = db.collection('families').doc(currentUser.familyId).collection('rewards');
    
    if (isEditingReward) {
        const rewardRef = rewardsRef.doc(editingRewardId);
        await rewardRef.update(rewardData);
        return { id: editingRewardId, ...rewardData };
    } else {
        const docRef = await rewardsRef.add({ ...rewardData, createdAt: new Date() });
        return { id: docRef.id, ...rewardData };
    }
}

// [Delete] Firebase에서 보상 정보 삭제
async function deleteRewardFromFirebase(rewardId) {
    if (!currentUser || !currentUser.familyId) return;
    await db.collection('families').doc(currentUser.familyId).collection('rewards').doc(rewardId).delete();
}

// [Controller] '저장' 버튼 클릭 처리
async function handleRewardConfirm() {
    const name = document.getElementById('rewardName').value.trim();
    const points = parseInt(document.getElementById('rewardPoints').value);
    const description = document.getElementById('rewardDescription').value.trim();

    if (!name || isNaN(points) || points <= 0) {
        showNotification("보상 이름과 1 이상의 포인트를 정확히 입력해주세요.", "error");
        return;
    }

    const rewardData = { name, points, description, isActive: true, stock: -1 };
    
    try {
        const savedReward = await saveRewardToFirebase(rewardData);
        if (isEditingReward) {
            const index = userRewards.findIndex(r => r.id === savedReward.id);
            if (index !== -1) userRewards[index] = savedReward;
            showNotification("보상이 수정되었습니다.", "success");
        } else {
            userRewards.push(savedReward);
            showNotification("새로운 보상이 추가되었습니다.", "success");
        }
        renderRewardManagement(); // ★★★ 핵심: 이 명령을 추가하여 화면을 즉시 새로고침합니다.

        hideRewardModal();
    } catch (error) {
        console.error("❌ 보상 저장 실패:", error);
        showNotification("보상 저장에 실패했습니다.", "error");
    }
}

// [Controller] '삭제' 버튼 클릭 처리
async function handleDeleteReward() {
    if (!isEditingReward || !editingRewardId) return;
    if (!confirm("정말로 이 보상을 삭제하시겠습니까?")) return;

    try {
        await deleteRewardFromFirebase(editingRewardId);
        userRewards = userRewards.filter(r => r.id !== editingRewardId);
        renderRewardManagement();
        hideRewardModal();
        showNotification("보상이 삭제되었습니다.", "info");
    } catch (error) {
        console.error("❌ 보상 삭제 실패:", error);
        showNotification("보상 삭제에 실패했습니다.", "error");
    }
}

// [UI] 보상 모달 표시/숨기기
function showRewardModal(reward = null) {
    const modal = document.getElementById('rewardModal');
    if (reward) {
        isEditingReward = true;
        editingRewardId = reward.id;
        document.getElementById('rewardModalTitle').textContent = "🎁 보상 편집";
        document.getElementById('rewardName').value = reward.name;
        document.getElementById('rewardPoints').value = reward.points;
        document.getElementById('rewardDescription').value = reward.description || '';
        document.getElementById('deleteRewardBtn').style.display = 'block';
    } else {
        isEditingReward = false;
        editingRewardId = null;
        document.getElementById('rewardModalTitle').textContent = "🎁 새 보상 추가";
        document.getElementById('rewardName').value = '';
        document.getElementById('rewardPoints').value = '';
        document.getElementById('rewardDescription').value = '';
        document.getElementById('deleteRewardBtn').style.display = 'none';
    }
    modal.style.display = 'flex';
}

function hideRewardModal() {
    document.getElementById('rewardModal').style.display = 'none';
}

// [Render] 관리 페이지에 보상 목록 렌더링
async function renderRewardManagement() {
    if (!currentUser || !currentUser.familyId) return;
    console.log("📌 [renderRewardManagement]: 보상 관리 목록 렌더링 시작...");
    
    try {
        const rewardsRef = db.collection('families').doc(currentUser.familyId).collection('rewards');
        const snapshot = await rewardsRef.orderBy('createdAt', 'desc').get();
        userRewards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const container = document.getElementById('rewardListContainer');
        container.innerHTML = '';

        if (userRewards.length === 0) {
            container.innerHTML = `<p class="panel-description" style="text-align: center;">아직 등록된 보상이 없습니다.</p>`;
            return;
        }

        userRewards.forEach(reward => {
            const item = document.createElement('div');
            item.className = 'manage-routine-item';
            item.style.cursor = 'pointer';
            item.innerHTML = `
                <div class="routine-main-info" style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
                    <div class="routine-main-name">${reward.name}</div>
                    <div class="routine-main-details" style="font-weight: 600;">✨ ${reward.points} P</div>
                </div>
            `;
            item.onclick = () => showRewardModal(reward);
            container.appendChild(item);
        });
    } catch (error) {
        console.error("❌ 보상 목록 로딩 실패:", error);
        document.getElementById('rewardListContainer').innerHTML = `<p class="panel-description" style="text-align: center; color: var(--error);">보상 목록을 불러오지 못했습니다.</p>`;
    }
}
// ▲▲▲ 여기까지 2025-08-24 보상 관리 CRUD 함수 블록 ▲▲▲



// ▼▼▼ 여기에 새 코드를 추가하세요 (목표 관리 함수) ▼▼▼
async function addGoalToFirebase(goalData) {
    if (!currentUser) return null;
    const goalsRef = db.collection('users').doc(currentUser.uid).collection('goals');
    const docRef = goalsRef.doc();
    const payload = {
        id: docRef.id,
        name: goalData.name,
        targetValue: Number(goalData.targetValue) || 0,
        currentValue: 0,
        unit: goalData.unit || '',
        startDate: goalData.startDate, // 'YYYY-MM-DD'
        endDate: goalData.endDate, // 'YYYY-MM-DD'
        linkedRoutines: Array.isArray(goalData.linkedRoutines) ? goalData.linkedRoutines : [],
        area: goalData.area || null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    await docRef.set(payload);
    return payload;
}

async function getUserGoals(userId) {
    const goalsRef = db.collection('users').doc(userId).collection('goals').orderBy('createdAt', 'desc');
    const snap = await goalsRef.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateGoalInFirebase(goalId, updatedFields) {
    if (!currentUser) return;
    const goalRef = db.collection('users').doc(currentUser.uid).collection('goals').doc(goalId);
    await goalRef.update({ ...updatedFields, updatedAt: new Date() });
}

// ▼▼▼ 08/18(수정일) 목표 완료 처리 함수 추가 ▼▼▼
async function completeGoalInFirebase(goalId) {
    if (!currentUser) return;
    const goalRef = db.collection('users').doc(currentUser.uid).collection('goals').doc(goalId);
    await goalRef.update({ status: 'completed', completedAt: new Date() });
}
// ▲▲▲ 여기까지 08/18(수정일) 목표 완료 처리 함수 추가 ▲▲▲



async function deleteGoalFromFirebase(goalId) {
    if (!currentUser) return;
    const goalRef = db.collection('users').doc(currentUser.uid).collection('goals').doc(goalId);
    await goalRef.delete();
}

// ▼▼▼ 08/18(수정일) updateGoalProgressByRoutine 최종 진화형 ▼▼▼
async function updateGoalProgressByRoutine(routineId, reportData) {
    // reportData 객체는 { delta: number, finalValue: number, points: number } 형태를 가집니다.
    if (!currentUser) return;
    if (!reportData) {
        console.warn('⚠️ [updateGoalProgressByRoutine]: 유효하지 않은 보고 데이터로 인해 작전을 중단합니다.');
        return;
    }

    console.log(`📌 [updateGoalProgressByRoutine]: 루틴(${routineId})으로부터 보고 수신:`, reportData);

    const goalsRef = db.collection('users').doc(currentUser.uid).collection('goals');
    const q = await goalsRef.where('linkedRoutines', 'array-contains', String(routineId)).get();

    if (q.empty) {
        console.log('✅ [updateGoalProgressByRoutine]: 이 루틴과 연결된 목표가 없습니다. 작전을 종료합니다.');
        return;
    }

    const batch = db.batch();
    q.docs.forEach(doc => {
        const goal = doc.data();
        const ref = doc.ref;
        
        // --- 1. 목표 유형 식별 ---
        if (goal.goalType === 'points') {
            // --- 2a. '포인트 목표'일 경우의 작전 수행 ---
            const pointsValue = parseFloat(reportData.points);
            if (!isNaN(pointsValue) && pointsValue > 0) {
                console.log(`- 목표(${goal.name}): '포인트' 방식으로 현재값을 ${pointsValue}만큼 증가시킵니다.`);
                batch.update(ref, {
                    currentValue: firebase.firestore.FieldValue.increment(pointsValue),
                    updatedAt: new Date()
                });
            } else {
                console.warn(`⚠️ [updateGoalProgressByRoutine]: '포인트' 방식에 유효하지 않은 points(${reportData.points})가 전달되었습니다.`);
            }

        } else { // 'units' 목표일 경우
            // --- 2b. '단위 목표'일 경우의 작전 수행 ---
            if (goal.updateMethod === 'replace') {
                const finalValue = parseFloat(reportData.finalValue);
                if (!isNaN(finalValue)) {
                    console.log(`- 목표(${goal.name}): '대체' 방식으로 현재값을 ${finalValue}(으)로 업데이트합니다.`);
                    batch.update(ref, { currentValue: finalValue, updatedAt: new Date() });
                }
            } else { // 'accumulate'
                const deltaValue = parseFloat(reportData.delta);
                if (!isNaN(deltaValue) && deltaValue !== 0) { // delta는 음수가 될 수도 있으므로 0이 아닌지만 체크
                    console.log(`- 목표(${goal.name}): '누적' 방식으로 현재값을 ${deltaValue}만큼 증가시킵니다.`);
                    batch.update(ref, {
                        currentValue: firebase.firestore.FieldValue.increment(deltaValue),
                        updatedAt: new Date()
                    });
                }
            }
        }
    });
    
    await batch.commit();
    console.log('🏁 [updateGoalProgressByRoutine]: 모든 연결된 목표의 진척도 업데이트 완료.');
}
// ▲▲▲ 여기까지 08/18(수정일) updateGoalProgressByRoutine 최종 진화형 ▲▲▲
// feat(stats): Implement stats calculation function using collection group query

// ▼▼▼ 2025-08-24(수정일) history 문서에 familyId 필드 추가 ▼▼▼
// ▼▼▼ 2025-08-24(수정일) '일일 요약'을 기록하는 집계 로직 추가 ▼▼▼
async function logRoutineHistory(routineId, dataToLog) {
    if (!currentUser || !currentUser.familyId) return;

    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const familyRef = db.collection('families').doc(currentUser.familyId);

    // --- 임무 1: 개별 활동 기록 (기존과 동일) ---
    const historyRef = familyRef.collection('routines').doc(String(routineId))
                                .collection('history').doc(dateString);
    
    // --- 임무 2: 일일 요약 보고서 업데이트 (신규 임무) ---
    const summaryRef = familyRef.collection('daily_summaries').doc(dateString);
    const routine = sampleRoutines.find(r => r.id === routineId);
    const points = dataToLog.pointsEarned || 0;

    // Batch 작전을 준비하여 두 개의 쓰기 작업을 원자적으로 처리합니다.
    const batch = db.batch();

    // 개별 기록 쓰기
    batch.set(historyRef, {
        routineId: routineId,
        date: dateString,
        familyId: currentUser.familyId,
        ...dataToLog,
        loggedBy: currentUser.uid
    }, { merge: true });

    // 일일 요약 업데이트 (증가분만 기록)
    if (points > 0) {
        const summaryUpdatePayload = {
            date: dateString,
            totalCompletions: firebase.firestore.FieldValue.increment(1),
            totalPoints: firebase.firestore.FieldValue.increment(points),
            areaPoints: {},
            areaCompletions: {}
        };
        // 루틴에 연결된 모든 영역에 대해 증가분을 기록
        if (routine && routine.areas) {
            routine.areas.forEach(areaId => {
                summaryUpdatePayload.areaPoints[`${areaId}`] = firebase.firestore.FieldValue.increment(points);
                summaryUpdatePayload.areaCompletions[`${areaId}`] = firebase.firestore.FieldValue.increment(1);
            });
        }
        batch.set(summaryRef, summaryUpdatePayload, { merge: true });
    }

    // 준비된 모든 작전을 일괄 실행
    try {
        await batch.commit();
        debugLog(`History and daily summary logged for routine ${routineId} on ${dateString}`);
    } catch (error) {
        console.error("Failed to log history and summary:", error);
    }
}
// ▲▲▲ 여기까지 2025-08-24(수정일) '일일 요약'을 기록하는 집계 로직 추가 ▲▲▲
//  ▲▲▲ 여기까지 2025-08-24(수정일) history 문서에 familyId 필드 추가 ▲▲▲
// feat(stats): Implement stats calculation function using collection group query


// 5번 구역: Firebase 데이터 처리 함수 (CRUD)에 추가하는 것을 권장합니다.
// ▼▼▼ 08/19(수정일) '가족 생성' 함수 추가 ▼▼▼
// ▼▼▼ 2025-08-25(수정일) createFamily 함수에 구성원 정보 저장 로직 추가 ▼▼▼
async function createFamily() {
    if (!currentUser) return;
    if (!confirm('새로운 가족을 생성하시겠습니까? 당신이 첫 번째 "부모"가 됩니다.')) return;

    console.log('📌 [createFamily]: 가족 생성 절차 시작...');
    const userDocRef = db.collection('users').doc(currentUser.uid);
    const familiesRef = db.collection('families');

    try {
        // 1. 새로운 가족 문서를 생성할 때 members 필드에 현재 사용자 정보를 추가합니다.
        const newFamilyDoc = await familiesRef.add({
            familyName: `${currentUser.displayName}의 가족`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            // ★★★ 핵심 변경: 기존 members 배열 대신, 상세 정보가 담긴 객체 맵(map)을 저장합니다.
            members: {
                [currentUser.uid]: {
                    name: currentUser.displayName,
                    role: 'parent',
                    photoURL: currentUser.photoURL
                }
            }
        });
        console.log(`✅ [createFamily]: 새로운 가족 생성 완료. ID: ${newFamilyDoc.id}`);

        // 2. 현재 사용자의 문서를 '부모' 역할로 업데이트합니다.
        await userDocRef.update({
            familyId: newFamilyDoc.id,
            role: 'parent'
        });
        console.log(`✅ [createFamily]: 사용자 역할을 'parent'로 업데이트 완료.`);
        
        showNotification('🎉 새로운 가족이 생성되었습니다!', 'success');
        
        currentUser.familyId = newFamilyDoc.id;
        currentUser.role = 'parent';
        
        await loadAllDataForUser({ uid: currentUser.uid, ...currentUser }); // ★★★ 수정: user 객체 전체 전달
        showManagePage();

    } catch (error) {
        console.error("❌ [createFamily]: 가족 생성 실패", error);
        showNotification('가족 생성에 실패했습니다.', 'error');
    }
}
// ▲▲▲ 여기까지 2025-08-25(수정일) createFamily 함수에 구성원 정보 저장 로직 추가 ▲▲▲
// // ▲▲▲ 여기까지 08/19(수정일) '가족 생성' 함수 추가 ▲▲▲


// ====================================================================
// 6. 핸들러, 렌더링, 유틸리티 등 나머지 모든 함수
// ====================================================================

// ▼▼▼ 08/20(수정일) 실종된 updateUserInfoUI 함수 복귀 ▼▼▼
// ▼▼▼ 2025-08-25 중복 선언된 updateUserInfoUI 함수 단일화 ▼▼▼
function updateUserInfoUI(user) {
    const userInfoDiv = document.getElementById('user-info');
    const userNameSpan = document.getElementById('user-name');
    const userPhotoImg = document.getElementById('user-photo');
    const loginBtn = document.getElementById('login-btn');
    
    console.log('🖼️ [updateUserInfoUI] UI 업데이트 시작. 사용자:', user ? user.displayName : 'null');
    
    if (user) {
        // 사용자가 로그인한 경우
        if (userInfoDiv) {
            userInfoDiv.style.display = 'flex';
            console.log('✅ 사용자 정보 영역 표시');
        }
        if (loginBtn) {
            loginBtn.style.display = 'none';
            console.log('✅ 로그인 버튼 숨김');
        }
        if (userNameSpan) {
            userNameSpan.textContent = user.displayName || '사용자';
        }
        if (userPhotoImg && user.photoURL) {
            userPhotoImg.src = user.photoURL;
        }
    } else {
        // 사용자가 로그아웃한 경우
        if (userInfoDiv) {
            userInfoDiv.style.display = 'none';
            console.log('✅ 사용자 정보 영역 숨김');
        }
        if (loginBtn) {
            loginBtn.style.display = 'block';
            console.log('✅ 로그인 버튼 표시');
        }
    }
}
// ▲▲▲ 여기까지 2025-08-25 중복 선언된 updateUserInfoUI 함수 단일화 ▲▲▲
// ▲▲▲ 여기까지 08/20(수정일) 실종된 updateUserInfoUI 함수 복귀 ▲▲▲

//정상작동


// ▼▼▼ 08/18(수정일) ISO 8601 주차 번호 계산 함수 추가 ▼▼▼
function getISOWeek(date) {
    const tempDate = new Date(date.valueOf());
    const dayNum = (date.getDay() + 6) % 7;
    tempDate.setDate(tempDate.getDate() - dayNum + 3);
    const firstThursday = tempDate.valueOf();
    tempDate.setMonth(0, 1);
    if (tempDate.getDay() !== 4) {
        tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - tempDate) / 604800000);
}
// ▲▲▲ 여기까지 08/18(수정일) ISO 8601 주차 번호 계산 함수 추가 ▲▲▲


// ▼▼▼ 08/18(수정일) calculateStats 최종 완전판 (시차 문제 해결) ▼▼▼
// ▼▼▼ 2025-08-24(수정일) '일일 요약' 데이터를 사용하도록 통계 계산 방식 전면 재설계 ▼▼▼
async function calculateStats(period = 'weekly') {
    if (!currentUser || !currentUser.familyId) return null;
    console.log(`📊 [calculateStats]: '${period}' 통계 계산 시작 (집계 데이터 사용)`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dateFrom;
    // 1. 보고 기간 설정
    if (period === 'monthly') {
        // 최근 7주 (49일)치 데이터를 요청하여 주간 단위로 재집계
        dateFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 48);
    } else { // 'weekly'
        // 최근 7일치 데이터를 요청
        dateFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    }
    dateFrom.setHours(0, 0, 0, 0);

    const dateToString = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    // 2. ★★★ 핵심 최적화: 'daily_summaries' 컬렉션에서 필요한 기간의 데이터만 읽어옵니다. ★★★
    const summariesSnapshot = await db.collection('families').doc(currentUser.familyId)
                                      .collection('daily_summaries')
                                      .where('date', '>=', dateToString(dateFrom))
                                      .where('date', '<=', dateToString(today))
                                      .get();
    
    const summaries = summariesSnapshot.docs.map(doc => doc.data());
    console.log(`- ${summaries.length}개의 일일 요약 보고서 수신 완료.`);

    // 3. 통계 계산 변수 초기화
    let barChartData = [];
    let barChartLabels = [];
    let totalCompletions = 0;
    const areaPoints = { health: 0, relationships: 0, work: 0 };
    const areaCompletions = { health: 0, relationships: 0, work: 0 };
    let totalPoints = 0;

    // 날짜별 요약 데이터를 빠르게 찾기 위한 Map 생성
    const summaryMap = new Map(summaries.map(s => [s.date, s]));

    // 4. 보고 기간에 따른 분기 처리
    if (period === 'monthly') {
        for (let i = 6; i >= 0; i--) {
            const weekEndDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (i * 7) + 6);
            const weekStartDate = new Date(weekEndDate.getFullYear(), weekEndDate.getMonth(), weekEndDate.getDate() - 6);

            let weeklyCompletions = 0;
            // 해당 주간의 일일 데이터를 순회하며 합산
            for (let d = new Date(weekStartDate); d <= weekEndDate; d.setDate(d.getDate() + 1)) {
                const summary = summaryMap.get(dateToString(d));
                if (summary) {
                    weeklyCompletions += (summary.totalCompletions || 0);
                }
            }
            barChartData.push(weeklyCompletions);
            barChartLabels.push(`${getISOWeek(weekStartDate)}주차`);
        }
    } else { // 'weekly'
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        for (let i = 0; i < 7; i++) {
            const date = new Date(dateFrom.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = dateToString(date);
            barChartLabels.push(`${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`);
            
            const summary = summaryMap.get(dateStr);
            barChartData.push(summary ? summary.totalCompletions || 0 : 0);
        }
    }
    
    // 5. 전체 기간 통계 집계
    summaries.forEach(summary => {
        totalCompletions += summary.totalCompletions || 0;
        totalPoints += summary.totalPoints || 0;
        for (const areaId in summary.areaPoints) {
            areaPoints[areaId] = (areaPoints[areaId] || 0) + summary.areaPoints[areaId];
        }
        for (const areaId in summary.areaCompletions) {
            areaCompletions[areaId] = (areaCompletions[areaId] || 0) + summary.areaCompletions[areaId];
        }
    });

    // 달성률 계산 (기존 로직 유지)
    let periodTotalRoutines = 0;
    const totalDays = Math.ceil((today.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    for (let i = 0; i < totalDays; i++) {
        const date = new Date(dateFrom.getTime() + i * 24 * 60 * 60 * 1000);
        const dayOfWeek = date.getDay();
        sampleRoutines.forEach(routine => {
            if (!routine.active) return;
            const isActiveOnThisDay = 
                (routine.frequency === 'daily') ||
                (routine.frequency === 'weekday' && dayOfWeek >= 1 && dayOfWeek <= 5) ||
                (routine.frequency === 'weekend' && (dayOfWeek === 0 || dayOfWeek === 6));
            if (isActiveOnThisDay) periodTotalRoutines++;
        });
    }
    const completionRate = periodTotalRoutines > 0 ? Math.round((totalCompletions / periodTotalRoutines) * 100) : 0;

    // 6. 최종 보고서 작성
    const stats = {
        completionRate,
        totalPoints,
        areaPoints,
        areaCompletions,
        barChartData,
        barChartLabels
    };

    console.log("📊 [calculateStats]: 통계 계산 완료 (집계 데이터 사용):", stats);
    return stats;
}
// ▲▲▲ 여기까지 2025-08-24(수정일) '일일 요약' 데이터를 사용하도록 통계 계산 방식 전면 재설계 ▲▲▲
// // ▲▲▲ 여기까지 08/18(수정일) calculateStats 최종 완전판 (시차 문제 해결) ▲▲▲


// --- 핸들러 함수 (Handlers) ---

async function handleDeleteRoutine(routineId, routineName) {
    if (!currentUser) return showNotification("로그인이 필요합니다.", "error");
    if (!confirm(`정말로 '${routineName}' 루틴을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
        await deleteRoutineFromFirebase(routineId);
        const deletedIndex = sampleRoutines.findIndex(r => String(r.id) === routineId);
        if (deletedIndex > -1) sampleRoutines.splice(deletedIndex, 1);
        
        const sortedRoutines = sampleRoutines.sort((a, b) => a.order - b.order);
        const updatedOrderRoutines = sortedRoutines.map((routine, index) => ({ ...routine, order: index }));
        
        await updateRoutineOrderInFirebase(updatedOrderRoutines);
        renderManagePage();
        showNotification(`'${routineName}' 루틴이 삭제되었습니다.`, 'success');
    } catch (error) {
        showNotification('루틴 삭제에 실패했습니다.', 'error');
    }
}

// ▼▼▼ 08/18(수정일) handleStepperConfirm 최종 완전판 ▼▼▼
//1단계: 보고받은 값을 기준으로 새로운 상태를 계산.
//2단계 (최우선): '순수 증가량'을 계산하여 목표 시스템에 무조건 보고.
//3단계: 일일 목표 첫 달성 여부를 판단하여 포상(포인트, 스트릭) 처리.
//4-5단계: 최종 상태를 데이터베이스에 기록하고, 임무 완료를 알림.

// ▼▼▼ 08/18(수정일) handleStepperConfirm 최종 임무 수첩 ▼▼▼
async function handleStepperConfirm(value) {
    if (!activeRoutineForModal) return;
    const currentRoutine = activeRoutineForModal;

    try {
        const routine = sampleRoutines.find(r => r.id === currentRoutine.id);
        if (routine) {
            const finalValue = value;
            const isNowGoalAchieved = isGoalAchieved({ ...routine, value: finalValue });
            const updatedFields = {
                value: finalValue,
                status: null,
                lastUpdatedDate: todayDateString,
                dailyGoalMetToday: isNowGoalAchieved
            };

            // 1. 종합 보고서 작성
            const incrementValue = finalValue - (routine.value || 0);
            const reportData = {
                points: routine.basePoints || 0,
                delta: incrementValue,
                finalValue: finalValue
            };

            // 2. 전과 보고 (항상 실행)
            if (reportData.delta !== 0) {
                 await updateGoalProgressByRoutine(routine.id, reportData);
            }

            // 3. 일일 포상 (하루 한 번)
            if (isNowGoalAchieved && !routine.pointsGivenToday) {
                updatedFields.streak = (routine.streak || 0) + 1;
                if (routine.areas && routine.basePoints) {
                    const newStats = { ...userStats };
                    routine.areas.forEach(areaId => {
                        newStats[areaId] = (newStats[areaId] || 0) + routine.basePoints;
                    });
                    await updateUserStatsInFirebase(newStats);
                }
                await logRoutineHistory(routine.id, { value: finalValue, pointsEarned: routine.basePoints });
                updatedFields.pointsGivenToday = true;
            }

            await updateRoutineInFirebase(currentRoutine.id, updatedFields);
            hideStepperModal();
            
            const goalStatus = isNowGoalAchieved ? ' 🎯 목표 달성!' : '';
            showNotification(`✅ ${routine.name}: ${finalValue}${routine.unit || ''}${goalStatus} 저장되었습니다!`);
            
            if (updatedFields.pointsGivenToday) {
                showCompletionEffect();
                setTimeout(showCelebrationMessage, 300);
            }
        }
    } catch (error) {
        console.error('❌ [handleStepperConfirm]: 스테퍼 루틴 업데이트 실패:', error);
        showNotification('저장에 실패했습니다.', 'error');
    }
}
// ▲▲▲ 여기까지 08/18(수정일) handleStepperConfirm 최종 임무 수첩 ▲▲▲

// ▼▼▼ 08/18(수정일) handleNumberConfirm 최종 완전판 (포인트 로직 포함) ▼▼▼
async function handleNumberConfirm(value, inputType) {
    if (!activeRoutineForModal) return;
    const currentRoutine = activeRoutineForModal;
    try {
        const routine = sampleRoutines.find(r => r.id === currentRoutine.id);
        if (routine) {
            const finalValue = routine.continuous ? (routine.value || 0) + value : value;
            const isNowGoalAchieved = isGoalAchieved({ ...routine, value: finalValue });
            const updatedFields = {
                value: finalValue,
                status: null,
                lastUpdatedDate: todayDateString,
                dailyGoalMetToday: isNowGoalAchieved
            };

            const incrementValue = routine.continuous ? value : (finalValue - (routine.value || 0));
            if (incrementValue !== 0) {
                const reportData = {
                    points: routine.basePoints || 0,
                    delta: incrementValue,
                    finalValue: finalValue
                };
                await updateGoalProgressByRoutine(routine.id, reportData);
            }

            if (isNowGoalAchieved && !routine.pointsGivenToday) {
                updatedFields.streak = (routine.streak || 0) + 1;

                // --- ▼▼▼ 이전에 누락되었던 '비밀 임무' 시작 ▼▼▼ ---
                if (routine.areas && routine.basePoints) {
                    const newStats = { ...userStats };
                    routine.areas.forEach(areaId => {
                        newStats[areaId] = (newStats[areaId] || 0) + routine.basePoints;
                    });
                    await updateUserStatsInFirebase(newStats);
                }
                // --- ▲▲▲ '비밀 임무' 종료 ▲▲▲ ---

                await logRoutineHistory(routine.id, { value: finalValue, pointsEarned: routine.basePoints });
                updatedFields.pointsGivenToday = true;
            }

            await updateRoutineInFirebase(currentRoutine.id, updatedFields);
            
            if (inputType === 'simple') hideNumberInputModal();
            if (inputType === 'wheel') hideWheelModal();

            const goalStatus = isNowGoalAchieved ? ' 🎯 목표 달성!' : '';
            showNotification(`✅ ${routine.name}: ${finalValue}${routine.unit || ''}${goalStatus} 저장되었습니다!`);
            
            if (updatedFields.pointsGivenToday) {
                showCompletionEffect();
                setTimeout(showCelebrationMessage, 300);
            }
        }
    } catch (error) {
        console.error('❌ [handleNumberConfirm]: 숫자 루틴 업데이트 실패:', error);
        showNotification('저장에 실패했습니다.', 'error');
    }
}
// ▲▲▲ 여기까지 08/18(수정일) handleNumberConfirm 최종 완전판 (포인트 로직 포함) ▲▲▲

async function handleNumberInputConfirm() {
    if (!activeRoutineForModal) return;

    // 모달의 input 요소에서 값을 읽어옵니다.
    const inputElement = document.getElementById('numberInput');
    const value = parseFloat(inputElement.value);

    // 값이 유효한 숫자인지 확인합니다.
    if (isNaN(value)) {
        showNotification('유효한 숫자를 입력해주세요.', 'error');
        return;
    }

    // 기존에 만들어둔 범용 숫자 처리 함수를 호출합니다.
    // 'simple' 타입으로 호출하여 어떤 종류의 입력인지 구분합니다.
    await handleNumberConfirm(value, 'simple');
}

// ==========================================================
// ▼▼▼ 여기에 새로운 handleWheelConfirm 함수를 붙여넣으세요. ▼▼▼
// ==========================================================
async function handleWheelConfirm() {
    if (!activeRoutineForModal) return;

    const wheelContainer = document.getElementById('wheelContainer');
    const wheelElement = wheelContainer.firstChild;

    if (!wheelElement || typeof wheelElement.getValue !== 'function') {
        console.error("Wheel element or getValue function not found.");
        showNotification('값을 가져오는 데 실패했습니다.', 'error');
        return;
    }

    const value = wheelElement.getValue();
    await handleNumberConfirm(value, 'wheel');
}
// ==========================================================
// ▲▲▲ 여기까지 붙여넣으시면 됩니다. ▲▲▲
// ==========================================================


        async function handleTimeInputConfirm() {
            if (!activeRoutineForModal) return;
            
            const value = document.getElementById('timeInput').value;
            if (!value) {
                showNotification('Please select a time.', 'error');
                return;
            }
            
            const currentRoutine = activeRoutineForModal;
            
            try {
                const routine = sampleRoutines.find(r => r.id === currentRoutine.id);
                if (routine) {
                    const updatedFields = {
                        value: value,
                        status: null,
                        lastUpdatedDate: todayDateString
                    };
                    
                    let pointsAwarded = false;
                    if (isGoalAchieved({ ...routine, value: value }) && !routine.pointsGivenToday) {
                        updatedFields.streak = (routine.streak || 0) + 1;
                        if (routine.areas && routine.basePoints) {
                            const newStats = { ...userStats };
                            routine.areas.forEach(areaId => {
                                newStats[areaId] = (newStats[areaId] || 0) + routine.basePoints;
                            });
                            await updateUserStatsInFirebase(newStats);
                        }
                        // ▼▼▼ 이 코드를 추가하세요 ▼▼▼
                        await logRoutineHistory(routine.id, { value: value, pointsEarned: routine.basePoints });
                        // ▲▲▲ 여기까지 ▲▲▲
                        
                        updatedFields.pointsGivenToday = true;
                        pointsAwarded = true;
                    }
    
                    await updateRoutineInFirebase(currentRoutine.id, updatedFields);
    
                    hideTimeInputModal();
                    showNotification(`✅ ${currentRoutine.name}: ${value} 저장되었습니다!`);
                    
                    if(pointsAwarded){
                        showCompletionEffect();
                        setTimeout(showCelebrationMessage, 300);
                    }
                }
            } catch (error) {
                console.error('Failed to update time routine:', error);
                showNotification('저장에 실패했습니다.', 'error');
            }
        }

   async function handleReadingSetupConfirm() {
            if (!activeRoutineForModal) return;
    
            const bookTitle = document.getElementById('bookTitle').value.trim();
            const startPage = parseInt(document.getElementById('startPage').value);
            const endPage = parseInt(document.getElementById('endPage').value);
            const dailyPages = parseInt(document.getElementById('dailyPages').value);
            
            if (!bookTitle || !startPage || !endPage || !dailyPages || startPage >= endPage) {
                showNotification('모든 항목을 정확히 입력해주세요.', 'error');
                return;
            }
    
            const routine = sampleRoutines.find(r => r.id === activeRoutineForModal.id);
            if (routine) {
                const updatedFields = {
                    bookTitle: bookTitle,
                    name: bookTitle,
                    startPage: startPage,
                    endPage: endPage,
                    dailyPages: dailyPages,
                    currentPage: Math.max(startPage - 1, Math.min(routine.currentPage, endPage)),
                    lastUpdatedDate: todayDateString
                };
                await updateRoutineInFirebase(routine.id, updatedFields);
            }
            
            hideReadingSetupModal();
            showNotification(`📚 "${bookTitle}" 독서 루틴 설정이 수정되었습니다!`);
        }
    
        // ▼▼▼ 08/17(수정일) handleReadingProgressConfirm 장교 완전 복원 ▼▼▼
// ▼▼▼ 08/18(수정일) handleReadingProgressConfirm 최종 완전판 ▼▼▼
// ▼▼▼ 08/18(수정일) handleReadingProgressConfirm 최종 완전판 (포인트 로직 포함) ▼▼▼
async function handleReadingProgressConfirm() {
    if (!activeRoutineForModal) return;
    const readPages = parseInt(document.getElementById('readPages').value);
    if (isNaN(readPages) || readPages <= 0) {
        showNotification('읽은 페이지 수를 입력해주세요.', 'error');
        return;
    }
    const currentRoutine = activeRoutineForModal;
    try {
        const routine = sampleRoutines.find(r => r.id === currentRoutine.id);
        if (routine) {
            const newCurrentPage = Math.min((routine.currentPage || routine.startPage - 1) + readPages, routine.endPage);
            const newDailyReadPagesToday = (routine.dailyReadPagesToday || 0) + readPages;
            const newDailyGoalMetToday = newDailyReadPagesToday >= routine.dailyPages;
            const updatedFields = {
                currentPage: newCurrentPage,
                value: newCurrentPage,
                status: null,
                dailyReadPagesToday: newDailyReadPagesToday,
                dailyGoalMetToday: newDailyGoalMetToday,
                lastUpdatedDate: todayDateString
            };

            if (readPages > 0) {
                const reportData = {
                    points: routine.basePoints || 0,
                    delta: readPages,
                    finalValue: newCurrentPage
                };
                await updateGoalProgressByRoutine(routine.id, reportData);
            }
            
            if (newDailyGoalMetToday && !routine.pointsGivenToday) {
                updatedFields.streak = (routine.streak || 0) + 1;

                // --- ▼▼▼ '비밀 임무': 포인트 지급 로직 ▼▼▼ ---
                if (routine.areas && routine.basePoints) {
                    const newStats = { ...userStats };
                    routine.areas.forEach(areaId => {
                        newStats[areaId] = (newStats[areaId] || 0) + routine.basePoints;
                    });
                    await updateUserStatsInFirebase(newStats);
                }
                // --- ▲▲▲ '비밀 임무' 종료 ▲▲▲ ---

                await logRoutineHistory(routine.id, { value: readPages, pointsEarned: routine.basePoints });
                updatedFields.pointsGivenToday = true;
            }
            
            await updateRoutineInFirebase(currentRoutine.id, updatedFields);
            hideReadingProgressModal();
            
            if (newCurrentPage >= routine.endPage) {
                showNotification(`🎉 "${routine.bookTitle}" 완독을 축하합니다! 🎊`);
                showCompletionEffect();
            } else {
                const progress = getReadingProgress({ ...routine, ...updatedFields });
                showNotification(`📖 ${readPages}페이지 읽기 완료! (${progress}%)`);
            }

            if (updatedFields.pointsGivenToday) {
                setTimeout(showCelebrationMessage, 300);
            }
        }
    } catch (error) {
        console.error('❌ [handleReadingProgressConfirm]: 독서 루틴 업데이트 실패:', error);
        showNotification('저장에 실패했습니다.', 'error');
    }
}
// ▲▲▲ 여기까지 08/18(수정일) handleReadingProgressConfirm 최종 완전판 (포인트 로직 포함) ▲▲▲


        // ▼▼▼ 2025-08-22 handleAddRoutineConfirm 함수가 작전 모드를 직접 참조하도록 수정 ▼▼▼
// ▼▼▼ 2025-08-24 [완벽본] handleAddRoutineConfirm 함수 ▼▼▼
async function handleAddRoutineConfirm() {
    // --- 생산자: 기록된 작전 모드 확인 ---
    console.log(`|-- [handleAddRoutineConfirm] 3. 저장 명령 수신. 기록된 작전 모드: '${currentRoutineMode}'`);
    const assigneeSelect = document.getElementById('routineAssignee');
    let assigneeId;

    // --- 리뷰어 검토: 작전 모드에 따라 담당자 ID를 100% 정확하게 결정하는지 확인 ---
    if (currentRoutineMode === 'parent') {
        assigneeId = currentUser.uid;
    } else { // 'child' 또는 'edit' 모드
        assigneeId = assigneeSelect.value;
    }
    
    // --- 생산자 검토: 담당자 ID가 결정되지 않으면 작전 즉시 중단 ---
    if (!assigneeId) {
        showNotification("담당자를 지정할 수 없습니다. 자녀가 없거나 선택되지 않았습니다.", "error");
        console.error("❌ [handleAddRoutineConfirm]: 담당자 ID 결정 실패.");
        return;
    }
    console.log(`|-- [handleAddRoutineConfirm] 4. 최종 담당자 ID 결정: ${assigneeId}`);

    // --- 생산자: 폼에서 모든 데이터 수집 ---
    const name = document.getElementById('newRoutineName').value.trim();
    const points = parseInt(document.getElementById('newRoutinePoints').value);
    const selectedAreas = Array.from(document.querySelectorAll(`#addRoutineModal .area-checkbox:checked`)).map(cb => cb.value);
    const type = document.getElementById('newRoutineType').value;

    // --- 리뷰어 검토: 필수 입력값 유효성 검사 ---
    if (!name || isNaN(points) || points <= 0 || selectedAreas.length === 0) {
        showNotification('루틴 이름, 1 이상의 포인트, 1개 이상의 영역을 선택해주세요.', 'error');
        return;
    }

    // --- 생산자: 공통 데이터 객체 생성 ---
    const commonFields = {
        name: name,
        time: document.getElementById('newRoutineTime').value,
        type: type,
        frequency: document.getElementById('newRoutineFreq').value,
        areas: selectedAreas,
        basePoints: points,
        lastUpdatedDate: todayDateString,
        assignedTo: assigneeId,
    };

    // --- 생산자: 루틴 타입별 상세 데이터 수집 ---
    let typeSpecificFields = {};
    if (type === 'number') {
        typeSpecificFields = {
            unit: document.getElementById('newNumberUnit').value.trim() || null,
            min: parseInt(document.getElementById('newNumberMin').value) || 1,
            max: parseInt(document.getElementById('newNumberMax').value) || 100,
            step: parseInt(document.getElementById('newNumberStep').value) || 1,
            dailyGoal: parseInt(document.getElementById('newNumberGoal').value) || null,
            continuous: document.getElementById('newNumberContinuous').checked,
            inputType: document.getElementById('newNumberInputType').value,
        };
        // '추가' 모드이고 '지속 업데이트' 타입일 경우, 시작값을 0으로 설정
        if (typeSpecificFields.continuous && !isEditingRoutine) {
            typeSpecificFields.value = 0;
        }
    } else if (type === 'reading') {
        const bookTitle = document.getElementById('newBookTitle').value.trim();
        const startPage = parseInt(document.getElementById('newStartPage').value);
        const endPage = parseInt(document.getElementById('newEndPage').value);
        if (!bookTitle || startPage >= endPage) {
            showNotification('독서 정보를 정확히 입력해주세요.', 'error');
            return;
        }
        typeSpecificFields = {
            bookTitle: bookTitle,
            name: bookTitle, // 루틴 이름도 책 제목으로 설정
            startPage: startPage,
            endPage: endPage,
            dailyPages: parseInt(document.getElementById('newDailyPages').value) || 10,
            currentPage: startPage - 1,
            unit: '페이지',
        };
    }

    try {
        if (isEditingRoutine) {
            // 1. '수정' 임무 시, 데이터 장교에게 명령
            const routine = sampleRoutines.find(r => r.id === editingRoutineId);
            const updatedFields = { ...routine, ...commonFields, ...typeSpecificFields };
            await updateRoutineInFirebase(editingRoutineId, updatedFields);
            showNotification(`✏️ "${name}" 루틴이 수정되었습니다!`);
        } else {
            // 1. '추가' 임무 시, 데이터 장교에게 명령
            const newRoutine = {
                ...commonFields, ...typeSpecificFields,
                value: null, status: null, streak: 0, order: sampleRoutines.length, active: true, pointsGivenToday: false,
            };
            await addRoutineToFirebase(newRoutine);
            showNotification(`➕ "${name}" 루틴이 추가되었습니다!`);
        }

        // 2. ★★★ 모든 데이터 작전 완료 후, 화면 갱신을 직접 명령!
        renderManagePage(); 

    } catch(error) {
        console.error("❌ 루틴 저장/수정 실패:", error);
        showNotification("루틴 처리 중 오류가 발생했습니다.", "error");
    }

    // 3. 뒷정리
    hideAddRoutineModal();
    currentRoutineMode = null;
}
// ▲▲▲ [최종 버전 3/3] handleAddRoutineConfirm ▲▲▲



async function handleGoalConfirm() {
    console.log('📌 [handleGoalConfirm]: 목표 저장/수정 처리 시작. 편집 모드:', isEditingGoal);

    try {
        const goalType = document.getElementById('goalTypeSelect').value;
        let goalData = {}; // 최종 보고할 데이터 객체

        // --- 1. 공통 정보 취합 ---
        const commonData = {
            startDate: document.getElementById('goalStartDate').value,
            endDate: document.getElementById('goalEndDate').value,
            area: document.getElementById('goalArea').value,
            linkedRoutines: Array.from(document.querySelectorAll('#linkableRoutines input[type="checkbox"]:checked')).map(cb => cb.value)
        };

        // --- 2. 목표 유형에 따라 개별 정보 취합 ---
        if (goalType === 'points') {
            goalData = {
                ...commonData,
                goalType: 'points',
                name: document.getElementById('goalNamePoints').value.trim(),
                targetValue: parseFloat(document.getElementById('goalTargetValuePoints').value),
                unit: 'P' // 포인트 목표의 단위는 'P'로 고정
            };
            console.log('📝 "포인트 목표" 정보 취합:', goalData);
        } else { // 'units'
            goalData = {
                ...commonData,
                goalType: 'units',
                name: document.getElementById('goalNameUnits').value.trim(),
                targetValue: parseFloat(document.getElementById('goalTargetValueUnits').value),
                unit: document.getElementById('goalUnit').value.trim(),
                direction: document.getElementById('goalDirection').value,
                updateMethod: document.getElementById('goalUpdateMethod').value
            };
            console.log('📝 "단위 목표" 정보 취합:', goalData);
        }

        // --- 3. 유효성 검사 ---
        if (!goalData.name || !goalData.startDate || !goalData.endDate) {
            showNotification('목표 이름과 기간을 정확히 입력해주세요.', 'error');
            return;
        }
        if (isNaN(goalData.targetValue) || goalData.targetValue <= 0) {
            showNotification('목표값은 0보다 큰 숫자여야 합니다.', 'error');
            return;
        }
        if (goalData.goalType === 'units' && !goalData.unit) {
            showNotification('단위 목표는 단위를 반드시 입력해야 합니다.', 'error');
            return;
        }

        // --- 4. 사령부 보고 (추가/수정) ---
        if (isEditingGoal) {
            await updateGoalInFirebase(editingGoalId, goalData);
            showNotification('🧭 목표가 성공적으로 수정되었습니다!');
        } else {
            // 새로 생성 시, 현재값과 시작값을 설정
            const currentValue = parseFloat(document.getElementById('goalCurrentValue').value) || 0;
            goalData.currentValue = currentValue;
            // '감소' 목표일 때만 '시작값'을 기록
            if (goalData.direction === 'decrease') {
                goalData.startValue = currentValue;
            }
            await addGoalToFirebase(goalData);
            showNotification('🧭 새로운 목표가 생성되었습니다!');
        }

        hideAddGoalModal();
        renderGoalCompassPage();

    } catch (error) {
        console.error('❌ [handleGoalConfirm]: 목표 처리 실패', error);
        showNotification('목표 처리에 실패했습니다.', 'error');
    }
}
// ▲▲▲ 여기까지 08/18(수정일) handleGoalConfirm 최종 완전판 (이중 작전 체계) ▲▲▲



        async function handleManageAreasConfirm() {
            const areaInputs = document.querySelectorAll('#manageAreasList input[type="text"]');
            const updatedAreas = Array.from(areaInputs).map(input => ({
                id: input.dataset.areaId,
                name: input.value.trim()
            }));
    
            if (updatedAreas.some(area => !area.name)) {
                showNotification('영역 이름은 비워둘 수 없습니다.', 'error');
                return;
            }
    
            try {
                await updateAreasInFirebase(updatedAreas);
                
                const newUserStats = {};
                updatedAreas.forEach(area => {
                    newUserStats[area.id] = userStats[area.id] || 0;
                });
                await updateUserStatsInFirebase(newUserStats);
                
                hideManageAreasModal();
                showNotification('✅ 영역이 성공적으로 저장되었습니다!');
            } catch (error) {
                console.error('Failed to save areas:', error);
                showNotification('영역 저장에 실패했습니다.', 'error');
            }
        }

// 기존 'saveRoutineOrder' 함수도 수정이 필요합니다.
async function saveRoutineOrder() {
    if (!sortableInstance) return;

    const newOrderIds = sortableInstance.toArray();
    
    // 전체 루틴에서 '내 루틴'만 필터링하여 순서를 업데이트합니다.
    const orderedParentRoutines = newOrderIds.map((id, index) => {
        const routine = sampleRoutines.find(r => String(r.id) === id);
        return { ...routine, order: index };
    });

    try {
        await updateRoutineOrderInFirebase(orderedParentRoutines);
        document.getElementById('saveParentOrderBtn').style.display = 'none';
        showNotification('✅ 내 루틴 순서가 저장되었습니다!');
    } catch (error) {
        showNotification('순서 저장에 실패했습니다.', 'error');
    }
}
// ▲▲▲ 여기까지 2025-08-21 renderManagePage 함수를 탭 기반으로 전면 개편 ▲▲▲



    function editRoutine(routineId) {
          const routine = sampleRoutines.find(r => r.id === routineId);
          if (routine) {
              showEditRoutineModal(routine);
          }
      }





// --- 모달 관련 함수 (Modals) ---

// ▼▼▼ 2025-08-22 showAddRoutineModal 함수 수정 ▼▼▼
function showAddRoutineModal(options = {}) { // ★★★ options 인자 추가
    isEditingRoutine = false;
    editingRoutineId = null;
    showRoutineForm(null, options); // ★★★ options를 showRoutineForm으로 전달
}
// ▲▲▲ 여기까지 2025-08-22 showAddRoutineModal 함수 수정 ▲▲▲
    
function showEditRoutineModal(routine) {
    isEditingRoutine = true;
    editingRoutineId = routine.id;
    showRoutineForm(routine);
}
    
// ▼▼▼ showRoutineForm 함수에 삭제 버튼 처리 로직을 추가하세요 ▼▼▼
// ▼▼▼ 2025-08-22 showRoutineForm 함수 전면 개편 ▼▼▼
// ▼▼▼ 2025-08-22 showRoutineForm 함수에 작전 모드 기록 기능 추가 ▼▼▼
// ▼▼▼ 2025-08-24 [완벽본] showRoutineForm 함수 ▼▼▼
    async function showRoutineForm(routine = null, options = {}) {
        // --- 생산자: 작전 모드 설정 및 필수 요소 확인 ---
        // '수정' 모드('edit'), '부모 루틴 추가'('parent'), '자녀 루틴 추가'('child') 중 하나로 결정하여 전역 변수에 기록
        currentRoutineMode = routine ? 'edit' : (options.mode || 'parent');
        console.log(`|-- [showRoutineForm] 1. 모달 열림. 작전 모드를 '${currentRoutineMode}'(으)로 설정.`);
    
        const modal = document.getElementById('addRoutineModal');
        const assigneeSelect = document.getElementById('routineAssignee');
        const assigneeGroup = assigneeSelect ? assigneeSelect.closest('.form-group') : null;
    
        // --- 리뷰어 검토: 필수 HTML 요소가 없으면 작전 즉시 중단 ---
        if (!modal || !assigneeSelect || !assigneeGroup) {
            console.error("❌ [showRoutineForm]: 'addRoutineModal' 또는 'routineAssignee' 관련 HTML 요소를 찾을 수 없습니다.");
            return; // 필수 요소 없이는 함수를 실행할 수 없으므로 중단
        }
    
        // --- 생산자: 모달 기본 UI 설정 (제목, 버튼 텍스트 등) ---
        modal.querySelector('.modal-header h3').textContent = routine ? '✏️ 루틴 편집' : '➕ 새 루틴 추가';
        document.getElementById('addRoutineConfirm').textContent = routine ? '수정 완료' : '루틴 추가';
        
        const deleteBtn = document.getElementById('deleteRoutineBtn');
        deleteBtn.style.display = routine ? 'block' : 'none';
        if (routine) {
            deleteBtn.onclick = () => {
                hideAddRoutineModal();
                setTimeout(() => {
                    if (confirm(`정말로 '${routine.name}' 루틴을 삭제하시겠습니까?`)) {
                        handleDeleteRoutine(String(routine.id), routine.name);
                    }
                }, 100);
            };
        }
    
        // --- 생산자 & 리뷰어: 작전 모드에 따라 '담당자' 메뉴를 정밀하게 구성 ---
        assigneeSelect.innerHTML = ''; // 드롭다운 메뉴 초기화
        const familyMembers = await getFamilyMembers();
        let membersToShow = [];
    
        switch (currentRoutineMode) {
            case 'parent':
                assigneeGroup.style.display = 'none'; // '내 루틴' 추가 시엔 메뉴 숨김
                break;
            case 'child':
                assigneeGroup.style.display = 'flex'; // '자녀 루틴' 추가 시엔 메뉴 표시
                membersToShow = familyMembers.filter(m => m.role === 'child');
                console.log(`|-- [showRoutineForm] 2. 자녀 목록 필터링 완료. 대상자: ${membersToShow.length}명`);
                break;
            case 'edit':
                assigneeGroup.style.display = 'flex'; // '수정' 시엔 항상 메뉴 표시
                membersToShow = familyMembers;
                break;
        }
        
        // 필터링된 멤버로 드롭다운 옵션 생성
        if (membersToShow.length > 0) {
            assigneeSelect.disabled = false;
            membersToShow.forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = member.name;
                if (routine && routine.assignedTo === member.id) option.selected = true;
                assigneeSelect.appendChild(option);
            });
        } else if (currentRoutineMode === 'child') {
            // 표시할 자녀가 없는 경우
            assigneeSelect.disabled = true;
            assigneeSelect.innerHTML = `<option value="">등록된 자녀가 없습니다</option>`;
        }
    
        // --- 생산자: 나머지 폼 필드 데이터 채우기 또는 초기화 ---
        document.getElementById('newRoutineName').value = routine ? routine.name : '';
        document.getElementById('newRoutineTime').value = routine ? routine.time : 'morning';
        document.getElementById('newRoutineType').value = routine ? routine.type : 'yesno';
        document.getElementById('newRoutineFreq').value = routine ? routine.frequency : 'daily';
        document.getElementById('newRoutinePoints').value = routine ? routine.basePoints : 10;
    
        const type = routine ? routine.type : document.getElementById('newRoutineType').value;
        document.getElementById('newNumberOptions').style.display = type === 'number' ? 'block' : 'none';
        document.getElementById('newReadingOptions').style.display = type === 'reading' ? 'block' : 'none';
    
        if (type === 'number' && routine) {
            document.getElementById('newNumberUnit').value = routine.unit || '';
            document.getElementById('newNumberMin').value = routine.min ?? 1;
            // ... (이하 다른 필드들도 동일하게 채워넣는 로직)
        }
        
        const newRoutineAreasContainer = document.getElementById('newRoutineAreas');
        newRoutineAreasContainer.innerHTML = '';
        userAreas.forEach(area => {
            const isSelected = routine ? routine.areas?.includes(area.id) : false;
            newRoutineAreasContainer.innerHTML += `
                <div class="area-checkbox-item">
                    <input type="checkbox" id="area-${area.id}-${currentRoutineMode}" value="${area.id}" class="area-checkbox" ${isSelected ? 'checked' : ''}>
                    <label for="area-${area.id}-${currentRoutineMode}">${area.name}</label>
                </div>
            `;
        });
    
        modal.style.display = 'flex';
    }
    // ▲▲▲ 여기까지 2025-08-24 [완벽본] showRoutineForm 함수 ▲▲▲



function hideAddRoutineModal() {
            document.getElementById('addRoutineModal').style.display = 'none';
        }
function showNumberInputModal(routine) {
    activeRoutineForModal = routine;
    if (routine.inputType === 'stepper') {
        showStepperModal(routine);
    } else if (routine.inputType === 'wheel') {
        showWheelModal(routine);
    } else {
        showSimpleNumberModal(routine);
    }
}

function showSimpleNumberModal(routine) {
    const modal = document.getElementById('numberInputModal');
    modal.querySelector('#numberModalTitle').textContent = `${routine.name} - 값 입력`;
    const input = modal.querySelector('#numberInput');
    input.value = routine.value || '';
    input.placeholder = `값 입력 (${routine.unit || ''})`;
    modal.style.display = 'flex';
    input.focus();
}

function hideNumberInputModal() {
    document.getElementById('numberInputModal').style.display = 'none';
}

function showTimeInputModal(routine) {
    activeRoutineForModal = routine;
    const modal = document.getElementById('timeInputModal');
    modal.querySelector('#timeModalTitle').textContent = `${routine.name} - 시간 입력`;
    modal.querySelector('#timeInput').value = routine.value || getCurrentTime();
    modal.style.display = 'flex';
}

function hideTimeInputModal() {
    document.getElementById('timeInputModal').style.display = 'none';
}

// ▼▼▼ 08/18(수정일) showStepperModal 최종 완전판 ▼▼▼
function showStepperModal(routine) {
    activeRoutineForModal = routine;
    const modal = document.getElementById('stepperInputModal');
    const title = document.getElementById('stepperModalTitle');
    const valueDisplay = document.getElementById('stepperValue');
    const unitDisplay = document.getElementById('stepperUnit');
    
    let currentValue = routine.value || routine.min || 1;
    const minValue = routine.min || 1;
    const maxValue = routine.max || 100;
    const stepValue = routine.step || 1;
    
    title.textContent = routine.name;
    valueDisplay.textContent = currentValue;
    unitDisplay.textContent = routine.unit || '';
    
    // --- ▼▼▼ 이전에 누락되었던 '숨겨진 임무' 시작 ▼▼▼ ---
    // 모달을 열 때마다 이전 목표 텍스트가 남아있지 않도록 먼저 제거합니다.
    const existingGoal = modal.querySelector('.goal-text');
    if (existingGoal) {
        existingGoal.remove();
    }
    
    // 루틴에 일일 목표(dailyGoal)가 설정되어 있을 경우에만 목표 텍스트를 표시합니다.
    if (routine.dailyGoal) {
        const goalText = document.createElement('div');
        goalText.className = 'goal-text';
        goalText.style.cssText = `text-align: center; font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;`;
        goalText.textContent = `오늘 목표: ${routine.dailyGoal}${routine.unit || ''}`;
        // 스테퍼 컨테이너 바로 다음에 목표 텍스트를 삽입합니다.
        modal.querySelector('.stepper-container').parentNode.insertBefore(goalText, modal.querySelector('.stepper-container').nextSibling);
    }
    // --- ▲▲▲ '숨겨진 임무' 종료 ▲▲▲ ---

    const confirmBtn = document.getElementById('stepperConfirmBtn');
    const minusBtn = document.getElementById('stepperMinus');
    const plusBtn = document.getElementById('stepperPlus');

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    const newMinusBtn = minusBtn.cloneNode(true);
    minusBtn.parentNode.replaceChild(newMinusBtn, minusBtn);
    const newPlusBtn = plusBtn.cloneNode(true);
    plusBtn.parentNode.replaceChild(newPlusBtn, plusBtn);

    function updateStepperButtons() {
        newMinusBtn.disabled = currentValue <= minValue;
        newPlusBtn.disabled = currentValue >= maxValue;
    }

    newMinusBtn.addEventListener('click', () => {
        currentValue = Math.max(minValue, currentValue - stepValue);
        valueDisplay.textContent = currentValue;
        updateStepperButtons();
    });
    
    newPlusBtn.addEventListener('click', () => {
        currentValue = Math.min(maxValue, currentValue + stepValue);
        valueDisplay.textContent = currentValue;
        updateStepperButtons();
    });
    
    newConfirmBtn.addEventListener('click', () => {
        console.log(`📌 [showStepperModal]: 확인 버튼 클릭됨. 최종값: ${currentValue}`);
        handleStepperConfirm(currentValue);
    });
    
    updateStepperButtons();
    modal.style.display = 'flex';
}
// ▲▲▲ 여기까지 08/18(수정일) showStepperModal 최종 완전판 ▲▲▲

function hideStepperModal() {
    document.getElementById('stepperInputModal').style.display = 'none';
}

function showWheelModal(routine) {
    activeRoutineForModal = routine;
    const modal = document.getElementById('wheelInputModal');
    const wheelContainer = document.getElementById('wheelContainer');
    modal.querySelector('#wheelModalTitle').textContent = routine.name;
    
    const minValue = routine.min || 1;
    const maxValue = routine.max || 100;
    const stepValue = routine.step || 1;
    const currentValue = routine.value || minValue;
    
    wheelContainer.innerHTML = '';
    const wheel = createNumberWheel(minValue, maxValue, stepValue, currentValue, routine.unit);
    wheelContainer.appendChild(wheel);
    
    modal.style.display = 'flex';
}

function hideWheelModal() {
    document.getElementById('wheelInputModal').style.display = 'none';
}

function createNumberWheel(min, max, step, initialValue, unit) {
    const container = document.createElement('div');
    container.className = 'number-wheel-container';
    
    const wheel = document.createElement('div');
    wheel.className = 'number-wheel';
    
    const scroll = document.createElement('div');
    scroll.className = 'number-wheel-scroll';
    
    const options = [];
    for (let i = min; i <= max; i += step) {
        options.push(i);
    }
    
    let currentIndex = options.findIndex(val => val >= initialValue);
    if (currentIndex === -1) currentIndex = 0;
    
    options.forEach((value, index) => {
        const option = document.createElement('div');
        option.className = 'number-option';
        option.textContent = `${value} ${unit || ''}`;
        option.dataset.value = value;
        if (index === currentIndex) option.classList.add('active');
        option.addEventListener('click', () => {
            setActiveOption(index);
            scroll.scrollTop = index * 40;
        });
        scroll.appendChild(option);
    });
    
    function setActiveOption(index) {
        scroll.querySelectorAll('.number-option').forEach((opt, i) => {
            opt.classList.toggle('active', i === index);
        });
        currentIndex = index;
    }
    
    let scrollTimeout;
    scroll.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const newIndex = Math.round(scroll.scrollTop / 40);
            const clampedIndex = Math.max(0, Math.min(newIndex, options.length - 1));
            setActiveOption(clampedIndex);
            scroll.scrollTop = clampedIndex * 40;
        }, 100);
    });
    
    container.getValue = () => options[currentIndex];
    
    wheel.appendChild(scroll);
    wheel.insertAdjacentHTML('beforeend', '<div class="wheel-indicator"></div>');
    container.appendChild(wheel);
    
    setTimeout(() => { scroll.scrollTop = currentIndex * 40; }, 50);
    
    return container;
}

 function showReadingSetupModal(routine = null) {
        const modal = document.getElementById('readingSetupModal');
        const title = document.getElementById('readingSetupTitle');
        const bookTitleInput = document.getElementById('bookTitle');
        const startPageInput = document.getElementById('startPage');
        const endPageInput = document.getElementById('endPage');
        const dailyPagesInput = document.getElementById('dailyPages');
        
        if (!modal) return;
        
        if (routine) {
            activeRoutineForModal = routine;
            title.textContent = '📚 독서 루틴 수정';
            bookTitleInput.value = routine.bookTitle || '';
            startPageInput.value = routine.startPage || 1;
            endPageInput.value = routine.endPage || '';
            dailyPagesInput.value = routine.dailyPages || 10;
        } else {
            console.warn('New reading routine creation should use showAddRoutineModal().');
            return;
        }
 }

function hideReadingSetupModal() {
    document.getElementById('readingSetupModal').style.display = 'none';
}

// ▼▼▼ 08/17(수정일) 독서 진행 모달 표시 함수 수정 ▼▼▼
function showReadingProgressModal(routine) {
    activeRoutineForModal = routine;
    
    const modal = document.getElementById('readingProgressModal');
    const title = document.getElementById('readingProgressTitle');
    const readPagesInput = document.getElementById('readPages');
    const recommendedPages = document.getElementById('recommendedPages');
    const readingInfo = document.getElementById('readingInfo');
    const readingProgressInfo = document.getElementById('readingProgressInfo');
    
    if (!modal) {
        console.error('❌ [showReadingProgressModal]: 모달 요소를 찾을 수 없습니다.');
        return;
    }
    console.log(`📌 [showReadingProgressModal]: "${routine.name}" 모달 표시 시작`);
    
    title.textContent = `📖 ${routine.bookTitle}`;
    
    const todayRange = getTodayReadingRange(routine);
    const progress = getReadingProgress(routine);
    
    readingInfo.innerHTML = `
        <h4>📚 ${routine.bookTitle}</h4>
        <p><strong>오늘의 목표:</strong> ${todayRange.start}~${todayRange.end} 페이지 (${todayRange.pages}페이지)</p>
        <p><strong>현재 진행률:</strong> ${routine.currentPage}/${routine.endPage} 페이지 (${progress}%)</p>
    `;
    
    readPagesInput.value = todayRange.pages;
    recommendedPages.textContent = todayRange.pages;
    
    // 진행률 미리보기 업데이트
    function updateProgressPreview() {
        const readPages = parseInt(readPagesInput.value) || 0;
        const newCurrentPage = routine.currentPage + readPages;
        const newProgress = Math.round(((newCurrentPage - routine.startPage + 1) / (routine.endPage - routine.startPage + 1)) * 100);
        
        readingProgressInfo.innerHTML = `
            <div class="progress-preview">
                <span>읽은 후 페이지:</span>
                <span>${newCurrentPage}/${routine.endPage}</span>
            </div>
            <div class="progress-preview highlight">
                <span>새로운 진행률:</span>
                <span>${newProgress}%</span>
            </div>
        `;
    }
    
    // 완료 예정일 계산 및 표시
    const completionDateEl = document.getElementById('completionDate');
    const estimatedCompletionDate = getEstimatedCompletionDate(routine);
    if (completionDateEl) {
        completionDateEl.textContent = estimatedCompletionDate;
    }

    readPagesInput.removeEventListener('input', updateProgressPreview);
    readPagesInput.addEventListener('input', updateProgressPreview);
    updateProgressPreview();
    
    modal.style.display = 'flex';
    readPagesInput.focus();
}

function hideReadingProgressModal() {
    console.log('📌 [hideReadingProgressModal]: 독서 모달 닫기');
    document.getElementById('readingProgressModal').style.display = 'none';
}
// ▲▲▲ 여기까지 교체 ▲▲▲

// ▲▲▲ 여기까지 08/17(수정일) 독서 루틴 완료 예정일 위치 수정 (기존 함수 전체 교체) ▲▲▲



function showManageAreasModal() {
    const modal = document.getElementById('manageAreasModal');
    const manageAreasList = document.getElementById('manageAreasList');
    
    // 임시 영역 배열 생성 (취소 시 원본 유지를 위함)
    const tempAreas = JSON.parse(JSON.stringify(userAreas));

    // 화면을 그리는 함수
    const render = () => {
        manageAreasList.innerHTML = ''; // 리스트 비우기

        tempAreas.forEach(area => {
            const areaGroup = document.createElement('div');
            areaGroup.className = 'form-group';
            areaGroup.innerHTML = `
                <label for="area-name-${area.id}" style="font-weight: 500;">${area.name} (기본값)</label>
                <input type="text" id="area-name-${area.id}" value="${area.name}" data-area-id="${area.id}">
            `;
            manageAreasList.appendChild(areaGroup);
        });
    };

    // 모달이 열릴 때 화면을 그림
    render();
    modal.style.display = 'flex';
}









function hideManageAreasModal() {
    document.getElementById('manageAreasModal').style.display = 'none';
}

function hideDetailStatsModal() {
    document.getElementById('routineDetailModal').style.display = 'none';
}

// ▼▼▼ showDetailStatsModal 함수를 이 코드로 교체하세요 ▼▼▼
async function showDetailStatsModal(routineId) {
    const modal = document.getElementById('routineDetailModal');
    const loadingEl = document.getElementById('detailModalLoading');
    const contentEl = document.getElementById('detailModalContent');
    const titleEl = document.getElementById('detailModalTitle');
    const calendarContainer = document.getElementById('calendar-heatmap-container');

    // 모달 초기 상태 설정
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    modal.style.display = 'flex';

    const routine = sampleRoutines.find(r => r.id === routineId);
    if (!routine) {
        loadingEl.innerHTML = '<div class="text-center text-red-500">루틴을 찾을 수 없습니다.</div>';
        return;
    }

    titleEl.textContent = `"${routine.name}" 상세 통계`;
    
    try {
        // stats 변수 초기화
        let stats = null;
        
        // 통계 계산
        stats = await calculateDetailStats(routineId);
        console.log('상세 통계 계산 완료:', stats);

        // 통계 데이터 확인 및 기본값 설정
        if (!stats) {
            stats = {
                currentStreak: routine.streak || 0,
                longestStreak: routine.streak || 0,
                totalCompletions: 0,
                totalPoints: 0,
                historyData: []
            };
        }

        // 데이터 채우기
        document.getElementById('detail-current-streak').textContent = `🔥 ${stats.currentStreak}`;
        document.getElementById('detail-longest-streak').textContent = `🏆 ${stats.longestStreak}`;
        document.getElementById('detail-total-completions').textContent = `✅ ${stats.totalCompletions}`;
        document.getElementById('detail-total-points').textContent = `✨ ${stats.totalPoints}`;

        // 커스텀 히트맵 렌더링
        calendarContainer.innerHTML = '<h3 class="text-lg font-bold mb-4">📅 활동 기록</h3>';

        if (stats.historyData && stats.historyData.length > 0) {
            createSimpleHeatmap(calendarContainer, stats.historyData);
        } else {
            calendarContainer.innerHTML += `
                <div class="bg-gray-50 p-8 rounded-lg text-center">
                    <div class="text-4xl mb-2">📊</div>
                    <div class="text-gray-500">아직 활동 기록이 없습니다</div>
                    <div class="text-sm text-gray-400 mt-1">루틴을 완료하면 여기에 기록됩니다</div>
                </div>
            `;
        }

        // 로딩 완료 후 콘텐츠 표시
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        
    } catch (error) {
        console.error('상세 통계 로드 실패:', error);
        loadingEl.innerHTML = `
            <div class="text-center text-red-500">
                <div class="text-2xl mb-2">⚠️</div>
                <div>통계를 불러오는 중 오류가 발생했습니다</div>
                <div class="text-sm mt-2">${error.message}</div>
            </div>
        `;
    }
}
// ▲▲▲ 여기까지 교체 ▲▲▲

   
// ▼▼▼ 2025-08-21 홈 화면 루틴 필터링 로직 수정 ▼▼▼
function renderRoutines() {
    const incompleteList = document.getElementById('incompleteRoutineList');
    const inprogressList = document.getElementById('inprogressRoutineList');
    const completedList = document.getElementById('completedRoutineList');
    const skippedList = document.getElementById('skippedRoutineList');
    const inprogressSection = document.getElementById('inprogress-section');
    const completedSection = document.getElementById('completed-section');
    const skippedSection = document.getElementById('skipped-section');
    const emptyState = document.getElementById('emptyStateIncomplete');

    if (!incompleteList || !inprogressList || !completedList || !skippedList) return;

    incompleteList.innerHTML = '';
    inprogressList.innerHTML = '';
    completedList.innerHTML = '';
    skippedList.innerHTML = '';
            
    // ★★★ 핵심 수정: 'active' 상태이면서, 'assignedTo'가 현재 사용자인 루틴만 필터링합니다. ★★★
    const myActiveRoutines = sampleRoutines
        .filter(r => r.active && r.assignedTo === currentUser.uid)
        .sort((a, b) => a.order - b.order);
    
    let incompleteRoutines = 0;

    myActiveRoutines.forEach(routine => {
        const element = createImprovedRoutineElement(routine);
        if (routine.status === 'skipped') {
            skippedList.appendChild(element);
        } else if (isRoutineCompleted(routine)) {
            completedList.appendChild(element);
        } else if (isRoutineInProgress(routine)) {
            inprogressList.appendChild(element);
        } else {
            incompleteList.appendChild(element);
            incompleteRoutines++;
        }
    });
    
    // UI 업데이트 (기존 로직과 동일)
    if (myActiveRoutines.length === 0) {
        emptyState.style.display = 'block';
        emptyState.innerHTML = `
            <div class="empty-state-icon">🗺️</div>
            <div class="empty-state-title">아직 루틴이 없어요</div>
            <div class="empty-state-description">'관리' 페이지에서 '내 루틴 추가하기'를 통해<br>첫 번째 루틴을 만들어보세요.</div>
        `;
    } else {
        emptyState.style.display = incompleteRoutines === 0 && (inprogressList.children.length > 0 || completedList.children.length > 0) ? 'block' : 'none';
        emptyState.innerHTML = `
            <div class="empty-state-icon">🎉</div>
            <div class="empty-state-title">모든 루틴을 완료했습니다!</div>
            <div class="empty-state-description">오늘 하루도 정말 수고하셨습니다.<br>꾸준한 노력이 큰 변화를 만들어냅니다!</div>
        `;
    }

    inprogressSection.style.display = inprogressList.children.length > 0 ? 'block' : 'none';
    completedSection.style.display = completedList.children.length > 0 ? 'block' : 'none';
    skippedSection.style.display = skippedList.children.length > 0 ? 'block' : 'none';
    
    updateDailyProgress();
}
// ▲▲▲ 여기까지 2025-08-21 홈 화면 루틴 필터링 로직 수정 ▲▲▲




// ▼▼▼ 2025-08-21 renderManagePage 함수를 탭 기반으로 전면 개편 ▼▼▼
// ▼▼▼ 2025-08-21 renderManagePage 함수 안정성 강화 ▼▼▼
// ▼▼▼ 2025-08-24 [완벽본] renderManagePage 함수 ▼▼▼
function renderManagePage() {
    // --- '가족 관리' UI 동적 제어 임무 시작 ---
    const familyContentDiv = document.getElementById('family-content');
    if (familyContentDiv) {
        if (currentUser && currentUser.familyId) {
            // 이미 가족에 소속된 경우
            familyContentDiv.innerHTML = `
                <p style="color: var(--text-secondary);">당신은 이미 가족에 소속되어 있습니다.</p>
                <button id="inviteMemberBtn" class="btn" style="width: 100%; margin-top: 1rem;">+ 가족원 초대하기</button>
            `;
            // ★★★ 이벤트 리스너는 항상 innerHTML로 요소를 만든 '직후'에 연결해야 합니다.
            document.getElementById('inviteMemberBtn').addEventListener('click', () => {
                showNotification('초대 기능은 현재 준비 중입니다.', 'info');
            });
        } else {
            // 가족이 없는 경우
            familyContentDiv.innerHTML = `
                <p style="color: var(--text-secondary);">가족을 생성하여 자녀의 루틴을 관리하거나, 기존 가족에 참여하세요.</p>
                <button id="createFamilyBtn" class="btn" style="width: 100%; margin-top: 1rem;">+ 새 가족 생성하기</button>
                <button id="joinFamilyBtn" class="btn btn-secondary" style="width: 100%; margin-top: 0.5rem;">초대 코드로 참여하기</button>
            `;
            document.getElementById('createFamilyBtn').addEventListener('click', createFamily);
            document.getElementById('joinFamilyBtn').addEventListener('click', () => {
                showNotification('초대 코드로 참여하는 기능은 현재 준비 중입니다.', 'info');
            });
        }
    }
    // --- '가족 관리' UI 동적 제어 임무 종료 ---
    // --- 생산자 검토: 필수 UI 요소가 모두 존재하는지 확인 ---
    const tabs = document.querySelectorAll('.routine-manage-tabs .tab-btn');
    const panels = document.querySelectorAll('.routine-manage-panels .tab-panel');
    const parentListEl = document.getElementById('parentRoutineList');
    const childListContainer = document.getElementById('childRoutinesByChild');
    const addParentBtn = document.getElementById('addParentRoutineBtn');
    const addChildBtn = document.getElementById('addChildRoutineBtn');
    const saveOrderBtn = document.getElementById('saveParentOrderBtn');

    if (!tabs.length || !panels.length || !parentListEl || !childListContainer || !addParentBtn || !addChildBtn || !saveOrderBtn) {
        console.error("❌ [renderManagePage]: 관리 페이지의 필수 UI 요소가 누락되었습니다. index.html 파일을 확인하십시오.");
        return;
    }
    
    // --- 리뷰어 검토: 탭 전환 로직이 명확하고 부작용이 없는지 확인 ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            
            tab.classList.add('active');
            const targetPanelId = tab.dataset.tab + '-panel';
            document.getElementById(targetPanelId).classList.add('active');
        });
    });

    // --- 생산자: '내 루틴' 목록 생성 ---
    parentListEl.innerHTML = '';
    const parentRoutines = sampleRoutines
        .filter(r => r.assignedTo === currentUser.uid)
        .sort((a, b) => a.order - b.order);
    parentRoutines.forEach(routine => parentListEl.appendChild(createManageRoutineElement(routine)));

    // --- 리뷰어 검토: Sortable.js 인스턴스가 중복 생성되지 않도록 처리 ---
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(parentListEl, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: () => saveOrderBtn.style.display = 'block'
    });

    // --- 생산자: '자녀 루틴' 목록 생성 ---
    childListContainer.innerHTML = '';
    const childRoutines = sampleRoutines.filter(r => r.assignedTo !== currentUser.uid);
    const routinesByChild = childRoutines.reduce((acc, routine) => {
        (acc[routine.assignedTo] = acc[routine.assignedTo] || []).push(routine);
        return acc;
    }, {});

    getFamilyMembers().then(members => {
        const children = members.filter(m => m.role === 'child');
        if (children.length === 0) {
            childListContainer.innerHTML = `<p class="panel-description">가족 관리에서 자녀를 먼저 추가해주세요.</p>`;
        } else {
            children.forEach(child => {
                const childGroup = document.createElement('div');
                childGroup.className = 'child-routine-group';
                childGroup.innerHTML = `<h3>${child.name}의 루틴</h3>`;
                const childRoutineList = document.createElement('div');
                childRoutineList.className = 'manage-routine-list';
                
                const routinesForThisChild = routinesByChild[child.id] || [];
                if (routinesForThisChild.length > 0) {
                    routinesForThisChild.forEach(routine => childRoutineList.appendChild(createManageRoutineElement(routine)));
                } else {
                    childRoutineList.innerHTML = `<p class="panel-description">할당된 루틴이 없습니다.</p>`;
                }
                childGroup.appendChild(childRoutineList);
                childListContainer.appendChild(childGroup);
            });
        }
    });

    // --- 리뷰어 검토: 각 버튼이 명확한 작전 모드('parent' 또는 'child')를 전달하는지 최종 확인 ---
    addParentBtn.onclick = () => {
        console.log("▶️ '내 루틴 추가' 명령 하달됨");
        showRoutineForm(null, { mode: 'parent' });
    };
    addChildBtn.onclick = () => {
        console.log("▶️ '자녀 루틴 추가' 명령 하달됨");
        showRoutineForm(null, { mode: 'child' });
    };
    
    saveOrderBtn.onclick = saveRoutineOrder;
}
// ▲▲▲ 여기까지 2025-08-24 [완벽본] renderManagePage 함수 ▲▲▲



// ▼▼▼ 08/17(수정일) 독서 루틴 완료 예정일 표시 위치 및 구조 수정 (기존 함수 전체 교체) ▼▼▼
function createImprovedRoutineElement(routine) {
    const isCompleted = isRoutineCompleted(routine);
    const isSkipped = routine.status === 'skipped';
    const isGoalReachedOverall = isGoalAchieved(routine);
    const isContinuous = isContinuousRoutine(routine);
    const isInProgress = isRoutineInProgress(routine);
    
    // 이전에 추가되었던 readingDetails 변수와 로직을 삭제합니다.
    
    const routineDiv = document.createElement('div');
    routineDiv.className = 'routine-item';
    routineDiv.dataset.id = routine.id;
    routineDiv.dataset.type = routine.type;
    
    routineDiv.classList.add(routine.time);
    
    if (isSkipped) routineDiv.classList.add('skipped');
    else if ((isContinuous || isReadingRoutine(routine)) && isGoalReachedOverall) routineDiv.classList.add('goal-achieved');
    else if (isInProgress) routineDiv.classList.add('inprogress');
    else if (isCompleted) routineDiv.classList.add('completed');
    
    let actionButtonIcon = '▶';
    if(isCompleted || isGoalReachedOverall) actionButtonIcon = '✓';
    if(isSkipped) actionButtonIcon = '⏭️';
    if(isInProgress) actionButtonIcon = '⏳';
    if((isContinuous || isReadingRoutine(routine)) && isGoalReachedOverall) actionButtonIcon = '🎯';

    const actionButton = `<div class="${routine.type === 'yesno' ? 'routine-checkbox' : 'routine-action-button'}">${routine.type === 'yesno' && !isCompleted && !isSkipped ? '' : actionButtonIcon}</div>`;
    const streakBadge = routine.streak > 0 ? `<div class="streak-badge ${routine.streak >= 30 ? 'mega-streak' : (routine.streak >= 7 ? 'high-streak' : '')}">🔥 ${routine.streak}</div>` : '';
    const continuousBadge = isContinuous || isReadingRoutine(routine) ? `<div class="continuous-badge">🔄</div>` : '';
    
    routineDiv.innerHTML = `
    ${actionButton}
    <div class="routine-content">
        <div class="routine-name">
            <span class="type-icon">${getTypeIcon(routine.type)}</span>
            ${routine.name}
        </div>
        <div class="routine-details">
            <div class="time-period">${getTimeEmoji(routine.time)} ${getTimeLabel(routine.time)}</div>
            <div class="frequency-badge">${getFrequencyLabel(routine.frequency)}</div>
        </div>
    </div>
    <div class="routine-value">${getRoutineValueDisplay(routine)}</div>
    ${streakBadge}
    ${continuousBadge}
`;
    
routineDiv.querySelector('.routine-checkbox, .routine-action-button').addEventListener('click', async (e) => {
    e.stopPropagation();

    if (isReadingRoutine(routine) && (isCompleted || isGoalReachedOverall)) {
        // 독서 루틴이 완료되었을 경우: 완료를 취소하는 로직 추가
        console.log('📌 [createImprovedRoutineElement]: 독서 루틴 완료 상태에서 클릭 감지. 완료 취소 로직 실행.');
        if (!confirm(`"${routine.name}" 루틴 완료를 취소하시겠습니까?`)) {
            return;
        }

        const updatedFields = {
            // 독서 루틴의 상태 및 진행 상황을 오늘 완료하기 직전 상태로 되돌립니다.
            value: Math.max(0, routine.currentPage - routine.dailyReadPagesToday),
            currentPage: Math.max(0, routine.currentPage - routine.dailyReadPagesToday),
            dailyReadPagesToday: 0,
            dailyGoalMetToday: false,
            status: null,
            lastUpdatedDate: todayDateString
        };
        
        // 포인트와 스트릭을 되돌리는 로직
        if (routine.pointsGivenToday) {
            updatedFields.streak = Math.max(0, (routine.streak || 0) - 1);
            if (routine.areas && routine.basePoints) {
                const newStats = { ...userStats };
                routine.areas.forEach(areaId => {
                    newStats[areaId] = Math.max(0, (newStats[areaId] || 0) - routine.basePoints);
                });
                await updateUserStatsInFirebase(newStats);
            }
            updatedFields.pointsGivenToday = false;
        }

        await updateRoutineInFirebase(routine.id, updatedFields);
        showNotification('📖 독서 루틴 완료가 취소되었습니다.', 'warning');
        
    } else if (isCompleted && !isContinuous && !isReadingRoutine(routine)) {
        // Yes/No, Time, 일반 Number 루틴의 완료 취소 로직 (기존 로직)
        console.log('📌 [createImprovedRoutineElement]: 일반 루틴 완료 상태에서 클릭 감지. 완료 취소 로직 실행.');
        const updatedFields = { value: routine.type === 'yesno' ? false : null, status: null };
        if (routine.pointsGivenToday) {
            updatedFields.streak = Math.max(0, (routine.streak || 0) - 1);
            if (routine.areas && routine.basePoints) {
                const newStats = { ...userStats };
                routine.areas.forEach(areaId => {
                    newStats[areaId] = Math.max(0, (newStats[areaId] || 0) - routine.basePoints);
                });
                await updateUserStatsInFirebase(newStats);
            }
            updatedFields.pointsGivenToday = false;
        }
        await updateRoutineInFirebase(routine.id, updatedFields);
        showNotification('루틴 완료가 취소되었습니다.', 'warning');
    } else if (!isSkipped) {
        // 완료/진행 로직 (기존 로직)
        console.log('📌 [createImprovedRoutineElement]: 미완료/진행 중 루틴 클릭 감지. 완료/진행 로직 실행.');
        if (routine.type === 'yesno') {
            const updatedFields = { value: true, status: null, pointsGivenToday: true, streak: (routine.streak || 0) + 1 };
            if (routine.areas && routine.basePoints) {
                const newStats = { ...userStats };
                routine.areas.forEach(areaId => {
                    newStats[areaId] = (newStats[areaId] || 0) + routine.basePoints;
                });
                await updateUserStatsInFirebase(newStats);
            }
            await updateRoutineInFirebase(routine.id, updatedFields);
            showCompletionEffect();
            setTimeout(showCelebrationMessage, 300);
        } else if (routine.type === 'number') {
            showNumberInputModal(routine);
        } else if (routine.type === 'time') {
            showTimeInputModal(routine);
        } else if (routine.type === 'reading') {
            showReadingProgressModal(routine);
        }
    }
});
    return routineDiv;
}
// ▲▲▲ 여기까지 08/17(수정일) 독서 루틴 완료 예정일 표시 위치 및 구조 수정 (기존 함수 전체 교체) ▲▲▲


// ▼▼▼ createManageRoutineElement 함수를 이 코드로 교체하세요 ▼▼▼
function createManageRoutineElement(routine) {
    const item = document.createElement('div');
    item.className = 'manage-routine-item';
    item.dataset.id = routine.id;
    item.innerHTML = `
        <div class="routine-info-wrapper">
            <span class="drag-handle">☰</span>
            <div class="routine-main-info">
                <div class="routine-main-name">${routine.name}</div>
                <div class="routine-main-details">
                    <span class="routine-type-badge">${getTypeLabel(routine.type)}</span>
                    <span>${getTimeLabel(routine.time)}</span>
                    <span>${getFrequencyLabel(routine.frequency)}</span>
                </div>
            </div>
        </div>
        <div class="routine-controls">
            <label class="routine-toggle">
                <input type="checkbox" class="toggle-checkbox" ${routine.active ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
            <button class="stats-btn">상세</button>
            <button class="edit-btn">편집</button>
        </div>
    `;
    
    // 토글 이벤트
    item.querySelector('.toggle-checkbox').addEventListener('change', async (e) => {
        await updateRoutineInFirebase(String(routine.id), { active: e.target.checked });
        showNotification(`'${routine.name}' 루틴이 ${e.target.checked ? '활성화' : '비활성화'}되었습니다.`, 'info');
    });

    // 상세 버튼 이벤트
    item.querySelector('.stats-btn').addEventListener('click', () => showDetailStatsModal(routine.id));
    
    // 편집 버튼 이벤트 (삭제 기능 포함된 편집 모달)
    item.querySelector('.edit-btn').addEventListener('click', () => editRoutine(routine.id));
    
    return item;
}
// ▲▲▲ 여기까지 교체 ▲▲▲
   

 function renderAreaStats() {
            const areaStatsGrid = document.getElementById('areaStatsGrid');
            areaStatsGrid.innerHTML = '';
    
            userAreas.forEach(area => {
                const points = userStats[area.id] || 0;
                const statItem = document.createElement('div');
                statItem.className = `area-stat-item ${area.id.replace(/\d/g, '')}`; // 숫자를 제거하여 일관된 클래스명 유지
                statItem.innerHTML = `<h4>${area.name}</h4><div class="points">${points} P</div>`;
                areaStatsGrid.appendChild(statItem);
            });
        }

       function updateDailyProgress() {
    const activeRoutines = sampleRoutines.filter(r => r.active);
    if (activeRoutines.length === 0) {
        document.getElementById('dailyProgressPercentage').textContent = `0%`;
        document.getElementById('dailyProgressBar').style.width = `0%`;
        return;
    }
    const completedCount = activeRoutines.filter(r => isRoutineCompleted(r)).length;
    const progressPercentage = Math.round((completedCount / activeRoutines.length) * 100);
    document.getElementById('dailyProgressPercentage').textContent = `${progressPercentage}%`;
    document.getElementById('dailyProgressBar').style.width = `${progressPercentage}%`;
    document.getElementById('incompleteCount').textContent = activeRoutines.filter(r => !isRoutineCompleted(r) && r.status !== 'skipped').length;
    document.getElementById('inprogressCount').textContent = activeRoutines.filter(r => isRoutineInProgress(r)).length;
    document.getElementById('completedCount').textContent = completedCount;
    document.getElementById('skippedCount').textContent = activeRoutines.filter(r => r.status === 'skipped').length;
}

// feat(stats): Implement basic UI and rendering for statistics page

// script.js의 기존 renderStatsPage 함수를 이 코드로 교체하세요.

async function renderStatsPage() {
    console.log('=== 통계 페이지 렌더링 시작 ===');
    console.log('현재 기간:', currentStatsPeriod);
    console.log('사용자:', currentUser?.uid);
    console.log('루틴 개수:', sampleRoutines.length);
    // 현재 선택된 기간으로 통계 계산
    const stats = await calculateStats(currentStatsPeriod);
    console.log('계산된 통계:', stats);

    const periodText = currentStatsPeriod === 'weekly' ? '주간' : '월간';

    // 제목 업데이트
    const completionRateTitle = document.getElementById('completion-rate-title');
    if (completionRateTitle) {
        completionRateTitle.textContent = `${periodText} 달성률`;
    }

    // --- 1. 핵심 지표 카드 업데이트 ---
    if (!stats) {
        document.getElementById('stats-completion-rate').textContent = '데이터 없음';
        document.getElementById('stats-total-points').textContent = '0 P';
        document.getElementById('stats-area-health').textContent = '0 P';
        document.getElementById('stats-area-relationships').textContent = '0 P';
        document.getElementById('stats-area-work').textContent = '0 P';
        return;
    }

    // 올바른 속성명 사용
    document.getElementById('stats-completion-rate').textContent = `${stats.completionRate}%`;
    document.getElementById('stats-total-points').textContent = `${stats.totalPoints} P`;
    document.getElementById('stats-area-health').textContent = `${stats.areaPoints.health || 0} P`;
    document.getElementById('stats-area-relationships').textContent = `${stats.areaPoints.relationships || 0} P`;
    document.getElementById('stats-area-work').textContent = `${stats.areaPoints.work || 0} P`;

    // --- 2. 파이 차트 렌더링 ---
    const ctx = document.getElementById('areaDistributionChart').getContext('2d');
    
    if (areaChartInstance) {
        areaChartInstance.destroy();
    }

    areaChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['❤️ 건강', '🤝 관계', '💼 업무'],
            datasets: [{
                label: '루틴 완료 횟수',
                data: [
                    stats.areaCompletions.health || 0,
                    stats.areaCompletions.relationships || 0,
                    stats.areaCompletions.work || 0
                ],
                backgroundColor: [
                    'rgba(239, 68, 68, 0.7)',  // red-500
                    'rgba(59, 130, 246, 0.7)', // blue-500
                    'rgba(245, 158, 11, 0.7)'  // amber-500
                ],
                borderColor: [
                    'rgba(239, 68, 68, 1)',
                    'rgba(59, 130, 246, 1)',
                    'rgba(245, 158, 11, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.raw !== null) {
                                label += context.raw + '회';
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });

    // --- 3. 바 차트 렌더링 ---
    const ctxBar = document.getElementById('weeklyActivityChart').getContext('2d');
    if (weeklyChartInstance) { 
        weeklyChartInstance.destroy(); 
    }
    
    weeklyChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            // ★★★ 핵심 수정 #1 ★★★
            labels: stats.barChartLabels || [], // 'weeklyActivityLabels' -> 'barChartLabels'
            datasets: [{
                label: '일일 완료 루틴 개수',
                // ★★★ 핵심 수정 #2 ★★★
                data: stats.barChartData || [],   // 'weeklyActivityData' -> 'barChartData'
                backgroundColor: 'rgba(99, 102, 241, 0.7)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false // 범례 숨기기
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1 // y축 눈금을 정수 단위로
                    }
                }
            }
        }
    });
}
// script.js의 calculateStats 함수 다음에 추가하세요.

async function calculateDetailStats(routineId) {
    const routine = sampleRoutines.find(r => r.id === routineId);
    if (!routine || !currentUser.familyId) return null;

    // ★★★ 핵심: 새로운 families 컬렉션 경로를 사용합니다. ★★★
    const historyRef = db.collection('families').doc(currentUser.familyId)
                         .collection('routines').doc(routineId)
                         .collection('history');
    const historySnapshot = await historyRef.orderBy('date', 'desc').get();
    const histories = historySnapshot.docs.map(doc => doc.data());


    if (histories.length === 0) {
        return {
            currentStreak: routine.streak || 0,
            longestStreak: routine.streak || 0,
            totalCompletions: 0,
            totalPoints: 0,
            historyData: []
        };
    }

    // 2. 총 완료 횟수 및 포인트 계산
    const totalCompletions = histories.length;
    const totalPoints = histories.reduce((sum, hist) => sum + (hist.pointsEarned || 0), 0);

    // 3. 최고 스트릭 계산 (조금 복잡한 로직)
    let longestStreak = 0;
    let currentStreakCheck = 0;
    if (histories.length > 0) {
        // 날짜를 기준으로 정렬 (이미 쿼리에서 했지만 확인차)
        const sortedDates = histories.map(h => new Date(h.date)).sort((a, b) => b - a);
        
        let lastDate = sortedDates[0];
        currentStreakCheck = 1;
        longestStreak = 1;

        for (let i = 1; i < sortedDates.length; i++) {
            const currentDate = sortedDates[i];
            const diffTime = lastDate.getTime() - currentDate.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                currentStreakCheck++;
            } else {
                currentStreakCheck = 1; // 연속이 끊김
            }
            if (currentStreakCheck > longestStreak) {
                longestStreak = currentStreakCheck;
            }
            lastDate = currentDate;
        }
    }


    return {
        currentStreak: routine.streak || 0,
        longestStreak: longestStreak,
        totalCompletions: totalCompletions,
        totalPoints: totalPoints,
        historyData: histories // 캘린더 히트맵을 위해 전달
    };
}

// ▼▼▼ createSimpleHeatmap 함수를 이 코드로 교체하세요 ▼▼▼
function createSimpleHeatmap(container, historyData) {
    const today = new Date();
    
    // 날짜별 완료 횟수 맵 생성
    const dateMap = {};
    historyData.forEach(hist => {
        const date = hist.date;
        dateMap[date] = (dateMap[date] || 0) + 1;
    });
    
    // 정확한 주차 계산 함수
    function getWeekNumber(date) {
        const currentDate = new Date(date);
        const startOfYear = new Date(currentDate.getFullYear(), 0, 1);
        const days = Math.floor((currentDate - startOfYear) / (24 * 60 * 60 * 1000));
        return Math.ceil((days + startOfYear.getDay() + 1) / 7);
    }
    
    // 주별 데이터 집계
    const weeklyData = [];
    
    for (let weekIndex = 51; weekIndex >= 0; weekIndex--) {
        // 각 주의 시작일 (일요일) 계산
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - (today.getDay()) - (weekIndex * 7));
        weekStart.setHours(0, 0, 0, 0);
        
        // 주의 끝일 (토요일)
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        // 해당 주의 완료 횟수 집계
        let weeklyCount = 0;
        for (let day = new Date(weekStart); day <= weekEnd; day.setDate(day.getDate() + 1)) {
            const dayStr = day.toISOString().split('T')[0];
            weeklyCount += dateMap[dayStr] || 0;
        }
        
        // 정확한 주차 계산
        const actualWeekNumber = getWeekNumber(weekStart);
        const year = weekStart.getFullYear();
        const startMonth = weekStart.getMonth() + 1;
        const startDay = weekStart.getDate();
        const endMonth = weekEnd.getMonth() + 1;
        const endDay = weekEnd.getDate();
        
        // 연도가 바뀌는 경우 처리
        const displayWeek = weekStart.getFullYear() === today.getFullYear() ? 
            actualWeekNumber : 
            `${year.toString().slice(-2)}년 ${actualWeekNumber}주`;
        
        weeklyData.push({
            weekNumber: actualWeekNumber,
            displayWeek: displayWeek,
            count: weeklyCount,
            startDate: `${startMonth}/${startDay}`,
            endDate: `${endMonth}/${endDay}`,
            year: year,
            intensity: weeklyCount > 0 ? Math.min(Math.ceil(weeklyCount / 2), 4) : 0,
        isCurrentWeek: weekIndex === 0,
    });
        }
    
    
    let html = '<div class="simple-heatmap">';
    html += '<h4 class="heatmap-title">최근 1년간 주별 활동 기록</h4>';
    html += '<div class="weekly-heatmap-grid">';
    
    weeklyData.forEach(week => {
        const colorClass = `heatmap-cell-${week.intensity}`;
        const currentWeekClass = week.isCurrentWeek ? 'current-week' : '';
        const tooltipText = `${week.year}년 ${week.weekNumber}주차 (${week.startDate}~${week.endDate}): ${week.count}회 완료`;
        
        html += `<div class="weekly-heatmap-cell ${colorClass} ${currentWeekClass}" 
                     title="${tooltipText}"
                     data-week="${week.weekNumber}" 
                     data-year="${week.year}"
                     data-count="${week.count}">
                     <span class="week-number">${week.displayWeek}</span>
                 </div>`;
    });
    
    html += '</div>';
    
    // 범례
    html += '<div class="heatmap-legend">';
    html += '<span class="legend-label">활동량:</span>';
    html += '<span class="legend-text">적음</span>';
    for (let i = 0; i <= 4; i++) {
        html += `<div class="legend-cell heatmap-cell-${i}"></div>`;
    }
    html += '<span class="legend-text">많음</span>';
    html += '</div>';
    
    html += '</div>';
    
    container.innerHTML = html;
}
// ▲▲▲ 여기까지 교체 ▲▲▲


// 1. 총괄 지휘관 (데이터 수집 및 임무 분배)
async function renderGoalCompassPage() {
    if (!currentUser) {
        console.error("🚨 [renderGoalCompassPage] 비상: currentUser가 없어 작전을 개시할 수 없습니다.");
        return;
    }
    console.log('📌 [renderGoalCompassPage]: 나침반 페이지 작전 개시');

    try {
        const list = document.getElementById('goalsList');
        list.innerHTML = '로딩 중...';

        const allGoals = await getUserGoals(currentUser.uid);
        const activeGoals = allGoals.filter(g => g.status !== 'completed');
        const completedGoals = allGoals.filter(g => g.status === 'completed');

        // 각 전문 장교에게 임무 하달
        renderActiveGoalsList(activeGoals, completedGoals.length > 0);
        renderCompletedGoalsList(completedGoals);
        setupGoalPageEventListeners(allGoals); // 모든 목표 데이터를 통신 장교에게 전달

    } catch (error) {
        console.error("❌ [renderGoalCompassPage] 목표 렌더링 실패:", error);
        document.getElementById('goalsList').innerHTML = `<div class="empty-state">⚠️ 목표 로딩 실패.</div>`;
    }
}




// 2. 현장 지휘관 (진행 중 목표 렌더링)
// ▼▼▼ 08/21(수정일) renderActiveGoalsList 최종 임무 수첩 (완전판) ▼▼▼
function renderActiveGoalsList(activeGoals, hasCompletedGoals) {
    const list = document.getElementById('goalsList');
    if (!list) return;

    list.innerHTML = ''; // 기존 목록 초기화

    // 1. 진행 중인 목표와 완료된 목표가 모두 없을 때만 초기 메시지를 표시합니다.
    if (activeGoals.length === 0 && !hasCompletedGoals) {
        list.innerHTML = `<div class="empty-state"> <div class="empty-state-icon">🧭</div> <div class="empty-state-title">아직 목표가 없어요</div> <div class="empty-state-description">‘+ 새 목표’를 눌러 분기/연간 목표를 만들어 보세요.</div> </div>`;
        return;
    }

    // 2. 진행 중인 목표들을 순회하며 현황판(카드)을 생성합니다.
    activeGoals.forEach(goal => {
        // 2a. 진행률(pct) 계산
        let pct = 0;
        if (goal.direction === 'decrease') {
            const startValue = goal.startValue !== undefined ? goal.startValue : goal.currentValue;
            const range = startValue - goal.targetValue;
            const achieved = startValue - goal.currentValue;
            if (range > 0) {
                pct = Math.min(100, Math.max(0, Math.round((achieved / range) * 100)));
            }
        } else { // 'increase' 또는 'points'
            if (goal.targetValue > 0) {
                pct = Math.min(100, Math.round(((goal.currentValue || 0) / goal.targetValue) * 100));
            }
        }

        // 2b. 기타 표시 정보 계산
        const deg = Math.round(360 * (pct / 100));
        const ddayInfo = getGoalDdayInfo(goal.startDate, goal.endDate);
        const kpi = `${goal.currentValue || 0} / ${goal.targetValue || 0} ${goal.unit || 'P'}`;

        const card = document.createElement('div');
        card.className = 'goal-card';
        
        // 2c. 목표 달성 여부에 따른 버튼 분기 처리
        let actionButtonsHTML = '';
        if (pct >= 100) {
            card.classList.add('goal-achieved');
            actionButtonsHTML = `<button class="complete-btn" data-goal-id="${goal.id}">🏆 완료 처리</button>`;
        } else {
            actionButtonsHTML = `
                <button class="edit-btn" data-goal-id="${goal.id}">편집</button>
                <button class="delete-btn" data-goal-id="${goal.id}">삭제</button>
            `;
        }

        // 2d. 최종 HTML 구조 생성
        card.innerHTML = `
            <div class="goal-card-header">
                <div style="font-weight:800;">${goal.name}</div>
                <div>${actionButtonsHTML}</div>
            </div>
            <div style="color:#6b7280; font-size:0.85rem; margin-bottom:0.5rem;">
                ${goal.goalType === 'points' ? '포인트 목표' : `단위 목표 (${getAreaName(goal.area)})`} · 기간: ${goal.startDate} ~ ${goal.endDate}
            </div>
            <div class="goal-progress-wrap">
                <div class="goal-meter" style="--deg:${deg}deg;">${pct}%</div>
                <div style="flex:1;">
                    <div style="font-weight:700; margin-bottom:4px;">달성 현황</div>
                    <div style="color:#374151; font-weight:700; margin-bottom:6px;">${kpi}</div>
                    <div style="color:#6b7280;">${ddayInfo.label}</div>
                    <div id="pace-${goal.id}" style="color:#10b981; font-weight:600; margin-top:6px;"></div>
                </div>
            </div>
        `;

        // 2e. 생성된 카드를 전장에 배치
        list.appendChild(card);
        
        // 2f. 페이스 메시지 업데이트
        const paceMsg = getPaceMessage(goal);
        const paceEl = document.getElementById(`pace-${goal.id}`);
        if (paceEl && paceMsg) paceEl.textContent = paceMsg;
    });
}

// ▲▲▲ 여기까지 08/21(수정일) renderActiveGoalsList 최종 임무 수첩 (완전판) ▲▲▲

// ▼▼▼ 08/21(수정일) renderCompletedGoalsList 최종 임무 수첩 (완전판) ▼▼▼
function renderCompletedGoalsList(completedGoals) {
    const completedList = document.getElementById('completedGoalsList');
    const showCompletedBtn = document.getElementById('showCompletedGoalsBtn');
    
    if (!completedList || !showCompletedBtn) return;

    completedList.innerHTML = ''; // 기존 목록 초기화

    // 1. 완료된 목표가 하나라도 있는지 확인합니다.
    if (completedGoals && completedGoals.length > 0) {
        // 완료된 목표가 있다면 '명예의 전당 보기' 버튼을 표시합니다.
        showCompletedBtn.style.display = 'inline-block';
        
        // 2. 완료된 목표들을 순회하며 기념 명패(카드)를 생성합니다.
        completedGoals.forEach(goal => {
            const card = document.createElement('div');
            card.className = 'goal-card goal-achieved'; // 완료 스타일 적용

            // Firestore Timestamp 객체를 JavaScript Date 객체로 변환합니다.
            const completionDate = goal.completedAt ? new Date(goal.completedAt.seconds * 1000).toLocaleDateString('ko-KR') : '날짜 기록 없음';

            card.innerHTML = `
                <div class="goal-card-header">
                    <div style="font-weight:800;">🏆 ${goal.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">
                        완료일: ${completionDate}
                    </div>
                </div>
                <div style="margin-top: 1rem; text-align: center; font-weight: 600;">
                    최종 성과: ${goal.currentValue} / ${goal.targetValue} ${goal.unit || 'P'}
                </div>
            `;
            completedList.appendChild(card);
        });
    } else {
        // 완료된 목표가 없다면 '명예의 전당 보기' 버튼을 숨깁니다.
        showCompletedBtn.style.display = 'none';
    }
}
// ▲▲▲ 여기까지 08/21(수정일) renderCompletedGoalsList 최종 임무 수첩 (완전판) ▲▲▲

// ▼▼▼ 08/21(수정일) setupGoalPageEventListeners 최종 임무 수첩 (완전판) ▼▼▼
function setupGoalPageEventListeners(allGoals) {
    // const page = document.getElementById('goal-compass-page'); // 기존 코드
    const page = document.getElementById('goal-page'); // ★★★ 수정: ID를 'goal-page'로 변경
    if (!page) {
        console.error("🚨 [setupGoalPageEventListeners] 비상: 'goal-page'를 찾을 수 없어 통신망 구축에 실패했습니다.");
        return;
    }

    const activeSection = document.getElementById('activeGoalsSection');
    const completedSection = document.getElementById('completedGoalsSection');
    const goalPageTitle = document.getElementById('goalPageTitle');
    const list = document.getElementById('goalsList'); // 동적 버튼이 있는 곳

    // 1. 페이지 전체에 대한 단일 명령 수신 체계(이벤트 리스너)를 구축합니다.
    // 기존 리스너를 제거하여 중복 명령을 방지합니다.
    page.onclick = null;
    page.onclick = (e) => {
        const target = e.target.closest('button'); // 버튼 또는 버튼 내부의 아이콘/텍스트 클릭 모두 감지
        if (!target) return; // 버튼이 아닌 곳을 클릭했다면 무시

        console.log('📌 [GoalPage Click]:', target.id || `.${target.className}`);

        // --- 2. 수신된 신호에 따라 작전 분기 ---

        // '새 목표' 버튼 신호
        if (target.id === 'openAddGoalBtn') {
            showAddGoalModal();
            return;
        }
        // '명예의 전당 보기' 버튼 신호
        if (target.id === 'showCompletedGoalsBtn') {
            if(activeSection) activeSection.style.display = 'none';
            if(completedSection) completedSection.style.display = 'block';
            if(goalPageTitle) goalPageTitle.textContent = '🏆 명예의 전당';
            return;
        }
        // '진행 중 목표 보기' 버튼 신호
        if (target.id === 'showActiveGoalsBtn') {
            if(activeSection) activeSection.style.display = 'block';
            if(completedSection) completedSection.style.display = 'none';
            if(goalPageTitle) goalPageTitle.textContent = '🧭 목표 나침반';
            return;
        }
        // '삭제', '편집', '완료' 버튼 신호 (이벤트 위임)
        const goalId = target.dataset.goalId;
        if (!goalId) return;

        if (target.matches('.delete-btn')) {
            if (confirm('이 목표를 정말로 삭제하시겠습니까?')) {
                deleteGoalFromFirebase(goalId).then(() => {
                    renderGoalCompassPage(); // 화면 새로고침
                    showNotification('목표가 삭제되었습니다.');
                });
            }
        } else if (target.matches('.edit-btn')) {
            const goalToEdit = allGoals.find(g => g.id === goalId);
            if (goalToEdit) showAddGoalModal(goalToEdit);

        } else if (target.matches('.complete-btn')) {
            if (confirm('이 목표를 완료 처리하고 보관하시겠습니까?')) {
                completeGoalInFirebase(goalId).then(() => {
                    renderGoalCompassPage(); // 화면 새로고침
                    showNotification('목표 달성을 축하합니다! 명예의 전당에 보관되었습니다.', 'success');
                });
            }
        }
    };
}
// ▲▲▲ 여기까지 08/21(수정일) setupGoalPageEventListeners 최종 임무 수첩 (완전판) ▲▲▲



/** 
// ▼▼▼ 08/18(수정일) '명예의 전당' 표시 로직 추가 ▼▼▼
async function renderGoalCompassPage() {
    if (!currentUser) return;
    const page = document.getElementById('goal-compass-page');
    const list = document.getElementById('goalsList');
    const completedList = document.getElementById('completedGoalsList');
    const activeSection = document.getElementById('activeGoalsSection');
    const completedSection = document.getElementById('completedGoalsSection');
    const goalPageTitle = document.getElementById('goalPageTitle'); // 제목 요소를 변수로 지정

    list.innerHTML = '로딩 중...';

    try {
        const goals = await getUserGoals(currentUser.uid);
        const activeGoals = goals.filter(g => g.status !== 'completed');
        const completedGoals = goals.filter(g => g.status === 'completed');

        // --- 진행 중 목표 렌더링 (기존 로직과 거의 동일) ---
        list.innerHTML = '';
        if (activeGoals.length === 0) {
            list.innerHTML = `<div class="empty-state">...</div>`;
        } else {
                activeGoals.forEach(goal => {
                let pct = 0;
                if (goal.direction === 'decrease') {
                    const startValue = goal.startValue || goal.currentValue;
                    const range = startValue - goal.targetValue;
                    const achieved = startValue - goal.currentValue;
                    if (range > 0) {
                        pct = Math.min(100, Math.max(0, Math.round((achieved / range) * 100)));
                    }
                } else {
                    if (goal.targetValue > 0) {
                        pct = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
                    }
                }

                    // --- 완료된 목표(명예의 전당) 렌더링 ---
                    completedList.innerHTML = '';
                    if (completedGoals.length > 0) {
                        showCompletedBtn.style.display = 'inline-block'; // 완료된 목표가 있을 때만 버튼 표시
                        completedGoals.forEach(goal => {
                            const card = document.createElement('div');
                            card.className = 'goal-card goal-achieved'; // 완료 스타일 적용
                            card.innerHTML = `
                                <div class="goal-card-header">
                                    <div style="font-weight:800;">🏆 ${goal.name}</div>
                                    <div style="font-size: 0.8rem; color: var(--text-secondary);">
                                        완료일: ${new Date(goal.completedAt.seconds * 1000).toLocaleDateString()}
                                    </div>
                                </div>
                                <div style="margin-top: 1rem; text-align: center; font-weight: 600;">
                                    최종 성과: ${goal.currentValue} / ${goal.targetValue} ${goal.unit || 'P'}
                                </div>
                            `;
                            completedList.appendChild(card);
                        });
                    } else {
                        showCompletedBtn.style.display = 'none';
                    }



                const deg = Math.round(360 * (pct / 100));
                const ddayInfo = getGoalDdayInfo(goal.startDate, goal.endDate);
                const kpi = `${goal.currentValue || 0} / ${goal.targetValue || 0} ${goal.unit || ''}`;

                const card = document.createElement('div');
                card.className = 'goal-card';
                
                let actionButtonsHTML = '';
                if (pct >= 100) {
                    card.classList.add('goal-achieved');
                    actionButtonsHTML = `<button class="complete-btn" data-goal-id="${goal.id}">🏆 완료 처리</button>`;
                } else {
                    actionButtonsHTML = `
                        <button class="edit-btn" data-goal-id="${goal.id}">편집</button>
                        <button class="delete-btn" data-goal-id="${goal.id}">삭제</button>
                    `;
                }

                // --- ▼▼▼ 이전에 누락되었던 '진척도 표시' HTML 부분 ▼▼▼ ---
                card.innerHTML = `
                    <div class="goal-card-header">
                        <div style="font-weight:800;">${goal.name}</div>
                        <div>${actionButtonsHTML}</div>
                    </div>
                    <div style="color:#6b7280; font-size:0.85rem; margin-bottom:0.5rem;">
                        ${goal.goalType === 'points' ? '포인트 목표' : `단위 목표 (${getAreaName(goal.area)})`} · 기간: ${goal.startDate} ~ ${goal.endDate}
                    </div>
                    <div class="goal-progress-wrap">
                        <div class="goal-meter" style="--deg:${deg}deg;">${pct}%</div>
                        <div style="flex:1;">
                            <div style="font-weight:700; margin-bottom:4px;">달성 현황</div>
                            <div style="color:#374151; font-weight:700; margin-bottom:6px;">${kpi}</div>
                            <div style="color:#6b7280;">${ddayInfo.label}</div>
                            <div id="pace-${goal.id}" style="color:#10b981; font-weight:600; margin-top:6px;"></div>
                        </div>
                    </div>
                `;
                // --- ▲▲▲ '진척도 표시' HTML 복원 완료 ▲▲▲ ---

                list.appendChild(card);
                
                const paceMsg = getPaceMessage(goal);
                const paceEl = document.getElementById(`pace-${goal.id}`);
                if (paceEl && paceMsg) paceEl.textContent = paceMsg;
            });
        }
        
        page.onclick = (e) => {
            console.log('📌 [GoalPage Click]:', e.target);
            // '+ 새 목표' 버튼 클릭 시
            if (e.target.id === 'openAddGoalBtn') {
                console.log('🎯 새 목표 추가 모달 호출');
                showAddGoalModal();
            }
            // '삭제' 버튼 클릭 시
            if (e.target.matches('.delete-btn')) {
                const goalId = e.target.dataset.goalId;
                console.log(`🎯 목표 삭제 요청: ${goalId}`);
                if (confirm('이 목표를 삭제할까요?')) {
                    deleteGoalFromFirebase(goalId).then(() => {
                        renderGoalCompassPage();
                        showNotification('목표가 삭제되었습니다.');
                    });
                }
            }
            // '편집' 버튼 클릭 시
            if (e.target.matches('.edit-btn')) {
                const goalId = e.target.dataset.goalId;
                const goalToEdit = goals.find(g => g.id === goalId);
                if (goalToEdit) {
                    console.log(`🎯 목표 편집 요청: ${goalId}`, goalToEdit);
                    showAddGoalModal(goalToEdit);
                }
            }
              // '완료 처리' 버튼 클릭 시
             if (e.target.matches('.complete-btn')) {
                const goalId = e.target.dataset.goalId;
                console.log(`🏆 목표 완료 처리 요청: ${goalId}`);
                if (confirm('이 목표를 완료 처리하고 보관하시겠습니까?')) {
                    completeGoalInFirebase(goalId).then(() => {
                        renderGoalCompassPage(); // 목록을 새로고침하여 완료된 목표를 사라지게 함
                        showNotification('목표 달성을 축하합니다! 명예의 전당에 보관되었습니다.', 'success');
            });
                }
            }
            if (e.target.id === 'showCompletedGoalsBtn') {
                activeSection.style.display = 'none';
                completedSection.style.display = 'block';
                document.getElementById('goalPageTitle').textContent = '🏆 명예의 전당';
            }
            if (e.target.id === 'showActiveGoalsBtn') {
                activeSection.style.display = 'block';
                completedSection.style.display = 'none';
                document.getElementById('goalPageTitle').textContent = '🧭 목표 나침반';
            }
        };
            

        
    } catch (error) {
        console.error("목표 렌더링 실패:", error);
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-title">목표를 불러올 수 없습니다</div>
                <div class="empty-state-description">
                    데이터베이스 권한(Firestore 보안 규칙)이 올바르게 설정되었는지 확인해주세요.
                    <br><br>
                    <small>에러: ${error.message}</small>
                </div>
            </div>
        `;
    }
}
// ▲▲▲ 여기까지 08/17(수정일) renderGoalCompassPage 전우 완전 복원 ▲▲▲
*/

function getAreaName(id) {
    const area = userAreas.find(a => a.id === id);
    return area ? area.name : (id || '미지정');
}

function getGoalDdayInfo(start, end) {
    const today = new Date();
    const endDate = new Date(end);
    const startDate = new Date(start);
    today.setHours(0,0,0,0);
    endDate.setHours(0,0,0,0);
    startDate.setHours(0,0,0,0);

    const diffDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.max(0, Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)));
    const label = diffDays >= 0 ? `남은 기간: D-${diffDays} (경과 ${elapsedDays}일)` : `종료됨 (종료 후 ${Math.abs(diffDays)}일)`;
    return { diffDays, elapsedDays, label };
}

function getPaceMessage(goal) {
    if (!goal.startDate || !goal.endDate || !goal.targetValue) return '';
    const { elapsedDays, diffDays } = getGoalDdayInfo(goal.startDate, goal.endDate);
    if (diffDays < 0) return '목표 기간이 종료되었습니다.';
    
    const elapsed = Math.max(1, elapsedDays);
    const ratePerDay = (goal.currentValue || 0) / elapsed;
    const remaining = Math.max(0, goal.targetValue - (goal.currentValue || 0));

    if (ratePerDay <= 0) return '진행률을 계산할 수 없습니다.';
    
    const estimateDaysNeeded = Math.ceil(remaining / ratePerDay);
    
    if (estimateDaysNeeded <= diffDays) {
        return `현재 속도라면 목표일보다 ${diffDays - estimateDaysNeeded}일 빠르게 달성 가능해요!`;
    } else {
        return `현재 속도라면 목표일보다 ${estimateDaysNeeded - diffDays}일 늦어질 수 있어요.`;
    }
}

// ▼▼▼ 08/18(수정일) showAddGoalModal 임무 단순화 ▼▼▼
function showAddGoalModal(goal = null) {
    console.log('📌 [showAddGoalModal]: 모달 표시 시작. 편집 모드:', !!goal);
    isEditingGoal = !!goal;
    editingGoalId = goal ? goal.id : null;

    const modal = document.getElementById('addGoalModal');
    const typeSelect = document.getElementById('goalTypeSelect');
    
    // 폼 필드를 채웁니다.
    populateGoalModalFields(goal);
    
    // 편집 모드일 경우, 목표 유형 변경을 금지합니다.
    typeSelect.disabled = isEditingGoal;

    // UI의 초기 상태를 강제로 업데이트합니다.
    // Event를 수동으로 발생시켜, setupAllEventListeners에 있는 리스너가 작동하도록 합니다.
    typeSelect.dispatchEvent(new Event('change'));
    
    // 최종적으로 모달을 전장에 표시합니다.
    modal.style.display = 'flex';
}
// ▲▲▲ 여기까지 08/18(수정일) showAddGoalModal 임무 단순화 ▲▲▲


function hideAddGoalModal() {
    document.getElementById('addGoalModal').style.display = 'none';
}

// ▼▼▼ 2025-08-17(수정일) populateGoalModalFields 장군 복원 ▼▼▼
// ▼▼▼ 08/18(수정일) populateGoalModalFields 최종 완전판 (비밀 임무 포함) ▼▼▼
function populateGoalModalFields(goal = null) {
    console.log('📌 [populateGoalModalFields]: 폼 필드 채우기 시작. 전달된 목표:', goal);

    const safeSetValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        } else {
            console.warn(`[safeSetValue]: ID가 '${id}'인 요소를 찾을 수 없습니다. 값을 설정할 수 없습니다.`);
        }
    };

    // --- ▼▼▼ 비밀 임무 1: '연결 영역' 드롭다운 목록 생성 ▼▼▼ ---
    const selArea = document.getElementById('goalArea');
    if (selArea) {
        selArea.innerHTML = ''; // 기존 목록 초기화
        userAreas.forEach(area => {
            const opt = document.createElement('option');
            opt.value = area.id;
            opt.textContent = area.name;
            selArea.appendChild(opt);
        });
    }
    // --- ▲▲▲ 비밀 임무 1 종료 ▲▲▲ ---

    // --- ▼▼▼ 비밀 임무 2: '루틴 연결하기' 체크박스 목록 생성 ▼▼▼ ---
    const containerRoutines = document.getElementById('linkableRoutines');
    if (containerRoutines) {
        containerRoutines.innerHTML = ''; // 기존 목록 초기화
        sampleRoutines
            .filter(r => r.type === 'number' || r.type === 'reading') // 숫자/독서 타입만 필터링
            .forEach(r => {
                const id = `link-r-${r.id}`;
                const label = `${r.name} (${getTypeLabel(r.type)})`;
                const item = document.createElement('div');
                item.className = 'area-checkbox-item';
                item.innerHTML = `<input type="checkbox" id="${id}" value="${r.id}" /> <label for="${id}">${label}</label>`;
                containerRoutines.appendChild(item);
            });
    }
    // --- ▲▲▲ 비밀 임무 2 종료 ▲▲▲ ---

    const goalType = goal ? goal.goalType : 'units';
    safeSetValue('goalTypeSelect', goalType);
    
    if (goal) {
        // [수정 모드]
        console.log('📝 수정 모드: 기존 데이터로 폼을 채웁니다.');
        if (goal.goalType === 'points') {
            safeSetValue('goalNamePoints', goal.name || '');
            safeSetValue('goalTargetValuePoints', goal.targetValue || '');
        } else { // units
            safeSetValue('goalNameUnits', goal.name || '');
            safeSetValue('goalTargetValueUnits', goal.targetValue || '');
            safeSetValue('goalCurrentValue', goal.currentValue || 0);
            safeSetValue('goalUnit', goal.unit || '');
            safeSetValue('goalDirection', goal.direction || 'increase');
            safeSetValue('goalUpdateMethod', goal.updateMethod || 'accumulate');
        }
        
        safeSetValue('goalStartDate', goal.startDate || '');
        safeSetValue('goalEndDate', goal.endDate || '');
        safeSetValue('goalArea', goal.area || '');

        if (goal.linkedRoutines && Array.isArray(goal.linkedRoutines)) {
            goal.linkedRoutines.forEach(routineId => {
                const checkbox = document.getElementById(`link-r-${routineId}`);
                if (checkbox) checkbox.checked = true;
            });
        }
    } else {
        // [추가 모드]
        console.log('✨ 추가 모드: 폼을 초기화합니다.');
        safeSetValue('goalNameUnits', '');
        safeSetValue('goalTargetValueUnits', '');
        safeSetValue('goalCurrentValue', 0);
        safeSetValue('goalUnit', '');
        safeSetValue('goalDirection', 'increase');
        safeSetValue('goalUpdateMethod', 'accumulate');
        safeSetValue('goalNamePoints', '');
        safeSetValue('goalTargetValuePoints', '');
        safeSetValue('goalStartDate', todayDateString);
        safeSetValue('goalEndDate', '');
    }
    console.log('🏁 [populateGoalModalFields]: 폼 필드 설정 완료');
}
// ▲▲▲ 여기까지 08/18(수정일) populateGoalModalFields 최종 완전판 (비밀 임무 포함) ▲▲▲
// --- 페이지 네비게이션 (Page Navigation) ---

// ▼▼▼ 08/19(수정일) 페이지 전환 통합 지휘관 함수 추가 ▼▼▼
function showPage(pageIdToShow) {
    console.log(`[showPage] >> "${pageIdToShow}" 페이지로 전환합니다.`);
    // 1. ★★★ 핵심 수정: 새로운 전장 지도(HTML ID)에 맞게 모든 페이지 ID를 업데이트합니다.
    const allPageIds = ['home-page', 'goal-page', 'stats-page', 'rewards-page', 'manage-page'];
    
    // 2. 모든 페이지를 일단 시야에서 숨깁니다.
    allPageIds.forEach(pageId => {
        const page = document.getElementById(pageId);
        if (page) {
            page.style.display = 'none';
        }
    });

    // 3. 목표가 되는 페이지만을 전면에 내세웁니다.
    const pageToShow = document.getElementById(pageIdToShow);
    if (pageToShow) {
        pageToShow.style.display = 'block';
    } else {
        console.error(`[showPage] 비상: ID가 "${pageIdToShow}"인 페이지를 찾을 수 없습니다.`);
    }
}

// ▲▲▲ 여기까지 08/19(수정일) 페이지 전환 통합 지휘관 함수 추가 ▲▲▲


// ▼▼▼ 08/19(수정일) 각 페이지 전환 함수 임무 단순화 ▼▼▼
function showHomePage() {
    showPage('home-page'); 
    document.getElementById('incomplete-section').style.display = 'block'; // 홈 화면의 기본 섹션만 표시
    document.querySelector('.daily-progress').style.display = 'block';
    renderRoutines();
}

// ▼▼▼ 08/20(수정일) showManagePage 최종 안정화 ▼▼▼
// ▼▼▼ 2025-08-24(수정일) 책임과 역할이 명확해진 최종 버전 ▼▼▼
function showManagePage() {
    console.log('📌 [showManagePage]: 관리 페이지 표시');

    // 임무 1: 페이지 전환은 총괄 지휘관(showPage)에게 보고한다.
    showPage('manage-page');

    // 임무 2: 자신의 페이지가 준비되면, 내용물 생성을 담당하는 예하 부대들을 호출한다.
    renderAreaStats();
    renderManagePage();
}
// feat(stats): Implement basic UI and rendering for statistics page

function showDashboardPage() {
    // 다른 페이지 숨기기
    showPage('stats-page');


    // 통계 데이터 렌더링 함수 호출
    renderStatsPage();
}

function showGoalCompassPage() {
    showPage('goal-page'); 
    renderGoalCompassPage();
}
// ▲▲▲ 여기까지 08/19(수정일) 각 페이지 전환 함수 임무 단순화 ▲▲▲

// ▼▼▼ 2025-08-25(수정일) 보상 요청 수신 및 렌더링 부대 추가 ▼▼▼

// [주력 부대] Firestore에서 '대기 중'인 보상 요청을 가져와 화면에 렌더링합니다.
async function loadAndRenderRewardRequests() {
    if (!currentUser || !currentUser.familyId) return;

    const container = document.getElementById('reward-approval-section');
    const listId = 'reward-request-list'; // 목록을 담을 div의 ID
    // 기존에 있던 p 태그는 유지하고, 그 아래에 목록 div를 추가/관리합니다.
    let listContainer = document.getElementById(listId);
    if (!listContainer) {
        listContainer = document.createElement('div');
        listContainer.id = listId;
        listContainer.className = 'manage-routine-list'; // 기존 스타일 재활용
        container.appendChild(listContainer);
    }
    
    const description = container.querySelector('.panel-description');
    listContainer.innerHTML = '요청 목록을 확인하는 중...';

    const requestsRef = db.collection('families').doc(currentUser.familyId).collection('reward_requests');
    const snapshot = await requestsRef.where('status', '==', 'pending').orderBy('requestedAt', 'desc').get();

    if (snapshot.empty) {
        description.textContent = '현재 대기 중인 요청이 없습니다.';
        listContainer.innerHTML = '';
        return;
    }

    description.textContent = '아래 요청을 승인하거나 거절할 수 있습니다.';
    listContainer.innerHTML = ''; // 로딩 메시지 제거

    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    requests.forEach(req => {
        const requestElement = createRewardRequestElement(req);
        listContainer.appendChild(requestElement);
    });
}

// [지원 부대] 개별 요청 아이템의 HTML 구조를 생성합니다.
function createRewardRequestElement(request) {
    const item = document.createElement('div');
    item.className = 'manage-routine-item';
    item.innerHTML = `
        <div class="routine-main-info" style="flex-grow: 1;">
            <div class="routine-main-name">
                ${request.childName} → <span style="font-weight: 800;">${request.rewardName}</span>
            </div>
            <div class="routine-main-details" style="font-weight: 600; color: var(--primary);">
                ✨ ${request.points} P
            </div>
        </div>
        <div class="routine-controls">
            <button class="btn-approve-reward" data-id="${request.id}" data-child-id="${request.childId}" data-points="${request.points}" style="background: var(--success);">승인</button>
            <button class="btn-reject-reward" data-id="${request.id}" style="background: var(--error);">거절</button>
        </div>
    `;
    return item;
}

// ▲▲▲ 여기까지 2025-08-25(수정일) 보상 요청 수신 및 렌더링 부대 추가 ▲▲▲


// ▼▼▼ 2025-08-25(수정일) 보상 요청 결재(승인/거절) 부대 추가 ▼▼▼

// ▼▼▼ 2025-08-25(수정일) 보상 승인 시 포인트 차감 로직 제거 ▼▼▼
// [승인 장교] '승인' 버튼 클릭 시, 상태만 'approved'로 변경합니다.
async function approveRewardRequest(requestId) {
    if (!confirm("이 요청을 승인하여 자녀에게 보상 쿠폰을 발급하시겠습니까?")) return;

    try {
        const requestRef = db.collection('families').doc(currentUser.familyId).collection('reward_requests').doc(requestId);
        await requestRef.update({ 
            status: 'approved',
            processedAt: new Date()
        });

        showNotification("요청을 승인했습니다. 자녀가 쿠폰을 사용할 수 있습니다.", "success");
        await loadAndRenderRewardRequests(); // 목록 새로고침

    } catch (error) {
        console.error("❌ 보상 승인 실패:", error);
        showNotification("승인 처리에 실패했습니다.", "error");
        await loadAndRenderRewardRequests(); // 실패 시에도 목록 새로고침
    }
}
// ▲▲▲ 여기까지 2025-08-25(수정일) 보상 승인 시 포인트 차감 로직 제거 ▲▲▲
// [거절 장교] '거절' 버튼 클릭 시 실행될 작전
async function rejectRewardRequest(requestId) {
    if (!confirm("정말로 이 요청을 거절하시겠습니까?")) return;
    try {
        const requestRef = db.collection('families').doc(currentUser.familyId).collection('reward_requests').doc(requestId);
        await requestRef.update({ status: 'rejected', processedAt: new Date() });
        showNotification("요청을 거절했습니다.", "info");
        await loadAndRenderRewardRequests(); // 목록 새로고침
    } catch (error) {
        console.error("❌ 보상 거절 실패:", error);
        showNotification("요청 거절에 실패했습니다.", "error");
    }
}

// ▲▲▲ 여기까지 2025-08-25(수정일) 보상 요청 결재(승인/거절) 부대 추가 ▲▲▲


  // ▼▼▼ 2025-08-24 showRewardsPage 함수 신설 ▼▼▼
    // showGoalCompassPage 함수 아래에 추가하는 것을 권장합니다.
    function showRewardsPage() {
        showPage('rewards-page'); // "rewards-page를 보여줘" 라고 보고
        renderRewardManagement(); // 보상 관리 목록 렌더링
        loadAndRenderRewardRequests(); // ★★★ 이 명령을 추가합니다.
    }
    // ▲▲▲ 여기까지 2025-08-24 showRewardsPage 함수 신설 ▲▲▲



// --- 대시보드 함수 (Dashboard) ---
   // 독서 데이터 (임시 데이터)
        let monthlyGoalBooks = 3; // 월간 목표 완독 권수 (사용자 설정 가능하도록 확장)
        let currentCompletedBooks = 1.5; // 현재까지 완독한 권수 (실제 독서 데이터에서 계산)
        let lastMonthCompletedBooks = 1.2; // 지난달 완독 권수 (실제 독서 데이터에서 계산)
        let weeklyReadingData = [
            { date: '7/8', pages: 50 }, { date: '7/9', pages: 30 }, { date: '7/10', pages: 60 }, { date: '7/11', pages: 40 }, { date: '7/12', pages: 70 }, { date: '7/13', pages: 0 }, { date: '7/14', pages: 20 },
            { date: '7/15', pages: 45 }, { date: '7/16', pages: 55 }, { date: '7/17', pages: 35 }, { date: '7/18', pages: 65 }, { date: '7/19', pages: 0 }, { date: '7/20', pages: 25 }, { date: '7/21', pages: 50 },
            { date: '7/22', pages: 60 }, { date: '7/23', pages: 40 }, { date: '7/24', pages: 70 }, { date: '7/25', pages: 30 }, { date: '7/26', pages: 50 }, { date: '7/27', pages: 0 }, { date: '7/28', pages: 40 },
            { date: '7/29', pages: 70 }, { date: '7/30', pages: 50 }, { date: '7/31', pages: 80 }, { date: '8/1', pages: 60 }, { date: '8/2', pages: 40 }, { date: '8/3', pages: 0 }, { date: '8/4', pages: 30 }
        ];
        let completedBooks = [ // 완독 도서 데이터 (임시 데이터)
            { title: '데미안', author: '헤르만 헤세', completedDate: '2025-07-20', cover: 'https://placehold.co/100x150/a78bfa/ffffff?text=Demian' },
            { title: '사피엔스', author: '유발 하라리', completedDate: '2025-06-15', cover: 'https://placehold.co/100x150/f87171/ffffff?text=Sapiens' },
            { title: '팩트풀니스', author: '한스 로슬링', completedDate: '2025-05-10', cover: 'https://placehold.co/100x150/34d399/ffffff?text=Factfulness' },
            { title: '돈의 심리학', author: '모건 하우젤', completedDate: '2025-04-22', cover: 'https://placehold.co/100x150/60a5fa/ffffff?text=Money' },
            { title: '클린 코드', author: '로버트 C. 마틴', completedDate: '2025-03-01', cover: 'https://placehold.co/100x150/fbbf24/ffffff?text=Clean+Code' },
        ];
    
        // --- 독서 습관 대시보드 함수 ---
        function updateReadingDashboard() {
            // 1. 월간 독서 목표 달성 현황 업데이트 (현재는 더미 데이터 사용)
            const percentage = (currentCompletedBooks / monthlyGoalBooks) * 100;
            document.getElementById('monthlyGoalText').textContent =
                `목표 ${monthlyGoalBooks}권 중 ${currentCompletedBooks}권 달성 (${percentage.toFixed(0)}%)`;
            document.getElementById('monthlyProgressBar').style.width = `${percentage}%`;
    
            const comparisonText = `지난달 대비 +${(currentCompletedBooks - lastMonthCompletedBooks).toFixed(1)}권 증가`;
            document.getElementById('monthlyComparison').textContent = comparisonText;
    
            // 2. 주간 독서량 추이 차트 그리기 (현재는 더미 데이터 사용)
            const labels = weeklyReadingData.map(data => data.date);
            const data = weeklyReadingData.map(data => data.pages);
    
            const ctx = document.getElementById('weeklyReadingChart').getContext('2d');
            // 기존 차트 인스턴스가 있다면 파괴하고 새로 그립니다. (탭 전환 시 차트 중복 생성 방지)
            if (window.weeklyReadingChartInstance) {
                window.weeklyReadingChartInstance.destroy();
            }
            window.weeklyReadingChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '일별 독서 페이지 수',
                        data: data,
                        borderColor: '#3b82f6', // blue-500
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#3b82f6',
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false // 범례 숨기기
                        },
                        title: {
                            display: true,
                            text: '지난 4주간의 일별 독서량',
                            font: {
                                size: 16,
                                weight: 'bold'
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: '날짜',
                                font: {
                                    size: 14
                                }
                            },
                            grid: {
                                display: false // x축 그리드 라인 숨기기
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: '페이지 수',
                                font: {
                                    size: 14
                                }
                            },
                            ticks: {
                                callback: function(value) {
                                    return value + 'p';
                                }
                            }
                        }
                    }
                }
            });
    
            // 3. 완독 도서 목록 업데이트
            const listContainer = document.getElementById('completedBooksList');
            listContainer.innerHTML = ''; // 기존 목록 초기화
    
            // sampleRoutines에서 완독된 독서 루틴을 필터링하여 표시
            const actualCompletedBooks = sampleRoutines.filter(r => r.type === 'reading' && r.currentPage >= r.endPage);
            actualCompletedBooks.forEach(routine => {
                const bookCard = document.createElement('div');
                bookCard.className = 'bg-white rounded-lg shadow-md overflow-hidden flex flex-col items-center p-4 transform transition-transform hover:scale-105';
                bookCard.innerHTML = `
                    <img src="${routine.cover || 'https://placehold.co/100x150/cccccc/333333?text=No+Cover'}" alt="${routine.bookTitle} 표지" class="w-24 h-36 object-cover rounded-md mb-3 shadow-sm">
                    <h3 class="text-lg font-semibold text-gray-800 text-center mb-1">${routine.bookTitle}</h3>
                    <p class="text-sm text-gray-600 text-center">현재 페이지: ${routine.currentPage}</p>
                    <p class="text-xs text-gray-500 mt-2">완독 예정: ${getEstimatedCompletionDate(routine)}</p>
                `;
                listContainer.appendChild(bookCard);
            });
        }

  // --- 운동 대시보드 함수 (추후 구현 예정) ---
        function updateExerciseDashboard() {
            console.log("운동 대시보드 업데이트");
            // 운동 대시보드 관련 데이터를 로드하고 시각화를 업데이트하는 로직이 여기에 들어갑니다.
        }
    
        // --- 수면 시간 대시보드 함수 (추후 구현 예정) ---
        function updateSleepDashboard() {
            console.log("수면 시간 대시보드 업데이트");
            // 수면 시간 대시보드 관련 데이터를 로드하고 시각화를 업데이트하는 로직이 여기에 들어갑니다.
        }
       
   // --- 탭 전환 로직 ---
        function openDashboardTab(tabName) {
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
    
            const tabButtons = document.querySelectorAll('.tab-button');
            tabButtons.forEach(button => {
                button.classList.remove('active');
            });
    
            document.getElementById(tabName).classList.add('active');
            document.querySelector(`.tab-button[data-tab="${tabName}"]`).classList.add('active');
    
            // 탭 활성화 시 해당 대시보드 데이터 업데이트 함수 호출
            if (tabName === 'reading') {
                updateReadingDashboard();
            } else if (tabName === 'exercise') {
                updateExerciseDashboard();
            } else if (tabName === 'sleep') {
                updateSleepDashboard();
            }
        }


       
// --- 유틸리티 함수 (Utilities) ---

    // Debug log function
        function debugLog(...args) {
            if (DEBUG_MODE) {
                console.log(...args);
            }
        }
function getTimeEmoji(time) { return { 'morning': '🌅', 'afternoon': '🌞', 'evening': '🌙' }[time] || '⏰'; }
function getTimeLabel(time) { return { 'morning': '아침', 'afternoon': '점심', 'evening': '저녁' }[time] || '시간'; }
function getFrequencyLabel(frequency) { return { 'daily': '매일', 'weekday': '평일', 'weekend': '주말' }[frequency] || frequency; }
function getTypeIcon(type) { return { 'yesno': '✅', 'number': '🔢', 'time': '⏰', 'reading': '📚' }[type] || '📝'; }
function getTypeLabel(type) { return { 'yesno': '체크', 'number': '숫자', 'time': '시간', 'reading': '독서' }[type] || type; }
function getRoutineValueDisplay(routine) {
            if (routine.status === 'skipped') return '건너뜀';
            if (routine.type === 'yesno') return routine.value === true ? '완료' : '미완료';
            
            if (routine.type === 'reading') {
                const progress = getReadingProgress(routine);
                if (routine.dailyPages && routine.dailyReadPagesToday > 0) {
                    const dailyProgressPercent = Math.min(100, Math.round((routine.dailyReadPagesToday / routine.dailyPages) * 100));
                    return `${routine.dailyReadPagesToday}/${routine.dailyPages}p (${dailyProgressPercent}%)`;
                }
                return `${routine.currentPage}/${routine.endPage}p (${progress}%)`;
            }
            
            if (routine.type === 'number') {
                if (routine.value !== null && routine.value !== undefined) {
                    const displayValue = `${routine.value} ${routine.unit || ''}`;
                    if (routine.continuous && routine.dailyGoal) {
                        const progress = Math.min(100, Math.round((routine.value / routine.dailyGoal) * 100));
                        return `${displayValue} (${progress}%)`;
                    }
                    return displayValue;
                }
                return routine.continuous ? '0 ' + (routine.unit || '') : '미완료';
            }
            
            if (routine.type === 'time') return routine.value || '미완료';
            
            return '';
        }
    
        function isGoalAchieved(routine) {
            if (routine.status === 'skipped') return false;
            if (routine.type === 'reading') return (routine.currentPage >= routine.endPage) || ((routine.dailyReadPagesToday || 0) >= routine.dailyPages);
            if (routine.type === 'number' && routine.dailyGoal !== null && routine.dailyGoal !== undefined) return routine.value !== null && routine.value >= routine.dailyGoal;
            return isRoutineCompleted(routine);
        }
    
        function isRoutineCompleted(routine) {
            if (routine.status === 'skipped') return false;
            if (isContinuousRoutine(routine) || isReadingRoutine(routine)) return routine.dailyGoalMetToday === true;
            if (routine.type === 'yesno') return routine.value === true;
            if (routine.type === 'number') return routine.value !== null && routine.value > 0;
            if (routine.type === 'time') return !!routine.value;
            return false;
        }
        
        // ▼▼▼ 08/17(수정일) 독서 루틴 진행률 및 예정일 계산 로직 수정 (기존 함수 전체 교체) ▼▼▼
        function getReadingProgress(routine) {
            if (routine.type !== 'reading' || !routine.endPage) return 0;

            // 전체 페이지 수 (시작 페이지 포함)
            const totalPages = routine.endPage - routine.startPage + 1;
            // 읽은 페이지 수 (현재 페이지까지)
            const readPages = routine.currentPage - routine.startPage + 1;

            console.log('📌 [getReadingProgress]: 루틴:', routine.name);
            console.log(`- 전체: ${totalPages}p, 읽은: ${readPages}p`);

            // 0보다 작거나 같은 값이 나오지 않도록 방어 로직 추가
            const progress = Math.max(0, Math.min(100, Math.round((readPages / totalPages) * 100)));
            
            console.log('🏁 [getReadingProgress]: 계산 완료, 결과:', progress);
            return progress;
        }

        // ▲▲▲ 여기까지 08/17(수정일) 독서 루틴 진행률 및 예정일 계산 로직 수정 ▲▲▲

    
        function getTodayReadingRange(routine) {
            if (routine.type !== 'reading') return null;
            const currentPage = routine.currentPage || routine.startPage - 1;
            const dailyPages = routine.dailyPages || 10;
            const todayStart = currentPage + 1;
            const todayEnd = Math.min(currentPage + dailyPages, routine.endPage);
            return { start: todayStart, end: todayEnd, pages: Math.max(0, todayEnd - todayStart + 1) };
        }
    
        // ▼▼▼ 08/17(수정일) 독서 루틴 진행률 및 예정일 계산 로직 수정 ▼▼▼

        function getEstimatedCompletionDate(routine) {
            if (routine.type !== 'reading' || routine.currentPage >= routine.endPage) return '완료';
        
            // 읽은 페이지 수 계산
            const readPagesCount = routine.currentPage - (routine.startPage - 1);
            // 남은 페이지 수 계산 (전체 페이지 수 - 읽은 페이지 수)
            const remainingPages = (routine.endPage - (routine.startPage - 1)) - readPagesCount;
            const dailyPages = routine.dailyPages || 10;
            const remainingDays = Math.ceil(remainingPages / dailyPages);
        
            const completionDate = new Date();
            completionDate.setDate(completionDate.getDate() + remainingDays);
            
            console.log('📌 [getEstimatedCompletionDate]: 루틴:', routine.name);
            console.log(`- 남은 페이지: ${remainingPages}p, 남은 날: ${remainingDays}일`);
            console.log('🏁 [getEstimatedCompletionDate]: 완료 예정일:', completionDate.toLocaleDateString('ko-KR'));
            return completionDate.toLocaleDateString('ko-KR');
        }
        // ▲▲▲ 여기까지 08/17(수정일) 독서 루틴 진행률 및 예정일 계산 로직 수정 ▲▲▲
    
        function isReadingRoutine(routine) { return routine.type === 'reading'; }
        function isContinuousRoutine(routine) { return routine.continuous === true; }
    
        function isRoutineInProgress(routine) {
            if (routine.status === 'skipped' || isRoutineCompleted(routine)) return false;
            if (routine.type === 'reading') return (routine.currentPage > (routine.startPage - 1)) && (routine.currentPage < routine.endPage);
            if (routine.type === 'number' && routine.continuous) return (routine.value || 0) > 0;
            return false;
        }
  
          
 function getCurrentTime() {
            const now = new Date();
            return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        }
    

// --- UI 효과 함수 (UI Effects) ---
function showNotification(message, type = 'success') {
            const existing = document.querySelector('.notification');
            if (existing) existing.remove();
            
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.innerHTML = `<span>${message}</span>`;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.animation = 'slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1) reverse';
                setTimeout(() => notification.remove(), 400);
            }, 4000);
        }


function showCompletionEffect() {
    const effectContainer = document.createElement('div');
    effectContainer.className = 'completion-effect';
    for (let i = 0; i < 30; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.top = `${Math.random() * 100 - 50}px`;
        piece.style.left = `${Math.random() * 100 - 50}px`;
        piece.style.transform = `scale(${Math.random()}) rotate(${Math.random() * 360}deg)`;
        effectContainer.appendChild(piece);
    }
    document.body.appendChild(effectContainer);
    setTimeout(() => effectContainer.remove(), 2000);
}

function showCelebrationMessage() {
    const celebrationMessages = [
        "🎉 잘하셨습니다! 또 하나의 루틴을 완료했네요!", "✨ 훌륭해요! 꾸준한 노력이 큰 변화를 만들어냅니다!", "🌟 대단해요! 오늘도 한 걸음 더 나아가셨네요!",
        "🎊 멋져요! 작은 실천이 모여 큰 성취가 됩니다!", "🏆 완벽해요! 꾸준함이 성공의 열쇠입니다!", "🎯 목표 달성! 정말 대단한 의지력이에요!",
        "💪 계속 이런 식으로 해나가세요! 최고입니다!", "🔥 열정적이네요! 이런 자세가 성공을 만듭니다!"
    ];
    const randomMessage = celebrationMessages[Math.floor(Math.random() * celebrationMessages.length)];
    showNotification(randomMessage, 'success');
}

       
// ====================================================================
// 7. 이벤트 리스너 설정 함수
// ====================================================================

// ▼▼▼ 2025-08-24(수정일) 잘못된 알림을 유발하는 구문 오류 수정 ▼▼▼
function renderCurrentPage() {
    if (!currentUser) {
        console.warn("⚠️ [renderCurrentPage] 지휘관(currentUser) 부재로 렌더링을 중단합니다.");
        return;
    }

    console.log(`[renderCurrentPage] >> "${activePage}" 페이지 렌더링을 시작합니다.`);

    // 페이지 전환 로직을 명확한 if-else if 구문으로 정리합니다.
    if (activePage === 'home') {
        showHomePage();
    } else if (activePage === 'goal') {
        showGoalCompassPage();
    } else if (activePage === 'stats') {
        showDashboardPage();
    } else if (activePage === 'manage') {
        showManagePage();
    } else if (activePage === 'rewards') {
        showRewardsPage();
    }
    

}
// ▲▲▲ 여기까지 2025-08-24(수정일) 잘못된 알림을 유발하는 구문 오류 수정 ▲▲▲

// ▼▼▼ 08/20(수정일) setupAllEventListeners 최종 안정화 ▼▼▼
function setupAllEventListeners() {
    console.log('📌 [setupAllEventListeners]: 모든 이벤트 리스너 설정 시작');

    // --- 하단 탭 바 명령 체계 ---
    const tabBar = document.querySelector('.bottom-tab-bar');
    if (tabBar) {
        tabBar.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-item');
            if (!button) return;

            // 모든 버튼에서 'active' 상태를 제거합니다.
            document.querySelectorAll('.tab-item').forEach(btn => btn.classList.remove('active'));
            // 클릭된 버튼에만 'active' 상태를 부여합니다.
            button.classList.add('active');
            
            activePage = button.dataset.page;
            renderCurrentPage();
        });
    }

    // --- 상단 관리 버튼 ---
    const navManageBtn = document.getElementById('navManageBtn');
    if (navManageBtn) {
        navManageBtn.addEventListener('click', () => {
             // 관리 페이지로 갈 때는 activePage 상태를 직접 변경하고 렌더링합니다.
            activePage = 'manage';
            renderCurrentPage();
        });
    }

    // --- 임무 3: 목표 유형 선택(드롭다운) UI 변경 명령 체계 구축 ---
    const goalTypeSelect = document.getElementById('goalTypeSelect');
    if (goalTypeSelect) {
        goalTypeSelect.addEventListener('change', () => {
            const unitsOptions = document.getElementById('goalUnitsOptions');
            const pointsOptions = document.getElementById('goalPointsOptions');
            if (unitsOptions && pointsOptions) {
                if (goalTypeSelect.value === 'points') {
                    unitsOptions.style.display = 'none';
                    pointsOptions.style.display = 'block';
                } else {
                    unitsOptions.style.display = 'block';
                    pointsOptions.style.display = 'none';
                }
            }
        });
    }

    // --- 임무 4: 관리 페이지 내 버튼 명령 체계 구축 ---
    const saveOrderBtn = document.getElementById('saveOrderBtn');
    if(saveOrderBtn) {
        saveOrderBtn.addEventListener('click', saveRoutineOrder);
    }
    const manageAreasBtn = document.getElementById('manageAreasBtn');
    if(manageAreasBtn) {
        manageAreasBtn.addEventListener('click', showManageAreasModal);
    }

    // ▼▼▼ 2025-08-24(수정일) 새 보상 추가 버튼 이벤트 리스너 추가 ▼▼▼
    const addRewardBtn = document.getElementById('addRewardBtn');
    if (addRewardBtn) {
        // showRewardModal()을 호출하여 보상 추가 모달을 열도록 명령합니다.
        addRewardBtn.addEventListener('click', () => showRewardModal(null));
    }
    // ▲▲▲ 여기까지 2025-08-24(수정일) 새 보상 추가 버튼 이벤트 리스너 추가 ▲▲▲

    // ▼▼▼ 2025-08-24(수정일) 보상 삭제 버튼 이벤트 리스너 추가 ▼▼▼
    const deleteRewardBtn = document.getElementById('deleteRewardBtn');
    if (deleteRewardBtn) {
        deleteRewardBtn.addEventListener('click', handleDeleteReward);
    }

    // ▼▼▼ 2025-08-25(수정일) 보상 요청 결재 버튼 이벤트 리스너 추가 ▼▼▼
// ▼▼▼ 2025-08-25(수정일) approveRewardRequest 호출부의 불필요한 인자 제거 ▼▼▼
const approvalSection = document.getElementById('reward-approval-section');
if (approvalSection) {
    approvalSection.addEventListener('click', (e) => {
        const target = e.target;
        const requestId = target.dataset.id;
        if (!requestId) return;

        if (target.matches('.btn-approve-reward')) {
            // ★★★ 핵심 수정: 불필요한 변수(childId, points) 없이 함수를 호출합니다. ★★★
            approveRewardRequest(requestId);
        } else if (target.matches('.btn-reject-reward')) {
            rejectRewardRequest(requestId);
        }
    });
}
// ▲▲▲ 여기까지 2025-08-25(수정일) approveRewardRequest 호출부의 불필요한 인자 제거 ▲▲▲    // ▲▲▲ 여기까지 2025-08-25(수정일) 보상 요청 결재 버튼 이벤트 리스너 추가 ▲▲▲

    // --- 통계 페이지 필터 버튼 ---
    document.getElementById('filter-weekly')?.addEventListener('click', () => {
        currentStatsPeriod = 'weekly';
        document.getElementById('filter-weekly').classList.add('active');
        document.getElementById('filter-monthly').classList.remove('active');
        renderStatsPage();
    });

    document.getElementById('filter-monthly')?.addEventListener('click', () => {
        currentStatsPeriod = 'monthly';
        document.getElementById('filter-monthly').classList.add('active');
        document.getElementById('filter-weekly').classList.remove('active');
        renderStatsPage();
    });
    
    // --- 새 루틴 추가 모달의 타입 변경 이벤트 ---
    document.getElementById('newRoutineType')?.addEventListener('change', (e) => {
        const selectedType = e.target.value;
        document.getElementById('newNumberOptions').style.display = selectedType === 'number' ? 'block' : 'none';
        document.getElementById('newReadingOptions').style.display = selectedType === 'reading' ? 'block' : 'none';
    });
    
    
    // --- 각종 모달 버튼들 (setupModal을 통해 일괄 설정) ---
    // ▼▼▼ 이 부분을 아래 코드로 교체해주세요 ▼▼▼
    setupModal('numberInputModal', hideNumberInputModal, handleNumberInputConfirm, 'numberInput');
    setupModal('timeInputModal', hideTimeInputModal, handleTimeInputConfirm, 'timeInput');
    setupModal('stepperInputModal', hideStepperModal, null, 'stepperConfirmBtn'); // steppConfirmBtn에 직접 연결되어 있으므로 null
    setupModal('wheelInputModal', hideWheelModal, handleWheelConfirm, 'wheelConfirmBtn');
    setupModal('readingSetupModal', hideReadingSetupModal, handleReadingSetupConfirm, 'readingSetupConfirm');
    setupModal('readingProgressModal', hideReadingProgressModal, handleReadingProgressConfirm, 'readingProgressConfirm');
    setupModal('addRoutineModal', hideAddRoutineModal, handleAddRoutineConfirm, 'addRoutineConfirm');
    setupModal('manageAreasModal', hideManageAreasModal, handleManageAreasConfirm);
    setupModal('addGoalModal', hideAddGoalModal, handleGoalConfirm, 'addGoalConfirm');
    setupModal('routineDetailModal', hideDetailStatsModal);
    setupModal('rewardModal', hideRewardModal, handleRewardConfirm);


    // ▲▲▲ 여기까지 교체 ▲▲▲
    // --- ESC로 모든 모달 닫기 ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(modal => modal.style.display = 'none');
        }
    });

    // --- 동적으로 생성되는 요소에 대한 이벤트 리스너 (루틴 타입 변경 등) ---
// ▼▼▼ 08/17(수정일) 중복 가능성 있는 이벤트 리스너 제거 ▼▼▼
// document.getElementById('openAddGoalBtn')?.addEventListener('click', showAddGoalModal); <-- 이 라인을 삭제!
// ▲▲▲ 여기까지 08/17(수정일) 중복 가능성 있는 이벤트 리스너 제거 ▲▲▲    
    // --- 대시보드 탭 관련 리스너 ---
    document.querySelectorAll('#dashboard-view .tab-button').forEach(button => {
        button.addEventListener('click', () => {
            openDashboardTab(button.dataset.tab);
        });
    });

}

// ▼▼▼ 이 함수를 아래 코드로 교체해주세요 ▼▼▼
function setupModal(modalId, hideFn, confirmFn = null, confirmInputId = null) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.warn(`⚠️ [setupModal]: ID가 "${modalId}"인 모달 요소를 찾을 수 없습니다. 이벤트 리스너 설정을 건너뜁니다.`);
        return;
    }
    
    console.log(`📌 [setupModal]: 모달("${modalId}") 이벤트 리스너 설정 시작`);

    modal.querySelector('.modal-close')?.addEventListener('click', hideFn);
    modal.querySelector('.btn-secondary')?.addEventListener('click', hideFn);
    modal.addEventListener('click', (e) => { 
        if (e.target === e.currentTarget) {
            console.log(`📌 [setupModal]: 모달("${modalId}") 외부 클릭 감지, 닫기 함수 호출`);
            hideFn();
        }
    });
    
    if (confirmFn) {
        const confirmBtn = modal.querySelector('.btn-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', confirmFn);
        } else {
             console.warn(`⚠️ [setupModal]: 모달 "${modalId}"에서 'btn-confirm' 버튼을 찾을 수 없습니다.`);
        }
    }
    if (confirmInputId) {
        const inputElement = document.getElementById(confirmInputId);
        if (inputElement) {
            inputElement.addEventListener('keypress', (e) => { 
                if (e.key === 'Enter') {
                    console.log(`📌 [setupModal]: 'Enter' 키 입력 감지, 확인 함수 호출`);
                    confirmFn();
                }
            });
        } else {
            console.warn(`⚠️ [setupModal]: ID가 "${confirmInputId}"인 입력 요소를 찾을 수 없습니다.`);
        }
    }
    console.log(`🏁 [setupModal]: 모달("${modalId}") 이벤트 리스너 설정 완료`);
}
// ▲▲▲ 여기까지 교체 ▲▲▲
// ▲▲▲ 여기까지 08/17(수정일) 모든 이벤트 리스너를 재구성한 최종 버전 ▲▲▲

// ▼▼▼ 이 함수를 아래 코드로 교체하세요 ▼▼▼
function setupModal(modalId, hideFn, confirmFn = null, confirmInputId = null) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelector('.modal-close')?.addEventListener('click', hideFn);
    modal.querySelector('.btn-secondary')?.addEventListener('click', hideFn);
    modal.addEventListener('click', (e) => { if (e.target === e.currentTarget) hideFn(); });
    
    // 'btn-confirm' 클래스를 가진 버튼을 명확히 찾아 이벤트를 연결합니다.
    if (confirmFn) {
        modal.querySelector('.btn-confirm')?.addEventListener('click', confirmFn);
    }
    if (confirmInputId) {
        document.getElementById(confirmInputId)?.addEventListener('keypress', (e) => { if (e.key === 'Enter') confirmFn(); });
    }
}
// ▲▲▲ 여기까지 교체 ▲▲▲


// 잘 작동함 코멘트 담기

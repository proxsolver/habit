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
// ▲▲▲ 여기까지 08/17(수정일) 목표 편집을 위한 전역 변수 추가 ▲▲▲

const DEBUG_MODE = true;
const MAX_AREAS = 5; // <-- 영역의 최대 갯수 저장

const today = new Date();
const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;



// ====================================================================
// 3. 앱 시작점 (Application Entry Point)
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
    // UI 요소 변수 선언
    const userInfoDiv = document.getElementById('user-info');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userNameSpan = document.getElementById('user-name');
    const userPhotoImg = document.getElementById('user-photo');
    const mainAppContent = document.querySelector('.container');
    const navButtons = document.querySelector('.navigation-buttons');
    const provider = new firebase.auth.GoogleAuthProvider();
    
    // ▼▼▼ 구글 로그인 설정 개선 ▼▼▼
    provider.addScope('profile');
    provider.addScope('email');
    
    // 로그인 방식을 리다이렉트로 변경 (팝업 문제 해결)
    loginBtn.addEventListener('click', async () => {
        try {
            // 모바일에서는 리다이렉트, 데스크톱에서는 팝업 시도
            if (window.innerWidth <= 768) {
                await firebase.auth().signInWithRedirect(provider);
            } else {
                await firebase.auth().signInWithPopup(provider);
            }
        } catch (error) {
            console.error("Login failed:", error);
            // 팝업이 실패하면 리다이렉트로 재시도
            if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
                try {
                    await firebase.auth().signInWithRedirect(provider);
                } catch (redirectError) {
                    console.error("Redirect login also failed:", redirectError);
                    showNotification('로그인에 실패했습니다. 페이지를 새로고침 후 다시 시도해주세요.', 'error');
                }
            }
        }
    });
    // ▲▲▲ 여기까지 교체 ▲▲▲

    logoutBtn.addEventListener('click', () => firebase.auth().signOut());

    // 로그인 상태 변경 감지
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            userInfoDiv.style.display = 'flex';
            loginBtn.style.display = 'none';
            userNameSpan.textContent = user.displayName;
            userPhotoImg.src = user.photoURL;
            mainAppContent.style.opacity = 1;
            navButtons.style.display = 'flex';
            await loadAllDataForUser(currentUser.uid);
            showHomePage();
        } else {
            currentUser = null;
            userInfoDiv.style.display = 'none';
            loginBtn.style.display = 'block';
            mainAppContent.style.opacity = 0.2;
            navButtons.style.display = 'none';
            sampleRoutines = []; userAreas = []; userStats = {};
            renderRoutines();
        }
    });

    // 리다이렉트 결과 처리
    firebase.auth().getRedirectResult()
        .then((result) => {
            if (result.user) {
                console.log('리다이렉트 로그인 성공:', result.user.displayName);
            }
        })
        .catch((error) => {
            console.error('리다이렉트 로그인 오류:', error);
        });

    // 모든 UI 이벤트 리스너 설정
    setupAllEventListeners();
});
// ▲▲▲ 여기까지 교체 ▲▲▲

// ====================================================================
// 4. 사용자 데이터 로직 (User Data Logic)
// ====================================================================

async function loadAllDataForUser(userId) {
    try {
        debugLog(`사용자(${userId}) 데이터 로드 시작...`);
        const userDocRef = db.collection('users').doc(userId);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            debugLog("신규 사용자 감지, 초기 데이터 생성 시작.");
            await uploadInitialDataForUser(userId);
        } else {
            const [routinesSnapshot, areasSnapshot, statsDoc] = await Promise.all([
                userDocRef.collection('routines').orderBy('order').get(),
                userDocRef.collection('areas').get(),
                userDocRef.collection('stats').doc('userStats').get()
            ]);

            sampleRoutines = routinesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            userAreas = areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            userStats = statsDoc.exists ? statsDoc.data() : {};
            debugLog('기존 사용자 데이터 로드 완료.');
        }
        await resetDailyProgressForUser(userId);
    } catch (error) {
        console.error("사용자 데이터 로드 실패: ", error);
        showNotification("데이터를 불러오는데 실패했습니다.", "error");
    }
}

async function uploadInitialDataForUser(userId) {
    const batch = db.batch();
    const userDocRef = db.collection('users').doc(userId);
    batch.set(userDocRef, { email: currentUser.email, name: currentUser.displayName, createdAt: new Date() });

    const INITIAL_SAMPLE_ROUTINES = [
        { id: "init_1", name: '첫 루틴: 운동하기', time: 'morning', type: 'yesno', frequency: 'daily', value: null, status: null, streak: 0, order: 0, active: true, areas: ['physical'], basePoints: 10 },
        { id: "init_2", name: '첫 루틴: 물 마시기', time: 'afternoon', type: 'number', frequency: 'daily', value: 0, status: null, streak: 0, unit: '잔', order: 1, active: true, inputType: 'stepper', min: 1, max: 20, step: 1, continuous: true, dailyGoal: 8, areas: ['physical'], basePoints: 5 },
    ];
    const DEFAULT_AREAS = [
    { id: 'health', name: '건강' },
    { id: 'relationships', name: '관계' },
    { id: 'work', name: '업무' }
    ];

    INITIAL_SAMPLE_ROUTINES.forEach(routine => {
        const docRef = userDocRef.collection('routines').doc();
        batch.set(docRef, { ...routine, id: docRef.id });
    });
    DEFAULT_AREAS.forEach(area => {
        const docRef = userDocRef.collection('areas').doc(area.id);
        batch.set(docRef, area);
    });
    const initialStats = {};
    DEFAULT_AREAS.forEach(area => { initialStats[area.id] = 0; });
    batch.set(userDocRef.collection('stats').doc('userStats'), initialStats);
    batch.set(userDocRef.collection('meta').doc('lastReset'), { date: todayDateString });
    
    await batch.commit();
    await loadAllDataForUser(userId);
}

async function resetDailyProgressForUser(userId) {
    const userDocRef = db.collection('users').doc(userId);
    const metaRef = userDocRef.collection('meta').doc('lastReset');
    
    const lastResetDoc = await metaRef.get();
    const lastResetDate = lastResetDoc.exists ? lastResetDoc.data().date : null;

    if (lastResetDate !== todayDateString) {
        debugLog(`사용자(${userId})의 일일 진행 상황 초기화 시작...`);
        const batch = db.batch();
        
        sampleRoutines.forEach(routine => {
            const routineRef = userDocRef.collection('routines').doc(String(routine.id));
            const updatedFields = {};
            
            if (!isGoalAchieved(routine)) {
                updatedFields.streak = 0;
            }
            
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
            updatedFields.pointsGivenToday = false;
            
            if (Object.keys(updatedFields).length > 0) {
                batch.update(routineRef, updatedFields);
            }
        });
        
        batch.set(metaRef, { date: todayDateString });
        
        try {
            await batch.commit();
            debugLog("일일 진행 상황 초기화 완료. 사용자 데이터 다시 로드.");
            await loadAllDataForUser(userId);
        } catch (error) {
            console.error("일일 진행 상황 초기화 실패: ", error);
        }
    } else {
        debugLog("일일 진행 상황 초기화 필요 없음. 이미 최신.");
    }
}

// ====================================================================
// 5. Firebase 데이터 처리 함수 (CRUD)
// ====================================================================

async function updateRoutineInFirebase(routineId, updatedFields) {
    if (!currentUser) return;
    const routineRef = db.collection('users').doc(currentUser.uid).collection('routines').doc(String(routineId));
    await routineRef.update(updatedFields);
    const index = sampleRoutines.findIndex(r => String(r.id) === String(routineId));
    if (index !== -1) {
        sampleRoutines[index] = { ...sampleRoutines[index], ...updatedFields };
        renderRoutines();
    }
}

async function updateRoutineOrderInFirebase(orderedRoutines) {
    if (!currentUser) return;
    const batch = db.batch();
    const routinesRef = db.collection('users').doc(currentUser.uid).collection('routines');
    orderedRoutines.forEach((routine, index) => {
        batch.update(routinesRef.doc(String(routine.id)), { order: index });
    });
    await batch.commit();
    sampleRoutines = orderedRoutines;
}

async function updateUserStatsInFirebase(updatedStats) {
    if (!currentUser) return;
    const statsRef = db.collection('users').doc(currentUser.uid).collection('stats').doc('userStats');
    await statsRef.set(updatedStats, { merge: true });
    userStats = updatedStats;
    renderAreaStats();
}

async function addRoutineToFirebase(newRoutineData) {
    if (!currentUser) return;
    const routinesRef = db.collection('users').doc(currentUser.uid).collection('routines');
    const docRef = routinesRef.doc();
    const newRoutine = { ...newRoutineData, id: docRef.id };
    await docRef.set(newRoutine);
    sampleRoutines.push(newRoutine);
    renderRoutines();
    showManagePage();
}

async function deleteRoutineFromFirebase(routineId) {
    if (!currentUser) return;
    await db.collection('users').doc(currentUser.uid).collection('routines').doc(routineId).delete();
}

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

async function deleteGoalFromFirebase(goalId) {
    if (!currentUser) return;
    const goalRef = db.collection('users').doc(currentUser.uid).collection('goals').doc(goalId);
    await goalRef.delete();
}

// ▼▼▼ 08/17(수정일) '누적하기' 방식의 목표 업데이트 버그 수정 ▼▼▼
async function updateGoalProgressByRoutine(routineId, reportData) {
    if (!currentUser) return;
    // 1. 보고서 유효성 1차 검사
    if (!reportData) {
        console.warn('⚠️ [updateGoalProgressByRoutine]: 유효하지 않은 보고 데이터(reportData)로 인해 작전을 중단합니다.');
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
        
        // 2. 목표의 '진행 방식'에 따라 다른 명령 하달
        if (goal.updateMethod === 'replace') {
            const finalValue = parseFloat(reportData.finalValue);
            // '대체' 방식은 전달받은 finalValue가 유효한 숫자인지 확인
            if (!isNaN(finalValue)) {
                console.log(`- 목표(${goal.name}): '대체' 방식으로 현재값을 ${finalValue}(으)로 업데이트합니다.`);
                batch.update(ref, {
                    currentValue: finalValue,
                    updatedAt: new Date()
                });
            } else {
                console.warn(`⚠️ [updateGoalProgressByRoutine]: '대체' 방식에 유효하지 않은 finalValue(${reportData.finalValue})가 전달되었습니다.`);
            }
        } else { // 기본값은 'accumulate'
            const deltaValue = parseFloat(reportData.delta);
            // ★★★ 핵심 수정: '누적' 방식은 delta가 0보다 큰 유효한 숫자인지 '반드시' 확인 ★★★
            if (!isNaN(deltaValue) && deltaValue > 0) {
                console.log(`- 목표(${goal.name}): '누적' 방식으로 현재값을 ${deltaValue}만큼 증가시킵니다.`);
                batch.update(ref, {
                    currentValue: firebase.firestore.FieldValue.increment(deltaValue),
                    updatedAt: new Date()
                });
            } else {
                 console.warn(`⚠️ [updateGoalProgressByRoutine]: '누적' 방식에 유효하지 않은 delta(${reportData.delta})가 전달되어 누적을 건너뜁니다.`);
            }
        }
    });
    await batch.commit();
    console.log('🏁 [updateGoalProgressByRoutine]: 모든 연결된 목표의 진척도 업데이트 완료.');
}
// ▲▲▲ 여기까지 08/17(수정일) '누적하기' 방식의 목표 업데이트 버그 수정 ▲▲▲

// feat(stats): Implement stats calculation function using collection group query

async function logRoutineHistory(routineId, dataToLog) {
    if (!currentUser) return;
    
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const historyRef = db.collection('users').doc(currentUser.uid)
                         .collection('routines').doc(String(routineId))
                         .collection('history').doc(dateString);
    
    try {
        await historyRef.set({
            routineId: routineId, // <-- 부모 루틴의 ID를 함께 저장
            date: dateString,
            ...dataToLog
        });
        debugLog(`History logged for routine ${routineId} on ${dateString}`);
    } catch (error) {
        console.error("Failed to log routine history:", error);
    }
}

// feat(stats): Implement stats calculation function using collection group query



// 기존 calculateStats 관련 코드를 모두 지우고 아래 코드로 교체하세요.

// script.js의 기존 calculateStats 함수를 이 코드로 교체하세요.

async function calculateStats(period = 'weekly') {
    if (!currentUser) return null;

    const historyQuery = db.collectionGroup('history')
                           .where('__name__', '>=', `users/${currentUser.uid}/`)
                           .where('__name__', '<', `users/${currentUser.uid}0/`);
    
    const historySnapshot = await historyQuery.get();
    const histories = historySnapshot.docs.map(doc => doc.data());

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    // --- 기간 필터에 따른 변수 설정 ---
    let dateFrom;
    let totalDays;
    if (period === 'monthly') {
        dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
        totalDays = today.getDate();
    } else { // weekly
        dateFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
        totalDays = 7;
    }
    dateFrom.setHours(0, 0, 0, 0);

    // --- 통계 계산 변수 초기화 ---
    let periodCompletions = 0;
    let periodTotalRoutines = 0;
    const areaPoints = { health: 0, relationships: 0, work: 0 };
    const areaCompletions = { health: 0, relationships: 0, work: 0 };
    let totalPoints = 0;
    
    // --- (복원된 부분) 바 차트용 데이터 변수 ---
    const weeklyActivityData = [0, 0, 0, 0, 0, 0, 0];
    const weeklyActivityLabels = [];
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const weekStartForBarChart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    weekStartForBarChart.setHours(0, 0, 0, 0);


    // --- 루틴 총 개수 및 바 차트 라벨 계산 ---
    for (let i = 0; i < totalDays; i++) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        const dayOfWeek = date.getDay();

        if (i < 7) { // 바 차트 라벨은 최근 7일 고정
            weeklyActivityLabels.unshift(`${date.getMonth() + 1}/${date.getDate()}(${dayNames[dayOfWeek]})`);
        }

        sampleRoutines.forEach(routine => {
            const isActiveOnThisDay = 
                (routine.frequency === 'daily') ||
                (routine.frequency === 'weekday' && dayOfWeek >= 1 && dayOfWeek <= 5) ||
                (routine.frequency === 'weekend' && (dayOfWeek === 0 || dayOfWeek === 6));
            
            if (isActiveOnThisDay) {
                periodTotalRoutines++;
            }
        });
    }

    // --- 기록 기반 통계 집계 ---
    histories.forEach(hist => {
        const historyDate = new Date(hist.date);
        historyDate.setHours(0, 0, 0, 0);

        if (historyDate >= dateFrom) {
            periodCompletions++;
        }

        // (복원된 부분) 바 차트 데이터 집계
        if (historyDate >= weekStartForBarChart) {
            const diffDays = Math.floor((today - historyDate) / (1000 * 60 * 60 * 24));
            const index = 6 - diffDays;
            if (index >= 0 && index < 7) {
                weeklyActivityData[index]++;
            }
        }

        const parentRoutine = sampleRoutines.find(r => r.id === hist.routineId);
        if (parentRoutine && parentRoutine.areas) {
            parentRoutine.areas.forEach(areaId => {
                if (areaPoints[areaId] !== undefined) {
                    areaCompletions[areaId]++;
                    if (hist.pointsEarned) {
                        areaPoints[areaId] += hist.pointsEarned;
                        totalPoints += hist.pointsEarned;
                    }
                }
            });
        }
    });

    const completionRate = periodTotalRoutines > 0 ? Math.round((periodCompletions / periodTotalRoutines) * 100) : 0;

    const stats = {
        completionRate,
        areaPoints,
        totalPoints,
        areaCompletions,
        weeklyActivityData,      // <-- 바 차트 데이터 복원
        weeklyActivityLabels     // <-- 바 차트 라벨 복원
    };

    debugLog("Calculated Stats (Integrated):", stats);
    return stats;
}


// ====================================================================
// 6. 핸들러, 렌더링, 유틸리티 등 나머지 모든 함수
// ====================================================================

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
async function handleStepperConfirm(value) { // 'value'는 모달에서 설정한 '새로운 최종값'
    if (!activeRoutineForModal) return;
    const currentRoutine = activeRoutineForModal;

    try {
        const routine = sampleRoutines.find(r => r.id === currentRoutine.id);
        if (routine) {
            // 1. 전달받은 최종값을 기준으로 상태를 계산합니다.
            const finalValue = value;
            const isNowGoalAchieved = isGoalAchieved({ ...routine, value: finalValue });

            const updatedFields = {
                value: finalValue,
                status: null,
                lastUpdatedDate: todayDateString,
                dailyGoalMetToday: isNowGoalAchieved
            };

            // 2. 일일 목표를 '처음' 달성했을 때만 포상 및 목표 보고를 수행합니다.
            if (isNowGoalAchieved && !routine.pointsGivenToday) {
                updatedFields.streak = (routine.streak || 0) + 1;

                // 2a. 포인트 포상
                if (routine.areas && routine.basePoints) {
                    const newStats = { ...userStats };
                    routine.areas.forEach(areaId => {
                        newStats[areaId] = (newStats[areaId] || 0) + routine.basePoints;
                    });
                    await updateUserStatsInFirebase(newStats);
                }

                // 2b. 활동 기록 보고
                await logRoutineHistory(routine.id, { value: finalValue, pointsEarned: routine.basePoints });

                // 2c. '순수 증가량(delta)' 계산 및 목표 시스템 보고
                const incrementValue = finalValue - (routine.value || 0);
                const reportData = { delta: incrementValue, finalValue: finalValue };
                
                console.log(`📡 [handleStepperConfirm]: 목표 시스템에 최종 보고`, reportData);
                if (reportData.delta > 0) {
                    await updateGoalProgressByRoutine(routine.id, reportData);
                }
                
                updatedFields.pointsGivenToday = true;
            }

            // 3. 루틴의 최종 상태를 데이터베이스에 업데이트합니다.
            await updateRoutineInFirebase(currentRoutine.id, updatedFields);
            
            // 4. 임무 완료 후 모달을 닫고 알림을 보냅니다.
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
// ▲▲▲ 여기까지 08/18(수정일) handleStepperConfirm 최종 완전판 ▲▲▲


// 2. Wheel(스크롤) 및 Simple(직접입력) 루틴 완료 처리 통합 함수
// ▼▼▼ 08/17(수정일) handleNumberConfirm 최종본 ▼▼▼
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

                const incrementValue = routine.continuous ? value : finalValue;
                const reportData = { delta: incrementValue, finalValue: finalValue };
                
                console.log(`📡 [handleNumberConfirm]: 목표 시스템에 전과 보고`, reportData);
                if (reportData.delta > 0) {
                    await updateGoalProgressByRoutine(routine.id, reportData);
                }
                
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
// ▲▲▲ 여기까지 08/17(수정일) handleNumberConfirm 최종본 ▲▲▲

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
// ▼▼▼ 08/17(수정일) handleReadingProgressConfirm 최종본 ▼▼▼
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

            if (newDailyGoalMetToday && !routine.pointsGivenToday) {
                updatedFields.streak = (routine.streak || 0) + 1;
                
                if (routine.areas && routine.basePoints) {
                    const newStats = { ...userStats };
                    routine.areas.forEach(areaId => {
                        newStats[areaId] = (newStats[areaId] || 0) + routine.basePoints;
                    });
                    await updateUserStatsInFirebase(newStats);
                }

                await logRoutineHistory(routine.id, { value: readPages, pointsEarned: routine.basePoints });

                const reportData = { delta: readPages, finalValue: newCurrentPage };
                console.log(`📡 [handleReadingProgressConfirm]: 목표 시스템에 전과 보고`, reportData);
                await updateGoalProgressByRoutine(routine.id, reportData);
                
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
// ▲▲▲ 여기까지 08/17(수정일) handleReadingProgressConfirm 최종본 ▲▲▲

        async function handleAddRoutineConfirm() {
            const name = document.getElementById('newRoutineName').value.trim();
            const points = parseInt(document.getElementById('newRoutinePoints').value);
            const selectedAreas = Array.from(document.querySelectorAll('#newRoutineAreas .area-checkbox:checked')).map(cb => cb.value);
    
            if (!name || !points || points <= 0 || selectedAreas.length === 0) {
                showNotification('루틴 이름, 1 이상의 포인트, 1개 이상의 영역을 선택해주세요.', 'error');
                return;
            }
    
            const type = document.getElementById('newRoutineType').value;
            const commonFields = {
                name: name,
                time: document.getElementById('newRoutineTime').value,
                type: type,
                frequency: document.getElementById('newRoutineFreq').value,
                areas: selectedAreas,
                basePoints: points,
                lastUpdatedDate: todayDateString,
            };
    
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
                if(typeSpecificFields.continuous) typeSpecificFields.value = 0;
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
                    startDate: new Date().toISOString().split('T')[0],
                    unit: '페이지',
                };
            }
    
            if (isEditingRoutine) {
                const routine = sampleRoutines.find(r => r.id === editingRoutineId);
                const updatedFields = { ...routine, ...commonFields, ...typeSpecificFields };
                await updateRoutineInFirebase(editingRoutineId, updatedFields);
                showNotification(`✏️ "${name}" 루틴이 수정되었습니다!`);
            } else {
                const newRoutine = {
                    ...commonFields,
                    ...typeSpecificFields,
                    value: null,
                    status: null,
                    streak: 0,
                    order: sampleRoutines.length,
                    active: true,
                    pointsGivenToday: false,
                };
                await addRoutineToFirebase(newRoutine);
                showNotification(`➕ "${name}" 루틴이 추가되었습니다!`);
            }
            hideAddRoutineModal();
        }

// ▼▼▼ 2025-08-17(수정일) handleGoalConfirm 장군 복원 ▼▼▼
async function handleGoalConfirm() {
    console.log('📌 [handleGoalConfirm]: 목표 저장/수정 처리 시작. 편집 모드:', isEditingGoal);

    const targetValueStr = document.getElementById('goalTargetValue').value;
    const targetValue = parseFloat(targetValueStr);

    const goalData = {
        name: document.getElementById('goalName').value.trim(),
        targetValue: targetValue,
        unit: document.getElementById('goalUnit').value.trim(),
        startDate: document.getElementById('goalStartDate').value,
        endDate: document.getElementById('goalEndDate').value,
        area: document.getElementById('goalArea').value,
        updateMethod: document.getElementById('goalUpdateMethod').value,
        linkedRoutines: Array.from(document.querySelectorAll('#linkableRoutines input[type="checkbox"]:checked')).map(cb => cb.value)
    };
    
    console.log('📝 취합된 목표 데이터:', goalData);

    if (!goalData.name || !goalData.unit || !goalData.startDate || !goalData.endDate) {
        showNotification('이름, 단위, 기간 필드는 비워둘 수 없습니다.', 'error');
        return;
    }
    if (isNaN(goalData.targetValue) || goalData.targetValue <= 0) {
        showNotification('목표값은 0보다 큰 숫자여야 합니다.', 'error');
        return;
    }
    if (new Date(goalData.startDate) >= new Date(goalData.endDate)) {
        showNotification('종료일은 시작일보다 이후여야 합니다.', 'error');
        return;
    }

    try {
        if (isEditingGoal) {
            await updateGoalInFirebase(editingGoalId, goalData);
            showNotification('🧭 목표가 성공적으로 수정되었습니다!');
        } else {
            goalData.currentValue = 0;
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
// ▲▲▲ 여기까지 2025-08-17(수정일) handleGoalConfirm 장군 복원 ▲▲▲

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

        async function saveRoutineOrder() {
            if (!orderChanged || !sortableInstance) return;
    
            const newOrderIds = sortableInstance.toArray();
            const orderedRoutines = newOrderIds.map((id, index) => {
                const routine = sampleRoutines.find(r => String(r.id) === id);
                return { ...routine, order: index };
            });
    
            try {
                await updateRoutineOrderInFirebase(orderedRoutines);
                orderChanged = false;
                document.getElementById('saveOrderBtn').classList.remove('show');

                showNotification('✅ 루틴 순서가 저장되었습니다!');
            } catch (error) {
                showNotification('순서 저장에 실패했습니다.', 'error');
            }
        }

    function editRoutine(routineId) {
          const routine = sampleRoutines.find(r => r.id === routineId);
          if (routine) {
              showEditRoutineModal(routine);
          }
      }





// --- 모달 관련 함수 (Modals) ---

   function showAddRoutineModal() {
            isEditingRoutine = false;
            editingRoutineId = null;
            showRoutineForm();
        }
    
        function showEditRoutineModal(routine) {
            isEditingRoutine = true;
            editingRoutineId = routine.id;
            showRoutineForm(routine);
        }
    
// ▼▼▼ showRoutineForm 함수에 삭제 버튼 처리 로직을 추가하세요 ▼▼▼
function showRoutineForm(routine = null) {
    const modal = document.getElementById('addRoutineModal');
    const deleteBtn = document.getElementById('deleteRoutineBtn');
    
    modal.querySelector('.modal-header h3').textContent = routine ? '✏️ 루틴 편집' : '➕ 새 루틴 추가';
    document.getElementById('addRoutineConfirm').textContent = routine ? '수정 완료' : '루틴 추가';
    
    // 삭제 버튼 표시/숨김
    if (routine) {
        deleteBtn.style.display = 'block';
        deleteBtn.onclick = () => {
            hideAddRoutineModal();
            // 삭제 확인을 위한 지연
            setTimeout(() => {
                if (confirm(`정말로 '${routine.name}' 루틴을 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.\n모든 기록과 통계가 함께 삭제됩니다.`)) {
                    handleDeleteRoutine(String(routine.id), routine.name);
                }
            }, 100);
        };
    } else {
        deleteBtn.style.display = 'none';
    }
    
    // Form reset/population (기존 로직)
    document.getElementById('newRoutineName').value = routine ? routine.name : '';
    document.getElementById('newRoutineTime').value = routine ? routine.time : 'morning';
    document.getElementById('newRoutineType').value = routine ? routine.type : 'yesno';
    document.getElementById('newRoutineFreq').value = routine ? routine.frequency : 'daily';
    document.getElementById('newRoutinePoints').value = routine ? routine.basePoints : 10;

    // Type-specific options (기존 로직)
    const type = routine ? routine.type : 'yesno';
    document.getElementById('newNumberOptions').style.display = type === 'number' ? 'block' : 'none';
    document.getElementById('newReadingOptions').style.display = type === 'reading' ? 'block' : 'none';

    if (type === 'number') {
        document.getElementById('newNumberUnit').value = routine.unit || '';
        document.getElementById('newNumberMin').value = routine.min ?? 1;
        document.getElementById('newNumberMax').value = routine.max ?? 100;
        document.getElementById('newNumberStep').value = routine.step ?? 1;
        document.getElementById('newNumberGoal').value = routine.dailyGoal || '';
        document.getElementById('newNumberContinuous').checked = routine.continuous || false;
        document.getElementById('newNumberInputType').value = routine.inputType || 'stepper';
    }
    if (type === 'reading') {
        document.getElementById('newBookTitle').value = routine.bookTitle || '';
        document.getElementById('newStartPage').value = routine.startPage || 1;
        document.getElementById('newEndPage').value = routine.endPage || '';
        document.getElementById('newDailyPages').value = routine.dailyPages || 10;
    }

    const newRoutineAreasContainer = document.getElementById('newRoutineAreas');
    newRoutineAreasContainer.innerHTML = '';
    userAreas.forEach(area => {
        const isSelected = routine ? routine.areas?.includes(area.id) : false;
        newRoutineAreasContainer.innerHTML += `
            <div class="area-checkbox-item">
                <input type="checkbox" id="area-${area.id}" value="${area.id}" class="area-checkbox" ${isSelected ? 'checked' : ''}>
                <label for="area-${area.id}">${area.name}</label>
            </div>
        `;
    });
    
    modal.style.display = 'flex';
}
// ▲▲▲ 여기까지 수정 ▲▲▲



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

   

// --- 렌더링 함수 (Rendering) ---
   function renderRoutines() {
      const incompleteList = document.getElementById('incompleteRoutineList');
      const inprogressList = document.getElementById('inprogressRoutineList');
      const completedList = document.getElementById('completedRoutineList');
      const skippedList = document.getElementById('skippedRoutineList');
      const inprogressSection = document.getElementById('inprogress-section');
      const completedSection = document.getElementById('completed-section');
      const skippedSection = document.getElementById('skipped-section');
      const emptyState = document.getElementById('emptyStateIncomplete');

    incompleteList.innerHTML = '';
    inprogressList.innerHTML = '';
    completedList.innerHTML = '';
    skippedList.innerHTML = '';
            
            const activeRoutines = sampleRoutines.filter(r => r.active).sort((a, b) => a.order - b.order);
            
            let incompleteRoutines = 0;
    
            activeRoutines.forEach(routine => {
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
            
            emptyState.style.display = incompleteRoutines === 0 && (inprogressList.children.length > 0 || completedList.children.length > 0) ? 'block' : 'none';
            inprogressSection.style.display = inprogressList.children.length > 0 ? 'block' : 'none';
            completedSection.style.display = completedList.children.length > 0 ? 'block' : 'none';
            skippedSection.style.display = skippedList.children.length > 0 ? 'block' : 'none';
            
            updateDailyProgress();
        }

function renderManagePage() {
            const manageList = document.getElementById('manageRoutineList');
            const saveBtn = document.getElementById('saveOrderBtn');
            if (!manageList || !saveBtn) return;
            
            manageList.innerHTML = '';
            orderChanged = false;
            saveBtn.classList.remove('show');
    
            const sortedRoutines = [...sampleRoutines].sort((a, b) => a.order - b.order);
    
            sortedRoutines.forEach(routine => {
                const item = createManageRoutineElement(routine);
                manageList.appendChild(item);
            });
    
            if (sortableInstance) {
                sortableInstance.destroy();
            }
    
            sortableInstance = new Sortable(manageList, {
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                onEnd: () => {
                    orderChanged = true;
                    saveBtn.classList.add('show');
                }
            });
        }

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
            ${routine.name}
            <span class="type-icon">${getTypeIcon(routine.type)}</span>
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
            labels: stats.weeklyActivityLabels || [],
            datasets: [{
                label: '일일 완료 루틴 개수',
                data: stats.weeklyActivityData || [],
                backgroundColor: 'rgba(99, 102, 241, 0.7)', // indigo-500
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
    if (!routine) return null;

    // 1. 해당 루틴의 모든 history 기록 가져오기
    const historyRef = db.collection('users').doc(currentUser.uid)
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


// ▼▼▼ 08/17(수정일) 불필요한 모달 기습 호출 제거 ▼▼▼
async function showGoalCompassPage() {
    console.log('📌 [showGoalCompassPage]: 나침반 페이지 표시');
    document.getElementById('main-app-content').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('goal-compass-page').style.display = 'block';
    
    // 아래 라인은 '+ 새 목표' 버튼이 눌렸을 때만 호출되어야 하므로 삭제합니다.
    // showAddGoalModal(); // <--- 이 라인을 삭제!
    
    await renderGoalCompassPage();
}
// ▲▲▲ 여기까지 08/17(수정일) 불필요한 모달 기습 호출 제거 ▲▲▲

// ▼▼▼ 08/17(수정일) renderGoalCompassPage 전우 완전 복원 ▼▼▼
async function renderGoalCompassPage() {
    if (!currentUser) return;
    const page = document.getElementById('goal-compass-page');
    const list = document.getElementById('goalsList');
    list.innerHTML = '<div class="empty-state"><div class="empty-state-title">목표를 불러오는 중...</div></div>'; // 로딩 표시

    try {
        // .get()을 사용하여 데이터를 한 번만 가져옵니다.
        const goals = await getUserGoals(currentUser.uid);
        list.innerHTML = ''; // 로딩 표시 제거

        if (!goals.length) {
            list.innerHTML = `<div class="empty-state"> <div class="empty-state-icon">🧭</div> <div class="empty-state-title">아직 목표가 없어요</div> <div class="empty-state-description">‘+ 새 목표’를 눌러 분기/연간 목표를 만들어 보세요.</div> </div>`;
        } else {
            goals.forEach(goal => {
                const pct = goal.targetValue > 0 ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100)) : 0;
                const deg = Math.round(360 * (pct / 100));
                const ddayInfo = getGoalDdayInfo(goal.startDate, goal.endDate);
                const kpi = `${goal.currentValue || 0} / ${goal.targetValue || 0} ${goal.unit || ''}`;

                const card = document.createElement('div');
                card.className = 'goal-card';
                card.innerHTML = `
                    <div class="goal-card-header">
                        <div style="font-weight:800;">${goal.name}</div>
                        <div>
                            <button class="edit-btn" data-goal-id="${goal.id}">편집</button>
                            <button class="delete-btn" data-goal-id="${goal.id}">삭제</button>
                        </div>
                    </div>
                    <div style="color:#6b7280; font-size:0.85rem; margin-bottom:0.5rem;">영역: ${getAreaName(goal.area)} · 기간: ${goal.startDate} ~ ${goal.endDate}</div>
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
                list.appendChild(card);
                
                const paceMsg = getPaceMessage(goal);
                const paceEl = document.getElementById(`pace-${goal.id}`);
                if (paceEl && paceMsg) paceEl.textContent = paceMsg;
            });
        }

        // --- 이벤트 리스너 지휘관 ---
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

// ▼▼▼ 08/17(수정일) 목표 추가/편집 모달 함수 기능 확장 ▼▼▼
function showAddGoalModal(goal = null) { // goal 파라미터 추가
    console.log('📌 [showAddGoalModal]: 모달 표시. 편집 모드:', !!goal);
    isEditingGoal = !!goal;
    editingGoalId = goal ? goal.id : null;

    // 모달 UI 업데이트
    const modal = document.getElementById('addGoalModal');
    modal.querySelector('.modal-header h3').textContent = goal ? '🧭 목표 편집' : '🧭 새 목표 설정';
    modal.querySelector('#addGoalConfirm').textContent = goal ? '수정 완료' : '저장';
    
    populateGoalModalFields(goal); // 데이터를 채우는 함수 호출
    modal.style.display = 'flex';
}
// ▲▲▲ 여기까지 08/17(수정일) 목표 추가/편집 모달 함수 기능 확장 ▲▲▲

function hideAddGoalModal() {
    document.getElementById('addGoalModal').style.display = 'none';
}

// ▼▼▼ 2025-08-17(수정일) populateGoalModalFields 장군 복원 ▼▼▼
function populateGoalModalFields(goal = null) {
    console.log('📌 [populateGoalModalFields]: 폼 필드 채우기 시작. 전달된 목표:', goal);

    // 영역 <select> 목록 생성
    const sel = document.getElementById('goalArea');
    sel.innerHTML = '';
    userAreas.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        sel.appendChild(opt);
    });

    // 연결 가능한 루틴 <checkbox> 목록 생성
    const container = document.getElementById('linkableRoutines');
    container.innerHTML = '';
    sampleRoutines
        .filter(r => r.type === 'number' || r.type === 'reading')
        .forEach(r => {
            const id = `link-r-${r.id}`;
            const label = `${r.name} (${getTypeLabel(r.type)})`;
            const item = document.createElement('div');
            item.className = 'area-checkbox-item';
            item.innerHTML = `<input type="checkbox" id="${id}" value="${r.id}" /> <label for="${id}">${label}</label>`;
            container.appendChild(item);
        });
    
    const goalUpdateMethodSelect = document.getElementById('goalUpdateMethod');

    if (goal) {
        // [수정 모드]: 기존 목표 데이터로 폼을 채웁니다.
        console.log('📝 수정 모드: 기존 데이터로 폼을 채웁니다.');
        document.getElementById('goalName').value = goal.name || '';
        document.getElementById('goalTargetValue').value = goal.targetValue || '';
        document.getElementById('goalCurrentValue').value = goal.currentValue || 0;
        document.getElementById('goalUnit').value = goal.unit || '';
        document.getElementById('goalStartDate').value = goal.startDate || '';
        document.getElementById('goalEndDate').value = goal.endDate || '';
        document.getElementById('goalArea').value = goal.area || '';

        // 저장된 '진행 방식' 값을 드롭다운에 설정합니다.
        goalUpdateMethodSelect.value = goal.updateMethod || 'accumulate';

        if (goal.linkedRoutines && Array.isArray(goal.linkedRoutines)) {
            goal.linkedRoutines.forEach(routineId => {
                const checkbox = document.getElementById(`link-r-${routineId}`);
                if (checkbox) checkbox.checked = true;
            });
        }
    } else {
        // [추가 모드]: 폼을 초기화합니다.
        console.log('✨ 추가 모드: 폼을 초기화합니다.');
        document.getElementById('goalName').value = '';
        document.getElementById('goalTargetValue').value = '';
        document.getElementById('goalCurrentValue').value = 0;
        document.getElementById('goalUnit').value = '';
        document.getElementById('goalStartDate').value = todayDateString;
        document.getElementById('goalEndDate').value = '';
        
        // '진행 방식'을 기본값으로 설정합니다.
        goalUpdateMethodSelect.value = 'accumulate';
    }
    console.log('🏁 [populateGoalModalFields]: 폼 필드 설정 완료');
}
// ▲▲▲ 여기까지 2025-08-17(수정일) populateGoalModalFields 장군 복원 ▲▲▲

// --- 페이지 네비게이션 (Page Navigation) ---

function showHomePage() {
    document.getElementById('main-app-content').style.display = 'block';
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('manage-section').style.display = 'none';
    document.querySelector('.daily-progress').style.display = 'block';
    document.getElementById('incomplete-section').style.display = 'block';
    renderRoutines();
}

function showManagePage() {
    document.getElementById('main-app-content').style.display = 'block';
    document.getElementById('dashboard-view').style.display = 'none';
    document.querySelector('.daily-progress').style.display = 'none';
    document.getElementById('incomplete-section').style.display = 'none';
    document.getElementById('inprogress-section').style.display = 'none';
    document.getElementById('completed-section').style.display = 'none';
    document.getElementById('skipped-section').style.display = 'none';
    document.getElementById('manage-section').style.display = 'block';
    renderAreaStats();
    renderManagePage();
}

// feat(stats): Implement basic UI and rendering for statistics page

function showDashboardPage() {
    // 다른 페이지 숨기기
    document.getElementById('main-app-content').style.display = 'none';
    
    // 통계 페이지 보이기
    const dashboardView = document.getElementById('dashboard-view');
    dashboardView.style.display = 'block';

    // 통계 데이터 렌더링 함수 호출
    renderStatsPage();
}


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

// ▼▼▼ 08/17(수정일) 모든 이벤트 리스너를 재구성한 최종 버전 ▼▼▼
function setupAllEventListeners() {
    console.log('📌 [setupAllEventListeners]: 모든 이벤트 리스너 설정 시작');

    // --- 네비게이션 버튼 ---
    document.getElementById('navHomeBtn').addEventListener('click', showHomePage);
    document.getElementById('navManageBtn').addEventListener('click', showManagePage);
    document.getElementById('navAddRoutineBtn').addEventListener('click', showAddRoutineModal);
    document.getElementById('navStatsBtn').addEventListener('click', showDashboardPage);
    document.getElementById('navGoalCompassBtn').addEventListener('click', showGoalCompassPage);

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
    
    // --- 관리 페이지 순서 저장 버튼 ---
    document.getElementById('saveOrderBtn').addEventListener('click', saveRoutineOrder);
    
    // --- 각종 모달 버튼들 (setupModal을 통해 일괄 설정) ---
    // ▼▼▼ 이 부분을 아래 코드로 교체해주세요 ▼▼▼
    setupModal('numberInputModal', hideNumberInputModal, handleNumberInputConfirm, 'numberInput');
    setupModal('timeInputModal', hideTimeInputModal, handleTimeInputConfirm, 'timeInput');
    setupModal('stepperInputModal', hideStepperModal, handleStepperConfirm, 'stepperConfirmBtn');
    setupModal('wheelInputModal', hideWheelModal, handleWheelConfirm, 'wheelConfirmBtn');
    setupModal('readingSetupModal', hideReadingSetupModal, handleReadingSetupConfirm, 'readingSetupConfirm');
    setupModal('readingProgressModal', hideReadingProgressModal, handleReadingProgressConfirm, 'readingProgressConfirm');
    setupModal('addRoutineModal', hideAddRoutineModal, handleAddRoutineConfirm, 'addRoutineConfirm');
    setupModal('manageAreasModal', hideManageAreasModal, handleManageAreasConfirm);
    setupModal('addGoalModal', hideAddGoalModal, handleGoalConfirm, 'addGoalConfirm');
    setupModal('routineDetailModal', hideDetailStatsModal);
    // ▲▲▲ 여기까지 교체 ▲▲▲
    // --- ESC로 모든 모달 닫기 ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(modal => modal.style.display = 'none');
        }
    });

    // --- 동적으로 생성되는 요소에 대한 이벤트 리스너 (루틴 타입 변경 등) ---
    document.getElementById('manageAreasBtn').addEventListener('click', showManageAreasModal);
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

// ... (이전 코드 생략) ...

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

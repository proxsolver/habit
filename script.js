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

    // 인증 이벤트 리스너
    loginBtn.addEventListener('click', () => firebase.auth().signInWithPopup(provider).catch(error => console.error("Login failed:", error)));
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

    // 모든 UI 이벤트 리스너 설정
    setupAllEventListeners();
});

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
        { id: 'physical', name: '신체' },
        { id: 'mental', name: '정신' },
        { id: 'intellectual', name: '지적' }
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

async function handleStepperConfirm(value) {
    if (!activeRoutineForModal) return;
    const currentRoutine = activeRoutineForModal;
    try {
        const routine = sampleRoutines.find(r => r.id === currentRoutine.id);
        if (routine) {
            const tempRoutineForCheck = { ...routine, value: value };
            const isNowGoalAchieved = isGoalAchieved(tempRoutineForCheck);

            const updatedFields = {
                value: value,
                status: null,
                lastUpdatedDate: todayDateString,
                // ★★★ 수정된 핵심 로직 1 ★★★
                // 포인트 지급 여부와 관계없이, 목표 달성 상태를 항상 업데이트합니다.
                dailyGoalMetToday: isNowGoalAchieved
            };
            let pointsAwarded = false;

            // 포인트와 스트릭은 오늘 처음 목표를 달성했을 때만 지급합니다.
            if (isNowGoalAchieved && !routine.pointsGivenToday) {
                updatedFields.streak = (routine.streak || 0) + 1;
                if (routine.areas && routine.basePoints) {
                    const newStats = { ...userStats };
                    routine.areas.forEach(areaId => {
                        newStats[areaId] = (newStats[areaId] || 0) + routine.basePoints;
                    });
                    await updateUserStatsInFirebase(newStats);
                }
                updatedFields.pointsGivenToday = true;
                pointsAwarded = true;
            }

            await updateRoutineInFirebase(currentRoutine.id, updatedFields);
            hideStepperModal();
            const goalStatus = isNowGoalAchieved ? ' 🎯 목표 달성!' : '';
            showNotification(`✅ ${currentRoutine.name}: ${value}${currentRoutine.unit || ''}${goalStatus} 저장되었습니다!`);
            if (pointsAwarded) {
                showCompletionEffect();
                setTimeout(showCelebrationMessage, 300);
            }
        }
    } catch (error) {
        console.error('Failed to update stepper routine:', error);
        showNotification('저장에 실패했습니다.', 'error');
    }
}

// 2. Wheel(스크롤) 및 Simple(직접입력) 루틴 완료 처리 통합 함수
async function handleNumberConfirm(value, inputType) {
    if (!activeRoutineForModal) return;
    const currentRoutine = activeRoutineForModal;
    try {
        const routine = sampleRoutines.find(r => r.id === currentRoutine.id);
        if (routine) {
            const finalValue = routine.continuous ? Math.max(routine.value || 0, value) : value;
            const tempRoutineForCheck = { ...routine, value: finalValue };
            const isNowGoalAchieved = isGoalAchieved(tempRoutineForCheck);

            const updatedFields = {
                value: finalValue,
                status: null,
                lastUpdatedDate: todayDateString,
                // ★★★ 수정된 핵심 로직 2 ★★★
                // 포인트 지급 여부와 관계없이, 목표 달성 상태를 항상 업데이트합니다.
                dailyGoalMetToday: isNowGoalAchieved
            };
            let pointsAwarded = false;

            // 포인트와 스트릭은 오늘 처음 목표를 달성했을 때만 지급합니다.
            if (isNowGoalAchieved && !routine.pointsGivenToday) {
                updatedFields.streak = (routine.streak || 0) + 1;
                if (routine.areas && routine.basePoints) {
                    const newStats = { ...userStats };
                    routine.areas.forEach(areaId => {
                        newStats[areaId] = (newStats[areaId] || 0) + routine.basePoints;
                    });
                    await updateUserStatsInFirebase(newStats);
                }
                updatedFields.pointsGivenToday = true;
                pointsAwarded = true;
            }

            await updateRoutineInFirebase(currentRoutine.id, updatedFields);
            if (inputType === 'simple') hideNumberInputModal();
            if (inputType === 'wheel') hideWheelModal();
            const goalStatus = isNowGoalAchieved ? ' 🎯 목표 달성!' : '';
            showNotification(`✅ ${currentRoutine.name}: ${finalValue}${currentRoutine.unit || ''}${goalStatus} 저장되었습니다!`);
            if (pointsAwarded) {
                showCompletionEffect();
                setTimeout(showCelebrationMessage, 300);
            }
        }
    } catch (error) {
        console.error('Failed to update number routine:', error);
        showNotification('저장에 실패했습니다.', 'error');
    }
}

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
                    const newCurrentPage = Math.min(routine.currentPage + readPages, routine.endPage);
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
    
                    let pointsAwarded = false;
                    if (newDailyGoalMetToday && !routine.pointsGivenToday) {
                        updatedFields.streak = (routine.streak || 0) + 1;
                        if (routine.areas && routine.basePoints) {
                            const newStats = { ...userStats };
                            routine.areas.forEach(areaId => {
                                newStats[areaId] = (newStats[areaId] || 0) + routine.basePoints;
                            });
                            await updateUserStatsInFirebase(newStats);
                        }
                        updatedFields.pointsGivenToday = true;
                        pointsAwarded = true;
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
    
                    if (pointsAwarded) {
                        setTimeout(showCelebrationMessage, 300);
                    }
                }
            } catch (error) {
                console.error('Failed to update reading routine:', error);
                showNotification('저장에 실패했습니다.', 'error');
            }
        }


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
    
        function showRoutineForm(routine = null) {
            const modal = document.getElementById('addRoutineModal');
            modal.querySelector('.modal-header h3').textContent = routine ? '✏️ 루틴 편집' : '➕ 새 루틴 추가';
            document.getElementById('addRoutineConfirm').textContent = routine ? '수정 완료' : '루틴 추가';
            
            // Form reset/population
            document.getElementById('newRoutineName').value = routine ? routine.name : '';
            document.getElementById('newRoutineTime').value = routine ? routine.time : 'morning';
            document.getElementById('newRoutineType').value = routine ? routine.type : 'yesno';
            document.getElementById('newRoutineFreq').value = routine ? routine.frequency : 'daily';
            document.getElementById('newRoutinePoints').value = routine ? routine.basePoints : 10;
    
            // Type-specific options
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

function showStepperModal(routine) {
        const modal = document.getElementById('stepperInputModal');
        const title = document.getElementById('stepperModalTitle');
        const valueDisplay = document.getElementById('stepperValue');
        const unitDisplay = document.getElementById('stepperUnit');
        
        if (!modal || !title || !valueDisplay) {
            console.error('스테퍼 모달 요소를 찾을 수 없습니다.');
            return;
        }
        
        let currentValue = routine.continuous ? (routine.value || 0) + (routine.step || 1) : (routine.value || routine.min || 1);
        const minValue = routine.continuous ? (routine.value || 0) + (routine.step || 1) : (routine.min || 1);
        const maxValue = routine.max || 100;
        const stepValue = routine.step || 1;
        
        const titleText = routine.continuous ? `${routine.name} (현재: ${routine.value || 0}${routine.unit || ''})` : routine.name;
        title.textContent = titleText;
        valueDisplay.textContent = currentValue;
        unitDisplay.textContent = routine.unit || '';
        
        const existingGoal = modal.querySelector('.goal-text');
        if (existingGoal) existingGoal.remove();
        
        if (routine.dailyGoal) {
            const goalText = document.createElement('div');
            goalText.className = 'goal-text';
            goalText.style.cssText = `text-align: center; font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;`;
            goalText.textContent = `목표: ${routine.dailyGoal}${routine.unit || ''}`;
            modal.querySelector('.stepper-container').parentNode.insertBefore(goalText, modal.querySelector('.stepper-container').nextSibling);
        }
        
        const minusBtn = document.getElementById('stepperMinus');
        const plusBtn = document.getElementById('stepperPlus');
        const newMinusBtn = minusBtn.cloneNode(true);
        const newPlusBtn = plusBtn.cloneNode(true);
        
        minusBtn.parentNode.replaceChild(newMinusBtn, minusBtn);
        plusBtn.parentNode.replaceChild(newPlusBtn, plusBtn);
        
        function updateStepperButtons() {
            newMinusBtn.disabled = currentValue <= minValue;
            newPlusBtn.disabled = currentValue >= maxValue;
        }

        newMinusBtn.addEventListener('click', () => {
            if (currentValue > minValue) {
                currentValue = Math.max(minValue, currentValue - stepValue);
                valueDisplay.textContent = currentValue;
                updateStepperButtons();
            }
        });
        
        newPlusBtn.addEventListener('click', () => {
            if (currentValue < maxValue) {
                currentValue = Math.min(maxValue, currentValue + stepValue);
                valueDisplay.textContent = currentValue;
                updateStepperButtons();
            }
        });
        
        updateStepperButtons();
        
        document.getElementById('stepperConfirmBtn').onclick = () => handleStepperConfirm(currentValue);
        
        modal.style.display = 'flex';
    }

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

 function showReadingProgressModal(routine) {
        activeRoutineForModal = routine;
        
        const modal = document.getElementById('readingProgressModal');
        const title = document.getElementById('readingProgressTitle');
        const readPagesInput = document.getElementById('readPages');
        const recommendedPages = document.getElementById('recommendedPages');
        const readingInfo = document.getElementById('readingInfo');
        const readingProgressInfo = document.getElementById('readingProgressInfo');
        
        if (!modal) return;
        
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
        
        readPagesInput.removeEventListener('input', updateProgressPreview);
        readPagesInput.addEventListener('input', updateProgressPreview);
        updateProgressPreview();
        
        modal.style.display = 'flex';
        readPagesInput.focus();
    } 

function hideReadingProgressModal() {
    document.getElementById('readingProgressModal').style.display = 'none';
}


function showManageAreasModal() {
        const modal = document.getElementById('manageAreasModal');
        const manageAreasList = document.getElementById('manageAreasList');
        const addAreaBtn = document.getElementById('addAreaBtn');
        
        manageAreasList.innerHTML = '';
        
        // 임시 복사본으로 작업하여 취소 시 원본 유지
        const tempAreas = JSON.parse(JSON.stringify(userAreas));
        
        function renderAreaInputs(areas) {
            manageAreasList.innerHTML = '';
            areas.forEach(area => {
                const areaGroup = document.createElement('div');
                areaGroup.className = 'form-group';
                areaGroup.innerHTML = `
                    <label for="area-name-${area.id}">${area.name}</label>
                    <input type="text" id="area-name-${area.id}" value="${area.name}" data-area-id="${area.id}">
                    ${areas.length > 1 ? `<button class="remove-area-btn" data-area-id="${area.id}">−</button>` : ''}
                `;
                manageAreasList.appendChild(areaGroup);
            });

            document.querySelectorAll('.remove-area-btn').forEach(button => {
                button.onclick = (e) => {
                    const idToRemove = e.target.dataset.areaId;
                    const updatedTempAreas = tempAreas.filter(area => area.id !== idToRemove);
                    renderAreaInputs(updatedTempAreas);
                };
            });
            
            addAreaBtn.style.display = areas.length < MAX_AREAS ? 'block' : 'none';
        }
        
        renderAreaInputs(tempAreas);

        addAreaBtn.onclick = () => {
            if (tempAreas.length >= MAX_AREAS) return;
            const newAreaId = `customArea${Date.now()}`;
            tempAreas.push({ id: newAreaId, name: `새 영역 ${tempAreas.length + 1}` });
            renderAreaInputs(tempAreas);
        };
        
        modal.style.display = 'flex';
    }

function hideManageAreasModal() {
    document.getElementById('manageAreasModal').style.display = 'none';
}

   

   

   

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

function createImprovedRoutineElement(routine) {
    const isCompleted = isRoutineCompleted(routine);
    const isSkipped = routine.status === 'skipped';
    const isGoalReachedOverall = isGoalAchieved(routine);
    const isContinuous = isContinuousRoutine(routine);
    const isInProgress = isRoutineInProgress(routine);
    
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
        if (isCompleted && !isContinuous && !isReadingRoutine(routine)) {
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
            <button class="edit-btn">편집</button>
            <button class="delete-btn">삭제</button> 
        </div>
    `;
    item.querySelector('.toggle-checkbox').addEventListener('change', async (e) => {
        await updateRoutineInFirebase(String(routine.id), { active: e.target.checked });
        showNotification(`'${routine.name}' 루틴이 ${e.target.checked ? '활성화' : '비활성화'}되었습니다.`, 'info');
    });
    item.querySelector('.edit-btn').addEventListener('click', () => editRoutine(routine.id));
    item.querySelector('.delete-btn').addEventListener('click', () => handleDeleteRoutine(String(routine.id), routine.name));
    return item;
}

   

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

function showDashboardPage() {
    document.getElementById('main-app-content').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
    openDashboardTab('reading');
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
        
        function getReadingProgress(routine) {
            if (routine.type !== 'reading' || !routine.endPage) return 0;
            const totalPages = routine.endPage - routine.startPage + 1;
            const readPages = routine.currentPage - routine.startPage + 1;
            return Math.max(0, Math.min(100, Math.round((readPages / totalPages) * 100)));
        }
    
        function getTodayReadingRange(routine) {
            if (routine.type !== 'reading') return null;
            const currentPage = routine.currentPage || routine.startPage - 1;
            const dailyPages = routine.dailyPages || 10;
            const todayStart = currentPage + 1;
            const todayEnd = Math.min(currentPage + dailyPages, routine.endPage);
            return { start: todayStart, end: todayEnd, pages: Math.max(0, todayEnd - todayStart + 1) };
        }
    
        function getEstimatedCompletionDate(routine) {
            if (routine.type !== 'reading' || routine.currentPage >= routine.endPage) return '완료';
            const remainingPages = routine.endPage - routine.currentPage;
            const remainingDays = Math.ceil(remainingPages / (routine.dailyPages || 10));
            const completionDate = new Date();
            completionDate.setDate(today.getDate() + remainingDays);
            return completionDate.toLocaleDateString('ko-KR');
        }
    
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

function setupAllEventListeners() {
    // --- 네비게이션 버튼 ---
    document.getElementById('navHomeBtn').addEventListener('click', showHomePage);
    document.getElementById('navManageBtn').addEventListener('click', showManagePage);
    document.getElementById('navAddRoutineBtn').addEventListener('click', showAddRoutineModal);
    document.getElementById('navStatsBtn').addEventListener('click', showDashboardPage);
    
    // --- 대시보드 탭 ---
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => openDashboardTab(button.dataset.tab));
    });

    // --- 관리 페이지 ---
    document.getElementById('saveOrderBtn').addEventListener('click', saveRoutineOrder);
    document.getElementById('manageAreasBtn').addEventListener('click', showManageAreasModal);

    // --- 각종 모달 버튼들 ---
    setupModal('numberInputModal', hideNumberInputModal, handleNumberInputConfirm, 'numberInput');
    setupModal('timeInputModal', hideTimeInputModal, handleTimeInputConfirm, 'timeInput');
    setupModal('stepperInputModal', hideStepperModal, handleStepperConfirm);
    setupModal('wheelInputModal', hideWheelModal, handleWheelConfirm);
    setupModal('readingSetupModal', hideReadingSetupModal, handleReadingSetupConfirm);
    setupModal('readingProgressModal', hideReadingProgressModal, handleReadingProgressConfirm);
    setupModal('addRoutineModal', hideAddRoutineModal, handleAddRoutineConfirm);
    setupModal('manageAreasModal', hideManageAreasModal, handleManageAreasConfirm);

    // --- ESC로 모든 모달 닫기 ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(modal => modal.style.display = 'none');
        }
    });
}

function setupModal(modalId, hideFn, confirmFn = null, confirmInputId = null) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelector('.modal-close')?.addEventListener('click', hideFn);
    modal.querySelector('.btn-secondary')?.addEventListener('click', hideFn);
    modal.addEventListener('click', (e) => { if (e.target === e.currentTarget) hideFn(); });
    
    if (confirmFn) {
        modal.querySelector('.btn:not(.btn-secondary)')?.addEventListener('click', confirmFn);
    }
    if (confirmInputId) {
        document.getElementById(confirmInputId)?.addEventListener('keypress', (e) => { if (e.key === 'Enter') confirmFn(); });
    }
}



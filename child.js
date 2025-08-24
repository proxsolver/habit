// ====================================================================
// 1. 전역 변수
// ====================================================================
let currentUser = null;
let assignedRoutines = [];
let activeRoutineForModal = null;
const today = new Date();
const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

// ====================================================================
// 2. 앱 시작점
// ====================================================================
// ▼▼▼ 2025-08-25(수정일) setupEventListeners 함수 호출 누락 수정 ▼▼▼
document.addEventListener('DOMContentLoaded', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            try {
                if (window.innerWidth <= 768) {
                    await firebase.auth().signInWithRedirect(provider);
                } else {
                    await firebase.auth().signInWithPopup(provider);
                }
            } catch (error) {
                console.error("❌ 자녀용 로그인 실패:", error);
                showNotification('로그인에 실패했습니다. 다시 시도해주세요.', 'error');
            }
        });
    }

    // ★★★ 핵심: 모든 이벤트 리스너 설정 함수를 여기서 호출합니다.
    setupEventListeners(); 
});
// ▲▲▲ 여기까지 2025-08-25(수정일) setupEventListeners 함수 호출 누락 수정 ▲▲▲
// // ▼▼▼ 2025-08-25(수정일) Firestore 사용자 정보를 currentUser 객체에 통합 ▼▼▼

// ▼▼▼ 2025-08-25(수정일) userDoc.exists()를 userDoc.exists 속성으로 최종 수정 ▼▼▼
// ▼▼▼ 2025-08-25(수정일) 반려묘 데이터 초기화 로직 추가 ▼▼▼
// 기존 onAuthStateChanged 함수를 이 코드로 교체합니다.
firebase.auth().onAuthStateChanged(async (user) => {
    const bottomTabBar = document.querySelector('.bottom-tab-bar');
    if (user) {
        const userDocRef = db.collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};

        // 1. companionCat 데이터가 없으면, 기본값으로 생성해줍니다.
        if (userDoc.exists && !userData.companionCat) {
            console.log(`[onAuthStateChanged] ${user.displayName}님을 위한 새 반려묘를 생성합니다.`);
            const initialCatData = {
                name: "아기 고양이",
                catType: "cheese_tabby",
                level: 1,
                exp: 0,
                expression: "default",
                lastActivityTimestamp: null
            };
            await userDocRef.update({ companionCat: initialCatData });
            // 업데이트된 정보를 다시 불러오기 위해 userData에 반영합니다.
            userData.companionCat = initialCatData;
        }
        
        currentUser = {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            ...userData
        };

        if (currentUser.role === 'parent') {
            window.location.href = 'index.html';
            return;
        }
        
        await updateUserInfoUI(currentUser);
        await loadAssignedRoutines(currentUser.uid);
        
        // 2. 고양이 렌더링 함수를 호출합니다.
        if (currentUser.companionCat) {
            renderCompanionCat(currentUser.companionCat);
        }

        showHomePage();
        if(bottomTabBar) bottomTabBar.style.display = 'flex';

    } else {
        currentUser = null;
        updateUserInfoUI(null);
        renderMissions();
        if(bottomTabBar) bottomTabBar.style.display = 'none';
    }
});
// ▲▲▲ 여기까지 2025-08-25(수정일) 반려묘 데이터 초기화 로직 추가 ▲▲▲
// // ▲▲▲ 여기까지 2025-08-25(수정일) userDoc.exists()를 userDoc.exists 속성으로 최종 수정 ▲▲▲


// ▲▲▲ 여기까지 2025-08-25(수정일) Firestore 사용자 정보를 currentUser 객체에 통합 ▲▲▲
    
// ====================================================================
// 3. 데이터 로직
// ====================================================================
async function loadAssignedRoutines(userId) {
    if (!currentUser) return;
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists || !userDoc.data().familyId) {
            assignedRoutines = [];
            renderMissions();
            return;
        }
        const familyId = userDoc.data().familyId;
        const routinesRef = db.collection('families').doc(familyId).collection('routines');
        const snapshot = await routinesRef.where('assignedTo', '==', userId).get();
        assignedRoutines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), path: doc.ref.path }));
        renderMissions();
    } catch (error) {
        console.error("❌ [loadAssignedRoutines]: 미션 로딩 중 오류 발생:", error);
    }
}

async function loadAndRenderRewards() {
    if (!currentUser) return;
    const listContainer = document.getElementById('reward-store-list');
    listContainer.innerHTML = '<p class="panel-description">보상 목록을 불러오는 중...</p>';
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (!userDoc.exists || !userDoc.data().familyId) {
        listContainer.innerHTML = '<p class="panel-description">소속된 가족이 없어 보상 목록을 표시할 수 없습니다.</p>';
        return;
    }
    const familyId = userDoc.data().familyId;
    const rewardsRef = db.collection('families').doc(familyId).collection('rewards');
    const snapshot = await rewardsRef.where('isActive', '==', true).orderBy('points').get();
    if (snapshot.empty) {
        listContainer.innerHTML = '<p class="panel-description">아직 등록된 보상이 없습니다.</p>';
        return;
    }
    listContainer.innerHTML = '';
    const rewards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    rewards.forEach(reward => listContainer.appendChild(createRewardItemElement(reward)));
}

async function loadAndRenderPointHistory() {
    if (!currentUser) return;
    const listContainer = document.getElementById('point-history-list');
    listContainer.innerHTML = '<p class="panel-description">기록을 불러오는 중...</p>';
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists || !userDoc.data().familyId) {
            listContainer.innerHTML = '<p class="panel-description">소속된 가족이 없어 기록을 표시할 수 없습니다.</p>';
            return;
        }
        const familyId = userDoc.data().familyId;
        const childId = currentUser.uid;

        const historyQuery = db.collectionGroup('history')
            .where('familyId', '==', familyId)
            .where('loggedBy', '==', childId)
            .orderBy('date', 'desc')
            .limit(5);

        const snapshot = await historyQuery.get();

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="panel-description">아직 포인트 획득 기록이 없습니다.</p>';
            return;
        }

        const histories = snapshot.docs.map(doc => doc.data());
        const fetchRoutinePromises = histories.map(hist => db.collection('families').doc(familyId).collection('routines').doc(hist.routineId).get());
        const routineSnapshots = await Promise.all(fetchRoutinePromises);
        const combinedData = histories.map((hist, index) => {
            const routineDoc = routineSnapshots[index];
            return { ...hist, routineName: routineDoc.exists ? routineDoc.data().name : '삭제된 미션' };
        });

        listContainer.innerHTML = '';
        combinedData.forEach(hist => listContainer.appendChild(createPointHistoryElement(hist)));
    } catch (error) {
        console.error("❌ 포인트 기록 조회 실패:", error);
        listContainer.innerHTML = '<p class="panel-description" style="color: var(--error);">기록을 불러오는 데 실패했습니다.</p>';
    }
}

// ====================================================================
// 4. 핵심 로직
// ====================================================================
async function completeMission(routine, updatedFields = {}) {
    if (!currentUser || !routine.path) {
        showNotification("미션 완료 처리에 필요한 정보가 부족합니다.", "error");
        return;
    }
    try {
        const routineRef = db.doc(routine.path);
        let dataToUpdate = {
            status: 'completed',
            value: true,
            lastUpdatedDate: todayDateString,
            ...updatedFields
        };
        const goalAchieved = dataToUpdate.dailyGoalMetToday === true || routine.type === 'yesno';
        if (goalAchieved && !routine.pointsGivenToday) {
            dataToUpdate.pointsGivenToday = true;
            dataToUpdate.streak = (routine.streak || 0) + 1;
            const userRef = db.collection('users').doc(currentUser.uid);
            const pointsToAward = routine.basePoints || 0;
            await userRef.update({
                points: firebase.firestore.FieldValue.increment(pointsToAward)
            });
            await logRoutineHistory(routine.id, { value: dataToUpdate.value, pointsEarned: pointsToAward });
            showNotification(`'${routine.name}' 미션 완료! ${pointsToAward}포인트를 획득했습니다!`, 'success');
        } else if (Object.keys(updatedFields).length > 0) {
            showNotification(`'${routine.name}' 미션이 업데이트되었습니다.`, 'info');
        }
        await routineRef.update(dataToUpdate);
        await loadAssignedRoutines(currentUser.uid);
        await updateUserInfoUI(currentUser);
    } catch (error) {
        console.error("❌ [completeMission]: 미션 처리 중 오류 발생:", error);
        showNotification("미션 처리에 실패했습니다.", "error");
    }
}

async function undoMission(routine) {
    if (!currentUser || !routine.path || !confirm(`'${routine.name}' 미션 완료를 취소하시겠습니까?`)) return;
    try {
        const routineRef = db.doc(routine.path);
        const fieldsToReset = {
            status: null,
            value: routine.type === 'yesno' ? false : 0,
            dailyGoalMetToday: false,
            pointsGivenToday: false,
            lastUpdatedDate: todayDateString
        };
        if (routine.type === 'reading') {
            fieldsToReset.currentPage = Math.max(routine.startPage - 1, (routine.currentPage || 0) - (routine.dailyReadPagesToday || 0));
            fieldsToReset.dailyReadPagesToday = 0;
        }
        if (routine.pointsGivenToday) {
            fieldsToReset.streak = Math.max(0, (routine.streak || 0) - 1);
            const userRef = db.collection('users').doc(currentUser.uid);
            await userRef.update({
                points: firebase.firestore.FieldValue.increment(-(routine.basePoints || 0))
            });
        }
        await routineRef.update(fieldsToReset);
        showNotification(`'${routine.name}' 미션 완료가 취소되었습니다.`, 'warning');
        await loadAssignedRoutines(currentUser.uid);
        await updateUserInfoUI(currentUser);
    } catch (error) {
        console.error("❌ [undoMission]: 미션 취소 처리 중 오류 발생:", error);
        showNotification("미션 취소에 실패했습니다.", "error");
    }
}

// ====================================================================
// 5. 렌더링 및 UI 요소 생성
// ====================================================================
function renderMissions() {
    const lists = {
        incomplete: document.getElementById('incompleteRoutineList'),
        inprogress: document.getElementById('inprogressRoutineList'),
        completed: document.getElementById('completedRoutineList')
    };
    if (!lists.incomplete || !lists.inprogress || !lists.completed) return;
    Object.values(lists).forEach(list => list.innerHTML = '');
    const activeRoutines = assignedRoutines.filter(r => r.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
    activeRoutines.forEach(routine => {
        const isCompleted = isRoutineCompleted(routine);
        const isInProgress = isRoutineInProgress(routine);
        const element = createMissionElement(routine, isCompleted, isInProgress);
        if (isCompleted) lists.completed.appendChild(element);
        else if (isInProgress) lists.inprogress.appendChild(element);
        else lists.incomplete.appendChild(element);
    });
    document.getElementById('inprogress-section').style.display = lists.inprogress.children.length > 0 ? 'block' : 'none';
    document.getElementById('completed-section').style.display = lists.completed.children.length > 0 ? 'block' : 'none';
}

function createMissionElement(routine, isCompleted, isInProgress) {
    const div = document.createElement('div');
    let classNames = `routine-item ${routine.time}`;
    if (isCompleted) classNames += ' completed';
    else if (isInProgress) classNames += ' inprogress';
    div.className = classNames;
    const streakBadge = routine.streak > 0 ? `<div class="streak-badge">🔥 ${routine.streak}</div>` : '';
    div.innerHTML = `
        <div class="routine-checkbox">${isCompleted ? '✓' : ''}</div>
        <div class="routine-content">
             <div class="routine-name"><span class="type-icon">${getTypeIcon(routine.type)}</span> ${routine.name}</div>
            <div class="routine-details"><div class="time-period">${getTimeEmoji(routine.time)} ${getTimeLabel(routine.time)}</div></div>
        </div>
        <div class="routine-value">${getRoutineValueDisplay(routine)}</div>
        ${streakBadge}
    `;
    div.addEventListener('click', () => {
        if (isCompleted) undoMission(routine);
        else {
            switch (routine.type) {
                case 'yesno': completeMission(routine, { dailyGoalMetToday: true }); break;
                case 'number': showStepperModal(routine); break;
                case 'reading': showReadingProgressModal(routine); break;
                case 'time': showTimeInputModal(routine); break;
                default: showNotification("지원되지 않는 미션 타입입니다.", "info");
            }
        }
    });
    return div;
}

function createRewardItemElement(reward) {
    const item = document.createElement('div');
    item.className = 'manage-routine-item';
    item.innerHTML = `
        <div class="routine-main-info" style="gap: 1rem;">
            <div class="routine-main-name" style="flex-grow: 1;">${reward.name}</div>
            <div class="routine-main-details" style="font-weight: 600; color: var(--primary);">✨ ${reward.points} P</div>
        </div>
        <button class="btn btn-request-reward" data-reward-id="${reward.id}" data-reward-points="${reward.points}" data-reward-name="${reward.name}">요청</button>
    `;
    return item;
}

function createPointHistoryElement(history) {
    const item = document.createElement('div');
    item.className = 'manage-routine-item';
    item.innerHTML = `
        <div class="routine-main-info" style="gap: 1rem;">
            <div class="routine-main-name" style="flex-grow: 1;">
                ${history.routineName || '알 수 없는 활동'}
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${history.date}</div>
            </div>
            <div class="routine-main-details" style="font-weight: 600; color: var(--success);">+${history.pointsEarned} P</div>
        </div>
    `;
    return item;
}

async function updateUserInfoUI(user) {
    const userInfoDiv = document.getElementById('user-info');
    const loginBtn = document.getElementById('login-btn');
    const pointsDisplay = document.getElementById('user-points-display');
    if (user) {
        userInfoDiv.style.display = 'flex';
        loginBtn.style.display = 'none';
        document.getElementById('user-name').textContent = user.displayName;
        document.getElementById('user-photo').src = user.photoURL;
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            pointsDisplay.textContent = `✨ ${userDoc.data().points || 0} P`;
        }
    } else {
        userInfoDiv.style.display = 'none';
        loginBtn.style.display = 'block';
    }
}

// ▼▼▼ 2025-08-25(수정일) 반려묘 렌더링 함수 신설 ▼▼▼
function renderCompanionCat(petData) {
    const container = document.getElementById('companion-cat-container');
    if (!container || !petData) return;

    const level = petData.level || 0;
    const expression = petData.expression || 'default';
    const name = petData.name || '나의 고양이';

    // 지금은 기본 이미지만 사용합니다. (파일명은 추후 규칙에 맞게 변경)
    const imagePath = `images/cat_stage_1_default_0.png`;

    container.innerHTML = `
        <h3 style="font-weight: 700; margin-bottom: 0.5rem;">${name} (Lv.${level})</h3>
        <img src="${imagePath}" alt="${name}" style="width: 120px; height: 120px; image-rendering: gitpixelated; image-rendering: -moz-crisp-edges;">
    `;
}
// ▲▲▲ 여기까지 2025-08-25(수정일) 반려묘 렌더링 함수 신설 ▲▲▲




// ====================================================================
// 6. 모달 제어
// ====================================================================
function showStepperModal(routine) {
    activeRoutineForModal = routine;
    const modal = document.getElementById('stepperInputModal');
    let currentValue = routine.value || routine.min || 1;
    modal.querySelector('.modal-header h3').textContent = routine.name;
    const valueDisplay = document.getElementById('stepperValue');
    valueDisplay.textContent = currentValue;
    document.getElementById('stepperUnit').textContent = routine.unit || '';
    const confirmBtn = document.getElementById('stepperConfirmBtn');
    const minusBtn = document.getElementById('stepperMinus');
    const plusBtn = document.getElementById('stepperPlus');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    const newMinusBtn = minusBtn.cloneNode(true);
    minusBtn.parentNode.replaceChild(newMinusBtn, minusBtn);
    const newPlusBtn = plusBtn.cloneNode(true);
    plusBtn.parentNode.replaceChild(newPlusBtn, plusBtn);
    const updateButtons = () => {
        newMinusBtn.disabled = currentValue <= (routine.min || 1);
        newPlusBtn.disabled = currentValue >= (routine.max || 100);
    };
    newMinusBtn.addEventListener('click', () => {
        currentValue = Math.max((routine.min || 1), currentValue - (routine.step || 1));
        valueDisplay.textContent = currentValue;
        updateButtons();
    });
    newPlusBtn.addEventListener('click', () => {
        currentValue = Math.min((routine.max || 100), currentValue + (routine.step || 1));
        valueDisplay.textContent = currentValue;
        updateButtons();
    });
    newConfirmBtn.addEventListener('click', () => handleStepperConfirm(currentValue));
    updateButtons();
    modal.style.display = 'flex';
}
function hideStepperModal() { document.getElementById('stepperInputModal').style.display = 'none'; }

function showReadingProgressModal(routine) {
    activeRoutineForModal = routine;
    const modal = document.getElementById('readingProgressModal');
    modal.querySelector('.modal-header h3').textContent = `📖 ${routine.bookTitle || routine.name}`;
    const todayRange = getTodayReadingRange(routine);
    const progress = getReadingProgress(routine);
    document.getElementById('readingInfo').innerHTML = `
        <h4>📚 ${routine.bookTitle}</h4>
        <p><strong>오늘의 목표:</strong> ${todayRange.pages} 페이지</p>
        <p><strong>현재 진행률:</strong> ${routine.currentPage || routine.startPage-1}/${routine.endPage} 페이지 (${progress}%)</p>
    `;
    const readPagesInput = document.getElementById('readPages');
    readPagesInput.value = todayRange.pages;
    document.getElementById('recommendedPages').textContent = todayRange.pages;
    document.getElementById('completionDate').textContent = getEstimatedCompletionDate(routine);
    modal.style.display = 'flex';
    readPagesInput.focus();
}
function hideReadingProgressModal() { document.getElementById('readingProgressModal').style.display = 'none'; }

function showTimeInputModal(routine) {
    activeRoutineForModal = routine;
    const modal = document.getElementById('timeInputModal');
    modal.querySelector('.modal-header h3').textContent = `⏰ ${routine.name}`;
    const timeInput = document.getElementById('timeInput');
    const now = new Date();
    timeInput.value = routine.value || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    modal.style.display = 'flex';
}
function hideTimeInputModal() { document.getElementById('timeInputModal').style.display = 'none'; }

async function handleStepperConfirm(value) {
    if (!activeRoutineForModal) return;
    const routine = activeRoutineForModal;
    const isNowGoalAchieved = value >= (routine.dailyGoal || 1);
    await completeMission(routine, { value: value, status: null, lastUpdatedDate: todayDateString, dailyGoalMetToday: isNowGoalAchieved });
    hideStepperModal();
}

async function handleReadingProgressConfirm() {
    if (!activeRoutineForModal) return;
    const readPages = parseInt(document.getElementById('readPages').value);
    if (isNaN(readPages) || readPages <= 0) return showNotification('읽은 페이지 수를 정확히 입력해주세요.', 'error');
    const routine = activeRoutineForModal;
    const newCurrentPage = Math.min((routine.currentPage || (routine.startPage ? routine.startPage - 1 : 0)) + readPages, routine.endPage);
    const newDailyReadPagesToday = (routine.dailyReadPagesToday || 0) + readPages;
    const newDailyGoalMetToday = newDailyReadPagesToday >= routine.dailyPages;
    await completeMission(routine, { value: newCurrentPage, currentPage: newCurrentPage, status: null, dailyReadPagesToday: newDailyReadPagesToday, dailyGoalMetToday: newDailyGoalMetToday, lastUpdatedDate: todayDateString });
    hideReadingProgressModal();
}

async function handleTimeInputConfirm() {
    if (!activeRoutineForModal) return;
    const value = document.getElementById('timeInput').value;
    if (!value) return showNotification('시간을 선택해주세요.', 'error');
    await completeMission(activeRoutineForModal, { value: value, status: 'completed', dailyGoalMetToday: true });
    hideTimeInputModal();
}

// ====================================================================
// 7. 이벤트 리스너 및 유틸리티
// ====================================================================
function setupEventListeners() {
    document.getElementById('logout-btn')?.addEventListener('click', () => firebase.auth().signOut());
    document.getElementById('navHomeBtn')?.addEventListener('click', showHomePage);
    document.getElementById('navRewardsBtn')?.addEventListener('click', showRewardsPage);
    const rewardList = document.getElementById('reward-store-list');
    if (rewardList) {
        rewardList.addEventListener('click', async (e) => {
            if (e.target.matches('.btn-request-reward')) {
                const button = e.target;
                button.disabled = true;
                button.textContent = '확인 중...';
                try {
                    const userRef = db.collection('users').doc(currentUser.uid);
                    const userDoc = await userRef.get();
                    const currentPoints = userDoc.data().points || 0;
                    const requiredPoints = parseInt(button.dataset.rewardPoints);
                    const rewardName = button.dataset.rewardName;
                    if (currentPoints < requiredPoints) {
                        showNotification(`포인트가 부족합니다! (현재: ${currentPoints} P)`, 'error');
                        button.disabled = false;
                        button.textContent = '요청';
                        return;
                    }
                    if (confirm(`정말로 ${requiredPoints} 포인트를 사용해서 '${rewardName}'을(를) 요청하시겠습니까?`)) {
                        const familyId = userDoc.data().familyId;
                        const requestsRef = db.collection('families').doc(familyId).collection('reward_requests');
                        await requestsRef.add({
                            childId: currentUser.uid, childName: currentUser.displayName,
                            rewardId: button.dataset.rewardId, rewardName: rewardName,
                            points: requiredPoints, status: 'pending', requestedAt: new Date()
                        });
                        showNotification(`'${rewardName}'을(를) 성공적으로 요청했습니다!`, 'success');
                        button.textContent = '요청 완료';
                    } else {
                        button.disabled = false;
                        button.textContent = '요청';
                    }
                } catch (error) {
                    console.error("❌ 보상 요청 실패:", error);
                    showNotification("보상 요청 중 오류가 발생했습니다.", "error");
                    button.disabled = false;
                    button.textContent = '요청';
                }
            }
        });
    }
    // ★★★ '보유 쿠폰' 목록에 대한 이벤트 리스너 추가 ★★★
    const couponList = document.getElementById('my-coupons-list');
    if (couponList) {
        couponList.addEventListener('click', (e) => {
            if (e.target.matches('.btn-use-reward')) {
                const button = e.target;
                const requestId = button.dataset.id;
                const rewardName = button.dataset.name;
                const points = parseInt(button.dataset.points);
                useReward(requestId, rewardName, points);
            }
        });
    }
    
    setupModal('stepperInputModal', hideStepperModal);
    setupModal('readingProgressModal', hideReadingProgressModal, handleReadingProgressConfirm);
    setupModal('timeInputModal', hideTimeInputModal, handleTimeInputConfirm);
}

function setupModal(modalId, hideFn, confirmFn = null) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.querySelector('.modal-close')?.addEventListener('click', hideFn);
    modal.querySelector('.btn-secondary')?.addEventListener('click', hideFn);
    modal.addEventListener('click', (e) => { if (e.target === e.currentTarget) hideFn(); });
    if (confirmFn) {
        const confirmButton = modal.querySelector('.btn-confirm');
        if (confirmButton) {
            confirmButton.addEventListener('click', confirmFn);
        }
    }
}

function showHomePage() {
    document.getElementById('main-app-content').style.display = 'block';
    document.getElementById('rewards-page').style.display = 'none';
    document.getElementById('navHomeBtn').classList.add('active');
    document.getElementById('navRewardsBtn').classList.remove('active');
}

// ▼▼▼ 2025-08-25(수정일) showRewardsPage에 쿠폰 로딩 명령 추가 ▼▼▼
function showRewardsPage() {
    console.log("▶️ [child.js] '보상' 버튼 클릭 감지! showRewardsPage 함수 호출 성공!");

    document.getElementById('main-app-content').style.display = 'none';
    document.getElementById('rewards-page').style.display = 'block';
    document.getElementById('navHomeBtn').classList.remove('active');
    document.getElementById('navRewardsBtn').classList.add('active');

    loadAndRenderRewards(); // 보상 상점 목록 로드
    loadAndRenderPointHistory(); // 포인트 획득 기록 로드
    loadAndRenderApprovedRewards(); // ★★★ 보유 쿠폰 목록 로드 명령 추가 ★★★
}
// ▲▲▲ 여기까지 2025-08-25(수정일) showRewardsPage에 쿠폰 로딩 명령 추가 ▲▲▲

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// ====================================================================
// 8. 헬퍼 함수
// ====================================================================
function getTypeIcon(type) { return { 'yesno': '✅', 'number': '🔢', 'time': '⏰', 'reading': '📚' }[type] || '📝'; }
function getTimeEmoji(time) { return { 'morning': '🌅', 'afternoon': '🌞', 'evening': '🌙' }[time] || '⏰'; }
function getTimeLabel(time) { return { 'morning': '아침', 'afternoon': '점심', 'evening': '저녁' }[time] || '시간'; }
function getRoutineValueDisplay(routine) {
    if (routine.type === 'yesno') return routine.value === true ? '완료!' : '';
    if (routine.type === 'reading') {
        const progress = getReadingProgress(routine);
        return `${routine.currentPage || routine.startPage - 1}/${routine.endPage}p (${progress}%)`;
    }
    if (routine.type === 'number') {
        const value = routine.value || 0;
        if (routine.dailyGoal) return `${value} / ${routine.dailyGoal} ${routine.unit || ''}`;
        return `${value} ${routine.unit || ''}`;
    }
    if (routine.type === 'time') return routine.value || '';
    return '';
}
function isRoutineCompleted(routine) {
    if (routine.status === 'skipped') return false;
    if (isContinuousRoutine(routine) || isReadingRoutine(routine)) return routine.dailyGoalMetToday === true;
    if (routine.type === 'yesno') return routine.value === true;
    if (routine.type === 'number' && !isContinuousRoutine(routine)) return routine.value !== null && routine.value > 0;
    if (routine.type === 'time') return !!routine.value;
    return false;
}
function isRoutineInProgress(routine) {
    if (isRoutineCompleted(routine) || routine.status === 'skipped') return false;
    if (isReadingRoutine(routine)) return (routine.currentPage || 0) > (routine.startPage - 1);
    if (isContinuousRoutine(routine)) return (routine.value || 0) > 0;
    return false;
}
function isContinuousRoutine(routine) { return routine.continuous === true; }
function isReadingRoutine(routine) { return routine.type === 'reading'; }
function getReadingProgress(routine) {
    if (!routine || routine.type !== 'reading' || !routine.endPage || !routine.startPage) return 0;
    const totalPages = routine.endPage - routine.startPage + 1;
    const readPages = (routine.currentPage || routine.startPage - 1) - routine.startPage + 1;
    if (totalPages <= 0 || readPages < 0) return 0;
    return Math.min(100, Math.round((readPages / totalPages) * 100));
}
function getTodayReadingRange(routine) {
    if (!routine || routine.type !== 'reading') return { start: 0, end: 0, pages: 0 };
    const currentPage = routine.currentPage || routine.startPage - 1;
    const dailyPages = routine.dailyPages || 10;
    const todayStart = currentPage + 1;
    const todayEnd = Math.min(currentPage + dailyPages, routine.endPage);
    return { start: todayStart, end: todayEnd, pages: Math.max(0, todayEnd - todayStart + 1) };
}
function getEstimatedCompletionDate(routine) {
    if (!routine || routine.type !== 'reading' || routine.currentPage >= routine.endPage) return '완료';
    const remainingPages = routine.endPage - (routine.currentPage || routine.startPage - 1);
    const dailyPages = routine.dailyPages || 10;
    if (dailyPages <= 0) return '계산 불가';
    const remainingDays = Math.ceil(remainingPages / dailyPages);
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + remainingDays);
    return completionDate.toLocaleDateString('ko-KR');
}
// ▼▼▼ 2025-08-25(수정일) 자체적으로 최신 정보를 조회하는 logRoutineHistory 최종 버전 ▼▼▼
// ▼▼▼ 2025-08-25(수정일) userDoc.exists()를 userDoc.exists 속성으로 최종 수정 ▼▼▼
async function logRoutineHistory(routineId, dataToLog) {
    console.log(`[logRoutineHistory] 미션(${routineId})에 대한 활동 보고서 작성을 시작합니다.`);
    
    const user = firebase.auth().currentUser;
    if (!user) {
        console.error("❌ [logRoutineHistory] 보고 장교가 현재 사용자 정보를 확보할 수 없습니다.");
        return;
    }

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        // ★★★ 핵심 수정: userDoc.exists() -> userDoc.exists 로 변경 ★★★
        if (!userDoc.exists || !userDoc.data().familyId) {
            console.error("❌ [logRoutineHistory] 사용자의 familyId 정보를 찾을 수 없어 보고를 중단합니다.");
            return;
        }
        const familyId = userDoc.data().familyId;

        const today = new Date();
        const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const historyRef = db.collection('families').doc(familyId)
                             .collection('routines').doc(String(routineId))
                             .collection('history').doc(dateString);
        
        await historyRef.set({
            routineId: routineId,
            date: dateString,
            familyId: familyId,
            ...dataToLog,
            loggedBy: user.uid
        }, { merge: true });

        console.log(`✅ [logRoutineHistory] 활동 보고서 제출 완료.`);

    } catch (error) {
        console.error("❌ [logRoutineHistory] 보고서 제출 중 치명적인 에러 발생:", error);
    }
}
// ▲▲▲ 여기까지 2025-08-25(수정일) logRoutineHistory 최종 버전 ▲▲▲

// ▲▲▲ 여기까지 2025-08-25(수정일) logRoutineHistory 최종 버전 ▲▲▲
// ▼▼▼ 2025-08-25(수정일) 타이밍 문제를 회피하고 직접 신원을 조회하는 최종 테스트 함수 ▼▼▼
async function testDirectWrite() {
    console.log("▶️ Direct Command Test: Firebase 직접 조회 쓰기 테스트를 시작합니다.");

    // 1. Firebase 사령부에 현재 사용자 직접 조회
    const user = firebase.auth().currentUser;

    if (!user) {
        console.error("❌ 테스트 실패: Firebase가 현재 로그인된 사용자를 인식하지 못했습니다. 새로고침 후 다시 시도하십시오.");
        alert("❌ 테스트 실패: 로그인이 확인되지 않았습니다.");
        return;
    }
    console.log(`[정보] 현재 사용자 UID 직접 조회 성공: ${user.uid}`);

    try {
        // 2. 인사 기록부(Firestore)에서 소속 부대(familyId) 직접 조회
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || !userDoc.data().familyId) {
            console.error("❌ 테스트 실패: Firestore의 사용자 문서에서 familyId를 찾을 수 없습니다.");
            alert("❌ 테스트 실패: 가족 정보가 확인되지 않았습니다.");
            return;
        }
        const familyId = userDoc.data().familyId;
        console.log(`[정보] 소속 Family ID 직접 조회 성공: ${familyId}`);

        // 3. 테스트 데이터로 쓰기 시도
        const testRoutineId = "DIRECT_TEST_007";
        const testDateString = new Date().toISOString().split('T')[0];
        const historyRef = db.collection('families').doc(familyId)
                             .collection('routines').doc(testRoutineId)
                             .collection('history').doc(testDateString);

        await historyRef.set({
            message: "Direct write test successful.",
            loggedBy: user.uid,
            familyId: familyId,
            date: testDateString,
            pointsEarned: 777
        });

        console.log("✅ [테스트 성공] Firestore 쓰기 작업이 성공적으로 완료되었습니다.");
        alert("✅ 테스트 성공! Firestore 쓰기 권한 및 기능이 정상입니다.");

    } catch (error) {
        console.error("❌ [테스트 실패] Firestore 쓰기 작업 중 치명적인 에러가 발생했습니다.", error);
        alert("❌ 테스트 실패! Firestore 보안 규칙 문제일 가능성이 높습니다. 개발자 콘솔의 상세 에러를 확인하십시오.");
    }
}
// ▲▲▲ 여기까지 2025-08-25(수정일) 최종 테스트 함수 ▲▲▲
// ▼▼▼ 2025-08-25(수정일) '보유 쿠폰' 관련 기능 부대 창설 ▼▼▼

// [쿠폰 목록화 장교] Firestore에서 승인된 보상(쿠폰)을 가져와 화면에 표시합니다.
// ▼▼▼ 2025-08-25(수정일) '쿠폰 보관함' 기능에 첩보 위성 탑재 ▼▼▼
async function loadAndRenderApprovedRewards() {
    if (!currentUser) return;
    const listContainer = document.getElementById('my-coupons-list');
    const section = document.getElementById('my-coupons-section');
    listContainer.innerHTML = '<p class="panel-description">쿠폰을 확인하는 중...</p>';

    try {
        // =================================================================
        // ▼▼▼ 첩보 위성 데이터 수집 코드 ▼▼▼
        console.log("🛰️ === 쿠폰 보관함 감청 시작 === 🛰️");
        console.log(`[위성] 사용자 ID '${currentUser.uid}'의 'approved' 상태 쿠폰을 조회합니다.`);
        console.log(`[위성] 소속 가족 ID: ${currentUser.familyId}`);
        // ▲▲▲ 여기까지 첩보 위성 코드 ▲▲▲
        // =================================================================

        const requestsRef = db.collection('families').doc(currentUser.familyId).collection('reward_requests');
        const snapshot = await requestsRef
            .where('childId', '==', currentUser.uid)
            .where('status', '==', 'approved')
            .orderBy('requestedAt', 'desc')
            .get();

        // =================================================================
        // ▼▼▼ 첩보 위성 데이터 수집 코드 ▼▼▼
        console.log(`[위성] Firestore 응답 수신. 발견된 쿠폰 수: ${snapshot.size}`);
        console.log(`[위성] 쿠폰 목록이 비어있는가? (snapshot.empty): ${snapshot.empty}`);
        // ▲▲▲ 여기까지 첩보 위성 코드 ▲▲▲
        // =================================================================

        if (snapshot.empty) {
            section.style.display = 'none';
            console.log("[위성] 발견된 쿠폰이 없어 작전을 중단합니다.");
            return;
        }
        
        section.style.display = 'block';
        listContainer.innerHTML = '';
        const rewards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // =================================================================
        // ▼▼▼ 첩보 위성 데이터 수집 코드 ▼▼▼
        console.log("[위성] 화면에 표시할 최종 쿠폰 데이터:", JSON.parse(JSON.stringify(rewards)));
        // ▲▲▲ 여기까지 첩보 위성 코드 ▲▲▲
        // =================================================================

        rewards.forEach(reward => {
            const couponElement = createApprovedRewardElement(reward);
            listContainer.appendChild(couponElement);
        });

    } catch (error) {
        // =================================================================
        // ▼▼▼ 첩보 위성 데이터 수집 코드 ▼▼▼
        console.error("❌ [위성] 쿠폰 보관함 조회 중 치명적인 에러 발생:", error);
        if (error.code === 'failed-precondition') {
            console.warn("🔥[제미군 경고] Firestore 색인이 필요할 수 있습니다. 콘솔의 다른 에러 메시지에 포함된 링크를 클릭하여 색인을 생성하십시오.");
        }
        // ▲▲▲ 여기까지 첩보 위성 코드 ▲▲▲
        // =================================================================
        section.style.display = 'none'; // 에러 발생 시에도 섹션을 숨김
    } finally {
        console.log("🛰️ === 쿠폰 보관함 감청 종료 === 🛰️");
    }
}
// ▲▲▲ 여기까지 2025-08-25(수정일) '쿠폰 보관함' 기능에 첩보 위성 탑재 ▲▲▲

// [쿠폰 디자인 병사] 개별 쿠폰 아이템의 HTML 구조를 생성합니다.
function createApprovedRewardElement(reward) {
    const item = document.createElement('div');
    item.className = 'manage-routine-item'; // 기존 스타일 재활용
    item.style.cursor = 'pointer';
    item.innerHTML = `
        <div class="routine-main-info" style="gap: 1rem;">
            <div class="routine-main-name" style="flex-grow: 1;">${reward.rewardName}</div>
            <div class="routine-main-details" style="font-weight: 600; color: var(--primary);">✨ ${reward.points} P</div>
        </div>
        <button class="btn btn-use-reward" data-id="${reward.id}" data-name="${reward.rewardName}" data-points="${reward.points}" style="background-color: var(--secondary);">
            사용하기
        </button>
    `;
    return item;
}

// [포인트 집행 장교] '사용하기' 버튼 클릭 시, 포인트를 차감하고 상태를 변경합니다.
async function useReward(requestId, rewardName, points) {
    if (!confirm(`'${rewardName}' 쿠폰을 사용하시겠습니까? ${points}포인트가 차감됩니다.`)) return;

    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        const requestRef = db.collection('families').doc(currentUser.familyId).collection('reward_requests').doc(requestId);

        // 자녀의 현재 포인트를 다시 한번 확인합니다.
        const userDoc = await userRef.get();
        const currentPoints = userDoc.data().points || 0;
        if (currentPoints < points) {
            showNotification("포인트가 부족하여 쿠폰을 사용할 수 없습니다!", "error");
            return;
        }

        // 포인트 차감 및 쿠폰 상태 '사용 완료'로 변경
        await userRef.update({ points: firebase.firestore.FieldValue.increment(-points) });
        await requestRef.update({ status: 'used' });

        showNotification(`'${rewardName}' 쿠폰 사용 완료!`, 'success');

        // 목록과 헤더 포인트를 즉시 새로고침
        await loadAndRenderApprovedRewards();
        await updateUserInfoUI(currentUser);

    } catch (error) {
        console.error("❌ 쿠폰 사용 실패:", error);
        showNotification("쿠폰 사용 중 오류가 발생했습니다.", "error");
    }
}
// ▲▲▲ 여기까지 2025-08-25(수정일) '보유 쿠폰' 관련 기능 부대 창설 ▲▲▲
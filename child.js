// ▼▼▼ 2025-08-24(수정일) 전역 변수 추가 ▼▼▼
// ====================================================================
// 1. 전역 변수 (자녀용)
// ====================================================================
let currentUser = null;
let assignedRoutines = [];
let userStats = {}; // 부모 앱과의 호환성을 위해 추가
let activeRoutineForModal = null; // 모달 상호작용을 위해 추가
const today = new Date(); // 날짜 계산을 위해 추가
const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
// ▲▲▲ 여기까지 2025-08-24(수정일) 전역 변수 추가 ▲▲▲

// ====================================================================
// 2. 앱 시작점 (자녀용)
// ====================================================================
// ▼▼▼ 2025-08-24(수정일) 누락된 Google 로그인 기능 긴급 복구 ▼▼▼
document.addEventListener('DOMContentLoaded', () => {
    // --- Google 로그인 제공자 설정 ---
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    // --- 로그인 버튼에 이벤트 연결 ---
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            try {
                // 모바일/데스크탑 환경에 따라 다른 로그인 방식 제공
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

    // --- Firebase 인증 상태 감지 (기존 코드 유지) ---
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            // 부모 역할일 경우, 중앙 사령부(index.html)로 즉시 이동
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists && userDoc.data().role === 'parent') {
                window.location.href = 'index.html';
                return;
            }
            
            // UI 업데이트 및 데이터 로딩
            await updateUserInfoUI(user); // await 추가하여 포인트 로딩 대기
            await loadAssignedRoutines(user.uid);
            showHomePage();
        } else {
            currentUser = null;
            updateUserInfoUI(null);
            renderMissions();
        }
    });

    // --- 기타 이벤트 리스너 설정 (기존 코드 유지) ---
    setupEventListeners();
});
// ▲▲▲ 여기까지 2025-08-24(수정일) 누락된 Google 로그인 기능 긴급 복구 ▲▲▲

// ====================================================================
// 3. 데이터 로직 (자녀용)
// ====================================================================
// 자녀에게 할당된 루틴만 가져오는 최적화된 함수
// ▼▼▼ 2025-08-21 컬렉션 그룹 쿼리로 검색 방식 변경 ▼▼▼
// ▼▼▼ 2025-08-23 '가족 공유' 모델에 맞춰 자녀 루틴 로딩 방식 변경 ▼▼▼
async function loadAssignedRoutines(userId) {
    if (!currentUser) return;
    console.log(`📌 [loadAssignedRoutines]: 자녀(${userId})의 미션 로딩 시작...`);

    try {
        // 1. 자신의 사용자 정보를 가져와 familyId를 확보합니다.
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists || !userDoc.data().familyId) {
            console.warn("⚠️ 가족에 소속되어 있지 않아 미션을 가져올 수 없습니다.");
            assignedRoutines = [];
            renderMissions();
            return;
        }
        const familyId = userDoc.data().familyId;
        console.log(`- 소속 가족 ID: ${familyId}`);

        // 2. ★★★ 핵심 변경: 공유 families 컬렉션에서 자신에게 할당된 루틴만 직접 쿼리합니다. ★★★
        const routinesRef = db.collection('families').doc(familyId).collection('routines');
        const snapshot = await routinesRef.where('assignedTo', '==', userId).get();

        assignedRoutines = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            path: doc.ref.path 
        }));

        console.log(`✅ [loadAssignedRoutines]: 총 ${assignedRoutines.length}개의 미션 수신 완료.`, assignedRoutines);
        renderMissions();

    } catch (error) {
        console.error("❌ [loadAssignedRoutines]: 미션 로딩 중 오류 발생:", error);
        showNotification("미션을 가져오는 데 실패했습니다.", "error");
    }
}
// ▲▲▲ 여기까지 2025-08-23 '가족 공유' 모델에 맞춰 자녀 루틴 로딩 방식 변경 ▲▲▲



// ====================================================================
// 4. 렌더링 (자녀용)
// ====================================================================

// ▼▼▼ 2025-08-24(수정일) '진행 중' 상태를 반영하도록 renderMissions 함수 개편 ▼▼▼
function renderMissions() {
    const incompleteList = document.getElementById('incompleteRoutineList');
    const inprogressList = document.getElementById('inprogressRoutineList'); // 진행 중 목록
    const completedList = document.getElementById('completedRoutineList');
    
    if (!incompleteList || !inprogressList || !completedList) return;

    // 모든 목록 초기화
    incompleteList.innerHTML = '';
    inprogressList.innerHTML = '';
    completedList.innerHTML = '';

    const activeRoutines = assignedRoutines.filter(r => r.active !== false);
    
    activeRoutines.forEach(routine => {
        const isCompleted = isRoutineCompleted(routine);
        const isInProgress = isRoutineInProgress(routine); // 진행 중 상태 판단
        const element = createMissionElement(routine, isCompleted, isInProgress); // isInProgress 전달
        
        // 상태에 따라 다른 목록에 추가
        if (isCompleted) {
            completedList.appendChild(element);
        } else if (isInProgress) {
            inprogressList.appendChild(element);
        } else {
            incompleteList.appendChild(element);
        }
    });

    // 목록에 내용이 있을 때만 해당 섹션을 표시
    document.getElementById('inprogress-section').style.display = inprogressList.children.length > 0 ? 'block' : 'none';
    document.getElementById('completed-section').style.display = completedList.children.length > 0 ? 'block' : 'none';
}

// ▼▼▼ 2025-08-24(수정일) createMissionElement 함수 전면 개선 ▼▼▼
// child.js의 createMissionElement 함수를 찾아 교체

// ▼▼▼ 2025-08-24(수정일) 완료된 미션 취소 기능 추가 ▼▼▼
// ▼▼▼ 2025-08-24(수정일) createMissionElement가 모달을 호출하도록 개편 ▼▼▼
function createMissionElement(routine, isCompleted, isInProgress) {
    const div = document.createElement('div');
    let classNames = `routine-item ${routine.time}`;
    if (isCompleted) {
        classNames += ' completed';
    } else if (isInProgress) {
        classNames += ' inprogress';
    }
    div.className = classNames;

    const streakBadge = routine.streak > 0 ? `<div class="streak-badge">🔥 ${routine.streak}</div>` : '';
    div.innerHTML = `
        <div class="routine-checkbox">${isCompleted ? '✓' : ''}</div>
        <div class="routine-content">
             <div class="routine-name">
                <span class="type-icon">${getTypeIcon(routine.type)}</span> ${routine.name}
            </div>
            <div class="routine-details">
                <div class="time-period">${getTimeEmoji(routine.time)} ${getTimeLabel(routine.time)}</div>
            </div>
        </div>
        <div class="routine-value">${getRoutineValueDisplay(routine)}</div>
        ${streakBadge}
    `;

    div.addEventListener('click', () => {
        if (isCompleted) {
            // 완료된 미션일 경우, '취소' 작전 수행
            undoMission(routine);
        } else {
            // 완료되지 않은 미션일 경우, 타입에 맞는 모달 호출
            switch (routine.type) {
                case 'yesno':
                    completeMission(routine); // Yes/No는 바로 완료 처리
                    break;
                case 'number':
                    showStepperModal(routine);
                    break;
                case 'reading':
                    showReadingProgressModal(routine);
                    break;
                case 'time':
                    showTimeInputModal(routine);
                    break;
                default:
                    showNotification("아직 지원되지 않는 미션 타입입니다.", "info");
            }
        }
    });

    return div;
}
// ▲▲▲ 여기까지 2025-08-24(수정일) createMissionElement가 모달을 호출하도록 개편 ▲▲▲

// 아래 함수들이 child.js에 없다면 script.js에서 복사하여 추가해야 합니다.
function getTypeIcon(type) { return { 'yesno': '✅', 'number': '🔢', 'time': '⏰', 'reading': '📚' }[type] || '📝'; }
function getTimeEmoji(time) { return { 'morning': '🌅', 'afternoon': '🌞', 'evening': '🌙' }[time] || '⏰'; }
function getTimeLabel(time) { return { 'morning': '아침', 'afternoon': '점심', 'evening': '저녁' }[time] || '시간'; }
// ▼▼▼ 2025-08-24(수정일) getRoutineValueDisplay 함수 개선 ▼▼▼
function getRoutineValueDisplay(routine) {
    if (routine.type === 'yesno') {
        return routine.value === true ? '완료!' : '';
    }
    if (routine.type === 'reading') {
        const progress = getReadingProgress(routine);
        return `${routine.currentPage || routine.startPage - 1}/${routine.endPage}p (${progress}%)`;
    }
    if (routine.type === 'number') {
        const value = routine.value || 0;
        if (routine.dailyGoal) {
            const progress = Math.min(100, Math.round((value / routine.dailyGoal) * 100));
            return `${value} / ${routine.dailyGoal} ${routine.unit || ''} (${progress}%)`;
        }
        return `${value} ${routine.unit || ''}`;
    }
    if (routine.type === 'time') {
        return routine.value || '';
    }
    return '';
}
// ▲▲▲ 여기까지 2025-08-24(수정일) getRoutineValueDisplay 함수 개선 ▲▲▲
// ▲▲▲ 여기까지 2025-08-24(수정일) createMissionElement 함수 전면 개선 ▲▲▲

// ▼▼▼ 2025-08-24(수정일) 보상 목록 로드 및 렌더링 함수 추가 ▼▼▼

// [병참 장교] Firestore에서 보상 목록을 가져와 화면에 표시하는 주력 함수
async function loadAndRenderRewards() {
    if (!currentUser) return;
    const listContainer = document.getElementById('reward-store-list');
    listContainer.innerHTML = '<p class="panel-description">보상 목록을 불러오는 중...</p>';

    // 1. 자신의 familyId를 확보합니다.
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (!userDoc.exists || !userDoc.data().familyId) {
        listContainer.innerHTML = '<p class="panel-description">소속된 가족이 없어 보상 목록을 표시할 수 없습니다.</p>';
        return;
    }
    const familyId = userDoc.data().familyId;

    // 2. 가족의 'rewards' 컬렉션에서 모든 보상 데이터를 가져옵니다.
    const rewardsRef = db.collection('families').doc(familyId).collection('rewards');
    const snapshot = await rewardsRef.where('isActive', '==', true).orderBy('points').get();

    if (snapshot.empty) {
        listContainer.innerHTML = '<p class="panel-description">아직 등록된 보상이 없습니다. 부모님께 요청해보세요!</p>';
        return;
    }

    listContainer.innerHTML = ''; // 로딩 메시지 제거
    const rewards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // 3. 각 보상 아이템을 화면에 진열합니다.
    rewards.forEach(reward => {
        const rewardElement = createRewardItemElement(reward);
        listContainer.appendChild(rewardElement);
    });
}

// [설계 장교] 개별 보상 아이템의 HTML 구조를 생성하는 지원 함수
function createRewardItemElement(reward) {
    const item = document.createElement('div');
    item.className = 'manage-routine-item'; // 기존 스타일 재활용
    item.innerHTML = `
        <div class="routine-main-info" style="gap: 1rem;">
            <div class="routine-main-name" style="flex-grow: 1;">${reward.name}</div>
            <div class="routine-main-details" style="font-weight: 600; color: var(--primary);">✨ ${reward.points} P</div>
        </div>
        <button class="btn btn-request-reward" data-reward-id="${reward.id}" data-reward-points="${reward.points}" data-reward-name="${reward.name}">
            요청
        </button>
    `;
    return item;
}

// ▲▲▲ 여기까지 2025-08-24(수정일) 보상 목록 로드 및 렌더링 함수 추가 ▲▲▲


// ====================================================================
// 5. 핵심 로직 (자녀용)
// ====================================================================
// 미션 완료 처리 함수
// ▼▼▼ 2025-08-21 미션 완료 로직 수정 ▼▼▼
// ▼▼▼ 2025-08-24(수정일) completeMission 함수 기능 격상 ▼▼▼
// ▼▼▼ 2025-08-25(수정일) completeMission 함수에 활동 보고(logRoutineHistory) 절차 추가 ▼▼▼
async function completeMission(routine, updatedFields = {}) {
    if (!currentUser || !routine.path) {
        showNotification("미션 완료 처리에 필요한 정보가 부족합니다.", "error");
        return;
    }
    console.log(`📌 [completeMission]: 미션(${routine.name}) 처리 시작...`, updatedFields);

    try {
        const routineRef = db.doc(routine.path);
        
        let dataToUpdate = {
            status: 'completed',
            value: true,
            lastUpdatedDate: new Date().toISOString().split('T')[0],
            ...updatedFields
        };

        const goalAchieved = dataToUpdate.dailyGoalMetToday === true || routine.type === 'yesno';
        
        if (goalAchieved && !routine.pointsGivenToday) {
            dataToUpdate.pointsGivenToday = true;
            dataToUpdate.streak = (routine.streak || 0) + 1;

            const userRef = db.collection('users').doc(currentUser.uid);
            await userRef.update({
                points: firebase.firestore.FieldValue.increment(routine.basePoints || 0)
            });

            // ★★★ 핵심 수정: 포인트 지급 후 즉시 활동 보고서를 제출합니다. ★★★
            await logRoutineHistory(routine.id, { value: dataToUpdate.value, pointsEarned: routine.basePoints || 0 });

            showNotification(`'${routine.name}' 미션 완료! ${routine.basePoints || 0}포인트를 획득했습니다!`, 'success');
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
// ▲▲▲ 여기까지 2025-08-25(수정일) completeMission 함수에 활동 보고(logRoutineHistory) 절차 추가 ▲▲▲

// ▲▲▲ 여기까지 2025-08-21 미션 완료 로직 수정 ▲▲▲
// ====================================================================
// 6. UI 및 이벤트 리스너 (자녀용)
// ====================================================================
// child.js 파일

// ▼▼▼ 2025-08-24(수정일) updateUserInfoUI 함수에 포인트 표시 기능 추가 ▼▼▼
async function updateUserInfoUI(user) { // async 키워드 추가
    const userInfoDiv = document.getElementById('user-info');
    const loginBtn = document.getElementById('login-btn');
    const pointsDisplay = document.getElementById('user-points-display'); // 포인트 표시부

    if (user) {
        userInfoDiv.style.display = 'flex';
        loginBtn.style.display = 'none';
        document.getElementById('user-name').textContent = user.displayName;
        document.getElementById('user-photo').src = user.photoURL;
        
        // Firestore에서 최신 사용자 정보를 가져와 포인트를 업데이트합니다.
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const userPoints = userDoc.data().points || 0;
            pointsDisplay.textContent = `✨ ${userPoints} P`;
        }

    } else {
        userInfoDiv.style.display = 'none';
        loginBtn.style.display = 'block';
    }
}
// ▲▲▲ 여기까지 2025-08-24(수정일) updateUserInfoUI 함수에 포인트 표시 기능 추가 ▲▲▲

// ▼▼▼ 2025-08-24(수정일) setupEventListeners 함수에 최종 요청 로직 추가 ▼▼▼
// ▼▼▼ 2025-08-24(수정일) setupEventListeners에 모든 모달 등록 ▼▼▼
function setupEventListeners() {
    document.getElementById('logout-btn')?.addEventListener('click', () => firebase.auth().signOut());
    
    // 하단 탭 바 로직
    document.getElementById('navHomeBtn')?.addEventListener('click', showHomePage);
    document.getElementById('navRewardsBtn')?.addEventListener('click', showRewardsPage);

    // '보상 상점' 이벤트 리스너 (기존 코드 유지)
    const rewardList = document.getElementById('reward-store-list');
    if (rewardList) {
        rewardList.addEventListener('click', async (e) => {
            if (e.target.matches('.btn-request-reward')) {
                const button = e.target;
                const rewardId = button.dataset.rewardId;
                const rewardName = button.dataset.rewardName;
                const requiredPoints = parseInt(button.dataset.rewardPoints);
                
                button.disabled = true;
                button.textContent = '확인 중...';

                try {
                    const userRef = db.collection('users').doc(currentUser.uid);
                    const userDoc = await userRef.get();
                    const currentPoints = userDoc.data().points || 0;

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
                            childId: currentUser.uid,
                            childName: currentUser.displayName,
                            rewardId: rewardId,
                            rewardName: rewardName,
                            points: requiredPoints,
                            status: 'pending',
                            requestedAt: new Date()
                        });

                        showNotification(`'${rewardName}'을(를) 성공적으로 요청했습니다! 부모님의 승인을 기다려주세요.`, 'success');
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

    // ★★★ 모든 모달 부대를 지휘 체계에 등록합니다. ★★★
    setupModal('stepperInputModal', hideStepperModal, handleStepperConfirm);
    setupModal('readingProgressModal', hideReadingProgressModal, handleReadingProgressConfirm);
    setupModal('timeInputModal', hideTimeInputModal, handleTimeInputConfirm);
}
// ▲▲▲ 여기까지 2025-08-24(수정일) setupEventListeners에 모든 모달 등록 ▲▲▲


// ▲▲▲ 여기까지 2025-08-24(수정일) setupEventListeners 함수에 모달 설정 추가 ▲▲▲

// 페이지 전환 함수
function showHomePage() {
    document.getElementById('main-app-content').style.display = 'block';
    document.getElementById('rewards-page').style.display = 'none';
    document.getElementById('navHomeBtn').classList.add('active');
    document.getElementById('navRewardsBtn').classList.remove('active');
}

function showRewardsPage() {
    document.getElementById('main-app-content').style.display = 'none';
    document.getElementById('rewards-page').style.display = 'block';
    document.getElementById('navHomeBtn').classList.remove('active');
    document.getElementById('navRewardsBtn').classList.add('active');
        // ★★★ 보상 페이지가 열릴 때마다 보상 목록을 새로 불러오도록 명령합니다.
    loadAndRenderRewards();
    loadAndRenderPointHistory(); // 포인트 획득 기록 보고


}

// 간단한 알림 함수
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// ▲▲▲ 여기까지 08/19(수정일) 'child.js' 특수 작전 부대 편성 ▲▲

// ▼▼▼ 2025-08-24(수정일) completeMission 함수 기능 격상 ▼▼▼
async function completeMission(routine, updatedFields = {}) {
    if (!currentUser || !routine.path) {
        showNotification("미션 완료 처리에 필요한 정보가 부족합니다.", "error");
        return;
    }
    console.log(`📌 [completeMission]: 미션(${routine.name}) 완료 처리 시작...`);

    try {
        const routineRef = db.doc(routine.path);
        
        // 1. 업데이트할 기본 데이터 설정
        let dataToUpdate = {
            status: 'completed',
            value: true, // yesno 타입의 기본값
            pointsGivenToday: true,
            lastUpdatedDate: new Date().toISOString().split('T')[0],
            ...updatedFields // 모달에서 받은 추가 데이터로 덮어쓰기
        };

        // 2. 연속 달성(streak) 업데이트
        // (yesno 타입이거나, 다른 타입이지만 일일 목표를 달성했을 경우)
        const goalAchieved = dataToUpdate.dailyGoalMetToday === true || routine.type === 'yesno';
        if (goalAchieved && !routine.pointsGivenToday) {
            dataToUpdate.streak = (routine.streak || 0) + 1;
        }

        // 3. 데이터베이스에 최종 업데이트
        await routineRef.update(dataToUpdate);

        // 4. 포인트 지급 (하루 한 번만)
        if (!routine.pointsGivenToday) {
            const userRef = db.collection('users').doc(currentUser.uid);
            await userRef.update({
                points: firebase.firestore.FieldValue.increment(routine.basePoints || 0)
            });
            showNotification(`'${routine.name}' 미션 완료! ${routine.basePoints || 0}포인트를 획득했습니다!`, 'success');
        } else {
            showNotification(`'${routine.name}' 미션이 업데이트되었습니다.`, 'info');
        }

        // 5. 화면 즉시 새로고침
        await loadAssignedRoutines(currentUser.uid);
        await updateUserInfoUI(currentUser); // 헤더의 포인트도 갱신
    } catch (error) {
        console.error("❌ [completeMission]: 미션 완료 처리 중 오류 발생:", error);
        showNotification("미션 완료에 실패했습니다.", "error");
    }
}
// ▲▲▲ 여기까지 2025-08-24(수정일) completeMission 함수 기능 격상 ▲▲▲


// ▼▼▼ 2025-08-24(수정일) 누락된 모달 제어 부대 긴급 투입 ▼▼▼
// ====================================================================
// 6-A. 모달 제어 함수 (Modal Controllers)
// ====================================================================
// ▼▼▼ 2025-08-24(수정일) 부모 앱의 모달 제어 및 핸들러 부대 이식 ▼▼▼
// ====================================================================
// 6-A. 모달 제어 함수 (Modal Controllers)
// ====================================================================
function showStepperModal(routine) {
    activeRoutineForModal = routine;
    const modal = document.getElementById('stepperInputModal');
    const title = modal.querySelector('.modal-header h3');
    const valueDisplay = document.getElementById('stepperValue');
    const unitDisplay = document.getElementById('stepperUnit');
    
    let currentValue = routine.value || routine.min || 1;
    const minValue = routine.min || 1;
    const maxValue = routine.max || 100;
    const stepValue = routine.step || 1;
    
    title.textContent = routine.name;
    valueDisplay.textContent = currentValue;
    unitDisplay.textContent = routine.unit || '';

    const confirmBtn = document.getElementById('stepperConfirmBtn');
    const minusBtn = document.getElementById('stepperMinus');
    const plusBtn = document.getElementById('stepperPlus');

    // 이벤트 리스너 중복을 막기 위해 기존 버튼을 복제하여 교체
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    const newMinusBtn = minusBtn.cloneNode(true);
    minusBtn.parentNode.replaceChild(newMinusBtn, minusBtn);
    const newPlusBtn = plusBtn.cloneNode(true);
    plusBtn.parentNode.replaceChild(newPlusBtn, plusBtn);

    const updateStepperButtons = () => {
        newMinusBtn.disabled = currentValue <= minValue;
        newPlusBtn.disabled = currentValue >= maxValue;
    };

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
    
    newConfirmBtn.addEventListener('click', () => handleStepperConfirm(currentValue));
    
    updateStepperButtons();
    modal.style.display = 'flex';
}

function hideStepperModal() {
    document.getElementById('stepperInputModal').style.display = 'none';
}

function showReadingProgressModal(routine) {
    activeRoutineForModal = routine;
    
    const modal = document.getElementById('readingProgressModal');
    if (!modal) return;

    modal.querySelector('.modal-header h3').textContent = `📖 ${routine.bookTitle || routine.name}`;

    const todayRange = getTodayReadingRange(routine);
    const progress = getReadingProgress(routine);

    const readingInfo = document.getElementById('readingInfo');
    if (readingInfo) {
        readingInfo.innerHTML = `
            <h4>📚 ${routine.bookTitle}</h4>
            <p><strong>오늘의 목표:</strong> ${todayRange.pages} 페이지</p>
            <p><strong>현재 진행률:</strong> ${routine.currentPage || routine.startPage-1}/${routine.endPage} 페이지 (${progress}%)</p>
        `;
    }

    const readPagesInput = document.getElementById('readPages');
    const recommendedPages = document.getElementById('recommendedPages');
    if (readPagesInput) readPagesInput.value = todayRange.pages;
    if (recommendedPages) recommendedPages.textContent = todayRange.pages;

    const completionDateEl = document.getElementById('completionDate');
    if (completionDateEl) {
        completionDateEl.textContent = getEstimatedCompletionDate(routine);
    }
    
    modal.style.display = 'flex';
    if (readPagesInput) readPagesInput.focus();
}

function hideReadingProgressModal() {
    document.getElementById('readingProgressModal').style.display = 'none';
}

function showTimeInputModal(routine) {
    activeRoutineForModal = routine;
    const modal = document.getElementById('timeInputModal');
    if(modal) {
        modal.querySelector('.modal-header h3').textContent = `⏰ ${routine.name}`;
        const timeInput = document.getElementById('timeInput');
        if(timeInput) {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            timeInput.value = routine.value || currentTime;
        }
        modal.style.display = 'flex';
    }
}

function hideTimeInputModal() {
    document.getElementById('timeInputModal').style.display = 'none';
}

// ====================================================================
// 6-B. 모달 확인(Confirm) 핸들러
// ====================================================================
async function handleStepperConfirm(value) {
    if (!activeRoutineForModal) return;
    const routine = activeRoutineForModal;
    const finalValue = value;
    const isNowGoalAchieved = finalValue >= (routine.dailyGoal || 1);
    
    const updateData = {
        value: finalValue,
        status: null, // 진행 중 상태로 변경
        lastUpdatedDate: todayDateString,
        dailyGoalMetToday: isNowGoalAchieved
    };
    
    await completeMission(routine, updateData);
    hideStepperModal();
}

async function handleReadingProgressConfirm() {
    if (!activeRoutineForModal) return;
    const readPages = parseInt(document.getElementById('readPages').value);
    if (isNaN(readPages) || readPages <= 0) {
        showNotification('읽은 페이지 수를 정확히 입력해주세요.', 'error');
        return;
    }
    const routine = activeRoutineForModal;
    const newCurrentPage = Math.min((routine.currentPage || (routine.startPage ? routine.startPage - 1 : 0)) + readPages, routine.endPage);
    const newDailyReadPagesToday = (routine.dailyReadPagesToday || 0) + readPages;
    const newDailyGoalMetToday = newDailyReadPagesToday >= routine.dailyPages;

    const updateData = {
        value: newCurrentPage,
        currentPage: newCurrentPage,
        status: null, // 진행 중 상태로 변경
        dailyReadPagesToday: newDailyReadPagesToday,
        dailyGoalMetToday: newDailyGoalMetToday,
        lastUpdatedDate: todayDateString
    };
    
    await completeMission(routine, updateData);
    hideReadingProgressModal();
}

async function handleTimeInputConfirm() {
    if (!activeRoutineForModal) return;
    const value = document.getElementById('timeInput').value;
    if (!value) {
        showNotification('시간을 선택해주세요.', 'error');
        return;
    }
    
    const updateData = {
        value: value,
        status: 'completed' // 시간 타입은 입력 즉시 완료
    };

    await completeMission(activeRoutineForModal, updateData);
    hideTimeInputModal();
}

// ====================================================================
// 6-C. 범용 모달 설정 함수
// ====================================================================
function setupModal(modalId, hideFn, confirmFn = null) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.querySelector('.modal-close')?.addEventListener('click', hideFn);
    modal.querySelector('.btn-secondary')?.addEventListener('click', hideFn);
    modal.addEventListener('click', (e) => { if (e.target === e.currentTarget) hideFn(); });
    if (confirmFn) {
        // 'btn-confirm' 클래스를 가진 확인 버튼에 이벤트 연결
        modal.querySelector('.btn-confirm')?.addEventListener('click', confirmFn);
    }
}
// ▲▲▲ 여기까지 2025-08-24(수정일) 부모 앱의 모달 제어 및 핸들러 부대 이식 ▲▲▲
// ▼▼▼ 2025-08-24(수정일) 누락된 시간 기록 모달 함수 추가 ▼▼▼

// ====================================================================
// 6-D. 시간 모달 제어 및 핸들러
// ====================================================================

function showTimeInputModal(routine) {
    activeRoutineForModal = routine;
    const modal = document.getElementById('timeInputModal');
    if(modal) {
        modal.querySelector('.modal-header h3').textContent = `⏰ ${routine.name}`;
        const timeInput = document.getElementById('timeInput');
        if(timeInput) {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            timeInput.value = routine.value || currentTime;
        }
        modal.style.display = 'flex';
    }
}

function hideTimeInputModal() {
    document.getElementById('timeInputModal').style.display = 'none';
}

async function handleTimeInputConfirm() {
    if (!activeRoutineForModal) return;
    const value = document.getElementById('timeInput').value;
    if (!value) {
        showNotification('시간을 선택해주세요.', 'error');
        return;
    }
    
    const updateData = {
        value: value,
        status: 'completed' // 시간 타입은 입력 즉시 완료로 간주
    };

    await completeMission(activeRoutineForModal, updateData);
    hideTimeInputModal();
}
// ▲▲▲ 여기까지 2025-08-24(수정일) 누락된 시간 기록 모달 함수 추가 ▲▲▲

// ▼▼▼ 2025-08-24(수정일) 독서 관련 Helper 함수 부대 추가 ▼▼▼

function getReadingProgress(routine) {
    if (routine.type !== 'reading' || !routine.endPage || !routine.startPage) return 0;
    const totalPages = routine.endPage - routine.startPage + 1;
    const readPages = (routine.currentPage || routine.startPage - 1) - routine.startPage + 1;
    if (totalPages <= 0 || readPages < 0) return 0;
    return Math.min(100, Math.round((readPages / totalPages) * 100));
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
    const remainingPages = routine.endPage - (routine.currentPage || routine.startPage - 1);
    const dailyPages = routine.dailyPages || 10;
    if (dailyPages <= 0) return '계산 불가';
    const remainingDays = Math.ceil(remainingPages / dailyPages);
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + remainingDays);
    return completionDate.toLocaleDateString('ko-KR');
}

// ▲▲▲ 여기까지 2025-08-24(수정일) 독서 관련 Helper 함수 부대 추가 ▲▲▲

// ▼▼▼ 2025-08-24(수정일) 포인트 획득 기록 조회 및 렌더링 부대 추가 ▼▼▼

// [기록 수집 장교] Firestore에서 최근 20개의 포인트 획득 기록을 가져옵니다.
// ▼▼▼ 2025-08-24(수정일) Firestore 쿼리 규칙에 맞게 정렬 순서 수정 ▼▼▼
// ▼▼▼ 2025-08-24(수정일) 현재 로그인한 자녀의 기록만 조회하도록 쿼리 수정 ▼▼▼
// ▼▼▼ 2025-08-24(수정일) 포인트 기록 쿼리를 '핀포인트 타격' 방식으로 전면 수정 ▼▼▼
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

        // ★★★ 핵심 전술 변경: 핀포인트 타격 쿼리 ★★★
        // 1. 처음부터 '현재 로그인한 자녀(loggedBy)'의 기록만 '최신순(date desc)'으로 5개만 요청합니다.
        console.log(`📌 [loadAndRenderPointHistory]: 자녀(${currentUser.uid})의 최신 포인트 기록 5개를 요청합니다.`);
        const historyQuery = db.collectionGroup('history')
                               .where('familyId', '==', familyId)
                               .where('loggedBy', '==', currentUser.uid) // <-- 타격 목표 지정
                               .orderBy('date', 'desc')                  // <-- 최신순 정렬
                               .limit(5);                                 // <-- 정예 5개만 선별

        const snapshot = await historyQuery.get();

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="panel-description">아직 포인트 획득 기록이 없습니다.</p>';
            return;
        }
        
        const histories = snapshot.docs.map(doc => doc.data());
        console.log(`✅ [loadAndRenderPointHistory]: ${histories.length}개의 기록 수신 완료.`);

        // 2. 수신된 5개의 기록에 필요한 '루틴 이름' 정보를 추가합니다. (기존 로직 재활용)
        const fetchRoutinePromises = histories.map(hist => {
            return db.collection('families').doc(familyId)
                     .collection('routines').doc(hist.routineId).get();
        });
        const routineSnapshots = await Promise.all(fetchRoutinePromises);

        const combinedData = histories.map((hist, index) => {
            const routineDoc = routineSnapshots[index];
            return {
                ...hist,
                routineName: routineDoc.exists ? routineDoc.data().name : '삭제된 미션',
            };
        });

        // 3. 더 이상 클라이언트에서 필터링할 필요 없이, 수신된 데이터를 즉시 화면에 보고합니다.
        listContainer.innerHTML = '';
        combinedData.forEach(hist => {
            const historyElement = createPointHistoryElement(hist);
            listContainer.appendChild(historyElement);
        });

    } catch (error) {
        console.error("❌ 포인트 기록 조회 실패:", error);
        listContainer.innerHTML = '<p class="panel-description" style="color: var(--error);">기록을 불러오는 데 실패했습니다.</p>';
        if (error.code === 'failed-precondition') {
            showNotification("데이터베이스 색인 문제일 수 있습니다. 콘솔을 확인해주세요.", "error");
            console.warn("🔥[제미군 경고] Firestore 색인이 필요할 수 있습니다. 콘솔의 오류 메시지 링크를 클릭하여 색인을 생성하십시오.");
        }
    }
}
// ▲▲▲ 여기까지 2025-08-24(수정일) 포인트 기록 쿼리를 '핀포인트 타격' 방식으로 전면 수정 ▲▲▲


// [보고서 작성병] 개별 기록 아이템의 HTML 구조를 생성합니다. (수정된 버전)
function createPointHistoryElement(history) {
    const item = document.createElement('div');
    item.className = 'manage-routine-item';
    
    // ★★★ 수정 1: 이 부분은 더 이상 필요 없으므로 삭제합니다. ★★★
    // const routine = assignedRoutines.find(r => r.id === history.routineId);
    
    // ★★★ 수정 2: history 객체에 이미 포함된 routineName을 직접 사용합니다. ★★★
    const routineName = history.routineName || '알 수 없는 활동';

    // ★★★ 수정 3: Firestore Timestamp 객체를 "YYYY.M.D" 형식의 문자열로 변환합니다. ★★★
    const dateString = history.date;
    
    // HTML 구조는 기존의 것을 그대로 사용합니다.
    item.innerHTML = `
        <div class="routine-main-info" style="gap: 1rem;">
            <div class="routine-main-name" style="flex-grow: 1;">
                ${routineName}
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${dateString}</div>
            </div>
            <div class="routine-main-details" style="font-weight: 600; color: var(--success);">+${history.pointsEarned} P</div>
        </div>
    `;
    return item;
}

// ▲▲▲ 여기까지 2025-08-24(수정일) 포인트 획득 기록 조회 및 렌더링 부대 추가 ▲▲▲
// ▼▼▼ 2025-08-24(수정일) '진행 중' 상태 판단을 위한 Helper 함수 파견 ▼▼▼

function isRoutineInProgress(routine) {
    // 이미 완료되었거나 건너뛴 루틴은 '진행 중'이 될 수 없습니다.
    if (isRoutineCompleted(routine) || routine.status === 'skipped') {
        return false;
    }
    // '독서' 타입은 시작 페이지보다 많이 읽었지만 아직 완독은 아닐 때 '진행 중'입니다.
    if (routine.type === 'reading') {
        return (routine.currentPage || 0) > (routine.startPage - 1);
    }
    // '지속 업데이트'가 가능한 '숫자' 타입은 값이 0보다 클 때 '진행 중'입니다.
    if (routine.type === 'number' && routine.continuous === true) {
        return (routine.value || 0) > 0;
    }
    // 그 외의 경우는 '진행 중' 상태가 없습니다.
    return false;
}

// ▲▲▲ 여기까지 2025-08-24(수정일) '진행 중' 상태 판단을 위한 Helper 함수 파견 ▲▲▲

// ▼▼▼ 2025-08-24(수정일) 누락된 핵심 Helper 함수 부대 긴급 투입 ▼▼▼

function isRoutineCompleted(routine) {
    if (routine.status === 'skipped') return false;
    // 지속/독서 타입은 일일 목표 달성 여부(dailyGoalMetToday)로 완료를 판단합니다.
    if (isContinuousRoutine(routine) || isReadingRoutine(routine)) {
        return routine.dailyGoalMetToday === true;
    }
    // 그 외 타입들의 완료 조건
    if (routine.type === 'yesno') return routine.value === true;
    if (routine.type === 'number') return routine.value !== null && routine.value > 0;
    if (routine.type === 'time') return !!routine.value;
    return false;
}

function isRoutineInProgress(routine) {
    if (isRoutineCompleted(routine) || routine.status === 'skipped') {
        return false;
    }
    if (isReadingRoutine(routine)) {
        return (routine.currentPage || 0) > (routine.startPage - 1);
    }
    if (isContinuousRoutine(routine)) {
        return (routine.value || 0) > 0;
    }
    return false;
}

// isRoutineCompleted와 isRoutineInProgress를 지원하는 보조 함수들
function isContinuousRoutine(routine) { 
    return routine.continuous === true; 
}
function isReadingRoutine(routine) { 
    return routine.type === 'reading'; 
}

// ▲▲▲ 여기까지 2025-08-24(수정일) 누락된 핵심 Helper 함수 부대 긴급 투입 ▲▲▲

// ▼▼▼ 2025-08-24(수정일) '미션 취소' 담당 undoMission 함수 추가 ▼▼▼
async function undoMission(routine) {
    if (!currentUser || !routine.path) {
        showNotification("미션 취소에 필요한 정보가 부족합니다.", "error");
        return;
    }
    if (!confirm(`'${routine.name}' 미션 완료를 취소하시겠습니까?`)) {
        return;
    }
    console.log(`📌 [undoMission]: 미션(${routine.name}) 완료 취소 처리 시작...`);

    try {
        const routineRef = db.doc(routine.path);
        
        // 1. 루틴 상태를 '미완료'로 되돌릴 데이터를 준비합니다.
        const fieldsToReset = {
            status: null,
            value: routine.type === 'yesno' ? false : 0, // yesno는 false, 숫자는 0으로 초기화
            dailyGoalMetToday: false,
            pointsGivenToday: false,
            lastUpdatedDate: new Date().toISOString().split('T')[0]
        };
        // 독서 타입은 읽었던 페이지 수도 되돌립니다.
        if (routine.type === 'reading') {
            fieldsToReset.currentPage = Math.max(routine.startPage - 1, (routine.currentPage || 0) - (routine.dailyReadPagesToday || 0));
            fieldsToReset.dailyReadPagesToday = 0;
        }

        // 2. 만약 오늘 포인트를 받았다면, 스트릭과 총 포인트를 되돌립니다.
        if (routine.pointsGivenToday) {
            fieldsToReset.streak = Math.max(0, (routine.streak || 0) - 1);

            const userRef = db.collection('users').doc(currentUser.uid);
            await userRef.update({
                points: firebase.firestore.FieldValue.increment(-(routine.basePoints || 0))
            });
            console.log(`- 차감된 포인트: ${routine.basePoints || 0}`);
        }
        
        // 3. 루틴 문서를 최종적으로 업데이트합니다.
        await routineRef.update(fieldsToReset);
        
        showNotification(`'${routine.name}' 미션 완료가 취소되었습니다.`, 'warning');
        
        // 4. 화면을 즉시 새로고침하여 변경사항을 반영합니다.
        await loadAssignedRoutines(currentUser.uid);
        await updateUserInfoUI(currentUser); // 헤더 포인트 갱신
    } catch (error) {
        console.error("❌ [undoMission]: 미션 취소 처리 중 오류 발생:", error);
        showNotification("미션 취소에 실패했습니다.", "error");
    }
}
// ▲▲▲ 여기까지 2025-08-24(수정일) '미션 취소' 담당 undoMission 함수 추가 ▲▲▲
// ▼▼▼ 2025-08-25(수정일) 포인트 획득 보고서 작성을 위한 logRoutineHistory 함수 추가 ▼▼▼
async function logRoutineHistory(routineId, dataToLog) {
    // 자녀 앱에서는 '활동 역사' 기록 임무만 수행합니다.
    if (!currentUser || !currentUser.familyId) return;

    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const historyRef = db.collection('families').doc(currentUser.familyId)
                         .collection('routines').doc(String(routineId))
                         .collection('history').doc(dateString);
    
    try {
        await historyRef.set({
            routineId: routineId,
            date: dateString,
            familyId: currentUser.familyId,
            ...dataToLog,
            loggedBy: currentUser.uid
        }, { merge: true });
        console.log(`✅ [logRoutineHistory]: 미션(${routineId}) 활동 보고서 제출 완료.`);
    } catch (error) {
        console.error("❌ [logRoutineHistory]: 활동 보고서 제출 실패:", error);
    }
}
// ▲▲▲ 여기까지 2025-08-25(수정일) 포인트 획득 보고서 작성을 위한 logRoutineHistory 함수 추가 ▲▲▲
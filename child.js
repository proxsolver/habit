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
// ▼▼▼ 2025-08-21 루틴 렌더링 필터 로직 개선 ▼▼▼
function renderMissions() {
    const incompleteList = document.getElementById('incompleteRoutineList');
    const completedList = document.getElementById('completedRoutineList');
    
    if (!incompleteList || !completedList) return;

    incompleteList.innerHTML = '';
    completedList.innerHTML = '';

    // const activeRoutines = assignedRoutines.filter(r => r.active); // 기존 코드
    // ★★★ 수정: active 필드가 false가 아닌 모든 루틴(필드가 없는 경우 포함)을 표시하도록 변경
    const activeRoutines = assignedRoutines.filter(r => r.active !== false);
    
    activeRoutines.forEach(routine => {
        const isCompleted = (routine.status === 'completed' || routine.value === true);
        const element = createMissionElement(routine, isCompleted);
        
        if (isCompleted) {
            completedList.appendChild(element);
        } else {
            incompleteList.appendChild(element);
        }
    });

    document.getElementById('completed-section').style.display = completedList.children.length > 0 ? 'block' : 'none';
}
// ▲▲▲ 여기까지 2025-08-21 루틴 렌더링 필터 로직 개선 ▲▲▲

// ▼▼▼ 2025-08-24(수정일) createMissionElement 함수 전면 개선 ▼▼▼
// ▼▼▼ 2025-08-24(수정일) createMissionElement의 이벤트 리스너 최종 수정 ▼▼▼
function createMissionElement(routine, isCompleted) {
    const div = document.createElement('div');
    div.className = `routine-item ${routine.time} ${isCompleted ? 'completed' : ''}`;
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

    // ★★★ 완료되지 않은 루틴에만 클릭 이벤트 추가
    if (!isCompleted) {
        div.addEventListener('click', () => {
            // 루틴 타입에 따라 다른 작전을 수행하도록 라우팅합니다.
            switch (routine.type) {
                case 'yesno':
                    if (confirm(`'${routine.name}' 미션을 완료하시겠습니까?`)) {
                        completeMission(routine);
                    }
                    break;
                case 'number':
                    showStepperModal(routine); // 숫자 타입은 스테퍼 모달 호출
                    break;
                case 'reading':
                    showReadingProgressModal(routine); // 독서 타입은 독서 모달 호출
                    break;
                       // ▼▼▼ 'time' 타입에 대한 명령 추가 ▼▼▼
                case 'time':
                    showTimeInputModal(routine); // 시간 타입은 시간 모달 호출
                    break;
                // ▲▲▲ 'time' 타입에 대한 명령 추가 ▲▲▲
                default:
                    showNotification("아직 지원되지 않는 미션 타입입니다.", "info");
            }
        });
    }
    return div;
}
// ▲▲▲ 여기까지 2025-08-24(수정일) createMissionElement의 이벤트 리스너 최종 수정 ▲▲▲

// --- Helper Functions (script.js에서 복사해와야 합니다) ---
// 아래 함수들이 child.js에 없다면 script.js에서 복사하여 추가해야 합니다.
function getTypeIcon(type) { return { 'yesno': '✅', 'number': '🔢', 'time': '⏰', 'reading': '📚' }[type] || '📝'; }
function getTimeEmoji(time) { return { 'morning': '🌅', 'afternoon': '🌞', 'evening': '🌙' }[time] || '⏰'; }
function getTimeLabel(time) { return { 'morning': '아침', 'afternoon': '점심', 'evening': '저녁' }[time] || '시간'; }
function getRoutineValueDisplay(routine) {
    if (routine.type === 'yesno') return routine.value === true ? '완료!' : '';
    if (routine.type === 'number' && routine.dailyGoal) {
        return `${routine.value || 0} / ${routine.dailyGoal} ${routine.unit || ''}`;
    }
    return `${routine.value || 0} ${routine.unit || ''}`;
}
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
async function completeMission(routine) {
    if (!currentUser || !routine.path) {
        showNotification("미션 완료 처리에 필요한 정보가 부족합니다.", "error");
        return;
    }

    console.log(`📌 [completeMission]: 미션(${routine.name}) 완료 처리 시작...`);
    console.log(`- 목표 경로: ${routine.path}`);

    try {
        // 부모의 routines 컬렉션에 있는 루틴 문서의 경로를 직접 참조하여 업데이트합니다.
        const routineRef = db.doc(routine.path); 

        // "완료" 상태로 변경하고, 포인트를 지급 받았다는 표시(pointsGivenToday)를 남깁니다.
        // 이는 부모 앱에서 이 루틴이 '완료'된 것으로 보이게 하는 핵심 로직입니다.
        await routineRef.update({
            status: 'completed', // 'yesno' 타입의 경우 value: true 로 변경해야 할 수도 있습니다.
            value: true, // yesno 타입의 완료 처리를 위해 추가
            pointsGivenToday: true,
            lastUpdatedDate: new Date().toISOString().split('T')[0]
        });

        console.log(`- DB 업데이트 완료.`);

        // 자녀 본인의 'user' 문서에 포인트를 누적합니다.
        const userRef = db.collection('users').doc(currentUser.uid);
        await userRef.update({
            points: firebase.firestore.FieldValue.increment(routine.basePoints || 0)
        });
        console.log(`- 포인트 ${routine.basePoints || 0} 누적 완료.`);

        showNotification(`'${routine.name}' 미션 완료! ${routine.basePoints || 0}포인트를 획득했습니다!`, 'success');

        // 화면을 즉시 새로고침하여 완료된 미션 목록으로 이동시킵니다.
        await loadAssignedRoutines(currentUser.uid);
    } catch (error) {
        console.error("❌ [completeMission]: 미션 완료 처리 중 오류 발생:", error);
        showNotification("미션 완료에 실패했습니다.", "error");
    }
}
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
function setupEventListeners() {
    document.getElementById('logout-btn')?.addEventListener('click', () => firebase.auth().signOut());
    
    // 하단 탭 바 로직
    document.getElementById('navHomeBtn')?.addEventListener('click', showHomePage);
    document.getElementById('navRewardsBtn')?.addEventListener('click', showRewardsPage);

    
    // '보상 상점' 전체에 대한 이벤트 리스너 (이벤트 위임)
    const rewardList = document.getElementById('reward-store-list');
    if (rewardList) {
        rewardList.addEventListener('click', async (e) => {
            // 클릭된 것이 '요청' 버튼일 경우에만 작동
            if (e.target.matches('.btn-request-reward')) {
                const button = e.target;
                const rewardId = button.dataset.rewardId;
                const rewardName = button.dataset.rewardName;
                const requiredPoints = parseInt(button.dataset.rewardPoints);
                
                button.disabled = true;
                button.textContent = '확인 중...';

                try {
                    // 1. 현재 사용자(자녀)의 최신 정보를 가져와 포인트를 확인합니다.
                    const userRef = db.collection('users').doc(currentUser.uid);
                    const userDoc = await userRef.get();
                    const currentPoints = userDoc.data().points || 0;

                    if (currentPoints < requiredPoints) {
                        // 2. 포인트가 부족할 경우
                        showNotification(`포인트가 부족합니다! (현재: ${currentPoints} P)`, 'error');
                        button.disabled = false;
                        button.textContent = '요청';
                        return;
                    }

                    // 3. 포인트가 충분할 경우, 사용자에게 최종 확인을 받습니다.
                    if (confirm(`정말로 ${requiredPoints} 포인트를 사용해서 '${rewardName}'을(를) 요청하시겠습니까?`)) {
                        
                        // 4. 'reward_requests' 컬렉션에 새로운 요청 문서를 생성합니다.
                        const familyId = userDoc.data().familyId;
                        const requestsRef = db.collection('families').doc(familyId).collection('reward_requests');
                        await requestsRef.add({
                            childId: currentUser.uid,
                            childName: currentUser.displayName,
                            rewardId: rewardId,
                            rewardName: rewardName,
                            points: requiredPoints,
                            status: 'pending', // 'pending', 'approved', 'rejected'
                            requestedAt: new Date()
                        });

                        showNotification(`'${rewardName}'을(를) 성공적으로 요청했습니다! 부모님의 승인을 기다려주세요.`, 'success');
                        button.textContent = '요청 완료'; // 성공 후 버튼 텍스트 변경
                    } else {
                        // 사용자가 취소한 경우
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
    // ★★★ 모든 모달 부대를 지휘 체계에 등록합니다.
    setupModal('stepperInputModal', hideStepperModal); // 확인 버튼은 자체 로직 사용
    setupModal('readingProgressModal', hideReadingProgressModal, handleReadingProgressConfirm);
    setupModal('timeInputModal', hideTimeInputModal, handleTimeInputConfirm);

}



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

// ▼▼▼ 2025-08-24(수정일) showReadingProgressModal 기능 전면 격상 ▼▼▼
function showReadingProgressModal(routine) {
    activeRoutineForModal = routine;
    
    const modal = document.getElementById('readingProgressModal');
    if (!modal) return;

    modal.querySelector('.modal-header h3').textContent = `📖 ${routine.bookTitle || routine.name}`;

    const todayRange = getTodayReadingRange(routine);
    const progress = getReadingProgress(routine);

    // 상세 정보 표시부 업데이트
    const readingInfo = document.getElementById('readingInfo');
    if (readingInfo) {
        readingInfo.innerHTML = `
            <h4>📚 ${routine.bookTitle}</h4>
            <p><strong>오늘의 목표:</strong> ${todayRange.start}~${todayRange.end} 페이지 (${todayRange.pages}페이지)</p>
            <p><strong>현재 진행률:</strong> ${routine.currentPage || routine.startPage-1}/${routine.endPage} 페이지 (${progress}%)</p>
        `;
    }

    const readPagesInput = document.getElementById('readPages');
    const recommendedPages = document.getElementById('recommendedPages');
    if (readPagesInput) readPagesInput.value = todayRange.pages;
    if (recommendedPages) recommendedPages.textContent = todayRange.pages;

    // 완료 예정일 계산 및 표시
    const completionDateEl = document.getElementById('completionDate');
    if (completionDateEl) {
        completionDateEl.textContent = getEstimatedCompletionDate(routine);
    }
    
    modal.style.display = 'flex';
    if (readPagesInput) readPagesInput.focus();
}
// ▲▲▲ 여기까지 2025-08-24(수정일) showReadingProgressModal 기능 전면 격상 ▲▲▲

function hideReadingProgressModal() {
    document.getElementById('readingProgressModal').style.display = 'none';
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
        status: null,
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
        status: null,
        dailyReadPagesToday: newDailyReadPagesToday,
        dailyGoalMetToday: newDailyGoalMetToday,
        lastUpdatedDate: todayDateString
    };
    
    await completeMission(routine, updateData);
    hideReadingProgressModal();
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
        modal.querySelector('.btn-confirm')?.addEventListener('click', confirmFn);
    }
}
// ▲▲▲ 여기까지 2025-08-24(수정일) 누락된 모달 제어 부대 긴급 투입 ▲▲▲

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
async function loadAndRenderPointHistory() {
    if (!currentUser) return;
    const listContainer = document.getElementById('point-history-list');
    listContainer.innerHTML = '<p class="panel-description">기록을 불러오는 중...</p>';

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (!userDoc.exists || !userDoc.data().familyId) {
        listContainer.innerHTML = '<p class="panel-description">소속된 가족이 없어 기록을 표시할 수 없습니다.</p>';
        return;
    }
    const familyId = userDoc.data().familyId;

    // 'history' 컬렉션 그룹에서 우리 가족의 기록만 최신순으로 20개 조회합니다.
    const historyQuery = db.collectionGroup('history')
                           .where('familyId', '==', familyId)
                           .where('pointsEarned', '>', 0) // 포인트 획득 기록만 필터링
                           .orderBy('date', 'desc')
                           .limit(20);
    
    const snapshot = await historyQuery.get();

    if (snapshot.empty) {
        listContainer.innerHTML = '<p class="panel-description">아직 포인트 획득 기록이 없습니다.</p>';
        return;
    }

    listContainer.innerHTML = '';
    const histories = snapshot.docs.map(doc => doc.data());

    histories.forEach(hist => {
        const historyElement = createPointHistoryElement(hist);
        listContainer.appendChild(historyElement);
    });
}

// [보고서 작성병] 개별 기록 아이템의 HTML 구조를 생성합니다.
function createPointHistoryElement(history) {
    const item = document.createElement('div');
    item.className = 'manage-routine-item';
    
    // assignedRoutines 배열에서 루틴 ID로 루틴 이름을 찾습니다.
    const routine = assignedRoutines.find(r => r.id === history.routineId);
    const routineName = routine ? routine.name : '알 수 없는 활동';

    item.innerHTML = `
        <div class="routine-main-info" style="gap: 1rem;">
            <div class="routine-main-name" style="flex-grow: 1;">
                ${routineName}
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${history.date}</div>
            </div>
            <div class="routine-main-details" style="font-weight: 600; color: var(--success);">+${history.pointsEarned} P</div>
        </div>
    `;
    return item;
}

// ▲▲▲ 여기까지 2025-08-24(수정일) 포인트 획득 기록 조회 및 렌더링 부대 추가 ▲▲▲
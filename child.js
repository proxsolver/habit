// ▼▼▼ 08/19(수정일) 'child.js' 특수 작전 부대 편성 ▼▼▼

// ====================================================================
// 1. 전역 변수 (자녀용)
// ====================================================================
let currentUser = null;
let assignedRoutines = [];

// ====================================================================
// 2. 앱 시작점 (자녀용)
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Firebase 인증 상태 감지
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            // 부모 역할일 경우, 중앙 사령부(index.html)로 즉시 이동시킵니다.
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists && userDoc.data().role === 'parent') {
                window.location.href = 'index.html';
                return;
            }
            
            // UI 업데이트
            updateUserInfoUI(user);
            await loadAssignedRoutines(user.uid);
            showHomePage();
        } else {
            currentUser = null;
            updateUserInfoUI(null);
            renderMissions();
        }
    });

    setupEventListeners();
});

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

function createMissionElement(routine, isCompleted) {
    const div = document.createElement('div');
    div.className = `routine-item ${isCompleted ? 'completed' : ''}`;
    div.innerHTML = `
        <div class="routine-checkbox">${isCompleted ? '✓' : ''}</div>
        <div class="routine-content">
            <div class="routine-name">${routine.name}</div>
        </div>
        <div class="routine-value">${routine.basePoints || 0} P</div>
    `;

    // 완료되지 않은 루틴에만 클릭 이벤트 추가
    if (!isCompleted) {
        div.querySelector('.routine-checkbox').addEventListener('click', () => {
            if (confirm(`'${routine.name}' 미션을 완료하시겠습니까?`)) {
                completeMission(routine);
            }
        });
    }
    return div;
}

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
function updateUserInfoUI(user) {
    const userInfoDiv = document.getElementById('user-info');
    const loginBtn = document.getElementById('login-btn');
    if (user) {
        userInfoDiv.style.display = 'flex';
        loginBtn.style.display = 'none';
        document.getElementById('user-name').textContent = user.displayName;
        document.getElementById('user-photo').src = user.photoURL;
    } else {
        userInfoDiv.style.display = 'none';
        loginBtn.style.display = 'block';
    }
}

// ▼▼▼ 2025-08-24(수정일) setupEventListeners 함수에 최종 요청 로직 추가 ▼▼▼
function setupEventListeners() {
    document.getElementById('logout-btn')?.addEventListener('click', () => firebase.auth().signOut());
    
    // 하단 탭 바 로직
    const homeBtn = document.getElementById('navHomeBtn');
    const rewardsBtn = document.getElementById('navRewardsBtn');
    
    homeBtn?.addEventListener('click', showHomePage);
    rewardsBtn?.addEventListener('click', showRewardsPage);

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
}
// ▲▲▲ 여기까지 2025-08-24(수정일) setupEventListeners 함수에 최종 요청 로직 추가 ▲▲▲

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

}

// 간단한 알림 함수
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// ▲▲▲ 여기까지 08/19(수정일) 'child.js' 특수 작전 부대 편성 ▲▲▲
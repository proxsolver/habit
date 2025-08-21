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
// ▼▼▼ 2025-08-21 자녀 루틴 로딩 로직 수정 ▼▼▼
async function loadAssignedRoutines(userId) {
    if (!currentUser) return;
    console.log(`📌 [loadAssignedRoutines]: 자녀(${userId})의 미션 로딩 시작...`);

    try {
        // 1. 자신의 사용자 정보를 가져와 familyId를 확보합니다.
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            console.error("❌ 자신의 사용자 문서를 찾을 수 없습니다.");
            return;
        }
        const myData = userDoc.data();
        const familyId = myData.familyId;
        const myRole = myData.role;

        // 만약 부모라면, 자녀 페이지에 있을 이유가 없으므로 중앙 사령부로 보냅니다.
        if (myRole === 'parent') {
            window.location.href = 'index.html';
            return;
        }

        if (!familyId) {
            console.warn("⚠️ 가족에 소속되어 있지 않아 미션을 가져올 수 없습니다.");
            assignedRoutines = [];
            renderMissions();
            return;
        }
        console.log(`- 소속 가족 ID: ${familyId}`);

        // 2. 가족 ID를 이용해 부모 사용자를 찾습니다. (가족 내 첫 번째 부모)
        const parentQuery = await db.collection('users')
            .where('familyId', '==', familyId)
            .where('role', '==', 'parent')
            .limit(1)
            .get();

        if (parentQuery.empty) {
            console.error("❌ 가족의 부모님을 찾을 수 없습니다.");
            return;
        }
        const parentId = parentQuery.docs[0].id;
        console.log(`- 발견된 부모 ID: ${parentId}`);

        // 3. 부모님의 routines 하위 컬렉션에서 나에게 할당된(assignedTo) 루틴만 가져옵니다.
        // ※ 참고: 이 쿼리가 작동하려면 추후 부모가 루틴 생성 시 'assignedTo' 필드에 자녀의 UID를 넣어줘야 합니다.
        // 현재는 해당 기능이 없으므로, 테스트를 위해 부모의 루틴 중 하나에 수동으로 assignedTo 필드를 추가해야 합니다.
        const routinesRef = db.collection('users').doc(parentId).collection('routines');
        const snapshot = await routinesRef.where('assignedTo', '==', userId).get();

        assignedRoutines = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            // 완료 처리를 위해 부모의 ID와 루틴의 전체 경로를 저장해둡니다.
            parentId: parentId,
            path: doc.ref.path 
        }));

        console.log(`✅ [loadAssignedRoutines]: 총 ${assignedRoutines.length}개의 미션 수신 완료.`, assignedRoutines);
        renderMissions();

    } catch (error) {
        console.error("❌ [loadAssignedRoutines]: 미션 로딩 중 심각한 오류 발생:", error);
        showNotification("미션을 가져오는 데 실패했습니다.", "error");
    }
}
// ▲▲▲ 여기까지 2025-08-21 자녀 루틴 로딩 로직 수정 ▲▲▲

// ====================================================================
// 4. 렌더링 (자녀용)
// ====================================================================
function renderMissions() {
    const incompleteList = document.getElementById('incompleteRoutineList');
    const completedList = document.getElementById('completedRoutineList');
    
    if (!incompleteList || !completedList) return;

    incompleteList.innerHTML = '';
    completedList.innerHTML = '';

    const activeRoutines = assignedRoutines.filter(r => r.active);
    
    activeRoutines.forEach(routine => {
        const isCompleted = (routine.status === 'completed'); // 단순화된 완료 조건
        const element = createMissionElement(routine, isCompleted);
        
        if (isCompleted) {
            completedList.appendChild(element);
        } else {
            incompleteList.appendChild(element);
        }
    });

    // 완료/미완료 섹션 표시 여부 업데이트
    document.getElementById('completed-section').style.display = completedList.children.length > 0 ? 'block' : 'none';
}

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

function setupEventListeners() {
    document.getElementById('logout-btn')?.addEventListener('click', () => firebase.auth().signOut());
    
    // 하단 탭 바 로직
    const homeBtn = document.getElementById('navHomeBtn');
    const rewardsBtn = document.getElementById('navRewardsBtn');
    
    homeBtn?.addEventListener('click', showHomePage);
    rewardsBtn?.addEventListener('click', showRewardsPage);
}

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
    showNotification('보상 상점은 현재 준비 중입니다.', 'info');
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
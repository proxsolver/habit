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
async function loadAssignedRoutines(userId) {
    if (!currentUser) return;
    const routinesRef = db.collectionGroup('routines').where('assignedTo', '==', userId);
    const snapshot = await routinesRef.get();
    assignedRoutines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMissions();
}

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
async function completeMission(routine) {
    if (!currentUser) return;
    // 부모의 routines 컬렉션에 접근해야 하므로 경로를 구성해야 합니다. (이 부분은 부모 UID가 필요)
    // 우선, 루틴의 status만 변경하는 로직으로 단순화합니다.
    const routineRef = db.doc(routine.path); // Firestore 문서 경로가 필요
    
    // 이 부분은 Firestore 규칙 및 데이터 구조에 따라 상세 구현이 필요합니다.
    // 지금은 개념적인 구현입니다.
    console.log(`'${routine.id}' 미션을 완료 처리합니다. (실제 DB 업데이트는 추가 구현 필요)`);
    // await routineRef.update({ status: 'completed' });
    
    // 포인트 획득 로직
    const userRef = db.collection('users').doc(currentUser.uid);
    await userRef.update({
        points: firebase.firestore.FieldValue.increment(routine.basePoints || 0)
    });
    
    showNotification(`'${routine.name}' 미션 완료! ${routine.basePoints || 0}포인트를 획득했습니다!`, 'success');
    
    // 화면 즉시 새로고침
    await loadAssignedRoutines(currentUser.uid);
}

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
### **프로그램 구조 (Application Architecture)**

이 프로그램은 **바닐라 자바스크립트(Vanilla JavaScript)**와 Firebase를 기반으로 한 동적인 가족 루틴 트래커입니다. 핵심 아키텍처는 '가족 공유 데이터베이스' 모델로, 모든 가족 관련 데이터(루틴, 목표, 보상 등)를 중앙의 families 컬렉션에서 통합 관리하여 효율성과 확장성을 확보했습니다.

## 1.1. index.html / child.html - 화면의 뼈대
역할 기반 분리: 부모는 index.html을 통해 모든 관리 기능을 사용하며, 자녀는 child.html을 통해 자신의 임무 수행에 집중된 간소화된 UI를 제공받습니다.
핵심 페이지 컨테이너: 홈, 목표, 통계, 보상 등 하단 탭 바와 연결된 각 기능 페이지(div)들이 존재합니다.
관리 페이지 (manage-section): 부모 전용 관리 허브입니다.
탭 기반 UI: '내 루틴 관리'와 '자녀 루틴 관리' 탭으로 명확히 분리되어 있습니다.
보상 관리: 자녀에게 제공할 보상 아이템을 생성하고 관리하는 기능이 포함됩니다.
모달 창 (Modals): 루틴, 목표, 보상 등 데이터의 생성 및 수정을 위한 다양한 팝업창이 구현되어 있습니다.


HTML 파일은 웹 애플리케이션의 전체적인 구조와 사용자 인터페이스(UI) 요소들을 정의합니다.

프로그램 상세 설계서 (Detailed Design Document) v2.0

1. index.html - 화면의 뼈대 (UI Structure)
HTML 파일은 모든 시각적 요소의 청사진 역할을 합니다. 각 id는 JavaScript가 특정 병력을 식별하기 위한 고유 군번과 같습니다.

app-header (상단 헤더):
    user-info: 로그인 시 사용자의 프로필 사진과 이름, 로그아웃 버튼을 표시하는 영역입니다.
    login-btn: 로그아웃 상태일 때 표시되는 구글 로그인 버튼입니다.
    navManageBtn: 어느 페이지에 있든 '관리' 페이지로 즉시 이동시키는 지휘 본부 호출 버튼(⚙️)입니다.

container (메인 컨테이너):
아래의 핵심 페이지들을 담는 최상위 컨테이너입니다. script.js는 이 중 한 번에 하나의 페이지만을 보여줍니다.
    main-app-content (홈 페이지):
        daily-progress: '나'의 오늘 루틴 완료율을 보여주는 원형 프로그레스 바입니다.
        incomplete-section, inprogress-section, completed-section: 나의 루틴을 상태에 따라 '남음', '진행 중', '완료'로 자동 분류하여 보여주는 목록 컨테이너입니다.
    manage-section (관리 페이지): 부모 전용 관리 기능이 집결된 지휘 본부입니다.
        family-management-section: 가족 구성원을 확인하고, 향후 초대 기능을 추가할 공간입니다.
        reward-management-section: 보상 아이템을 추가/수정/삭제하는 '보상 관리' 기능이 위치한 공간입니다.
        routine-manage-tabs: '내 루틴 관리'와 '자녀 루틴 관리'를 전환하는 탭 버튼 영역입니다.
        routine-manage-panels: 각 탭에 해당하는 실제 관리 UI(루틴 목록, 추가 버튼 등)가 표시되는 공간입니다.
    dashboard-view (통계 페이지): 루틴 완료율, 포인트 획득 현황 등 다양한 데이터를 그래프로 시각화하여 보여주는 정보 분석실입니다.
    goal-compass-page (목표 페이지): 장기적인 목표를 설정하고 진행 상황을 추적하는 공간입니다.
    rewards-page (보상 페이지): 부모가 모든 보상 관련 기능(아이템 관리, 요청 승인)을 통합 관리하는 공간입니다.

Modals (각종 모달 창):
특정 임무(데이터 입력)를 위해 일시적으로 호출되는 특수 부대입니다.
addRoutineModal: 새 루틴을 추가하거나 기존 루틴을 수정하는 모달입니다.
rewardModal: 보상 아이템을 추가하거나 수정하는 모달입니다.
addGoalModal: 새로운 목표를 설정하는 모달입니다.
기타 numberInputModal, readingProgressModal 등 다양한 입력 방식에 대응하는 전용 모달들이 대기 중입니다.

bottom-tab-bar (하단 네비게이션):
홈, 목표, 통계, 보상 등 핵심 페이지로 신속하게 이동할 수 있는 주둔지 간 이동 통로입니다.

---

## 1.2. script.js / child.js - 앱의 두뇌

데이터 흐름: 앱 로딩 시, 로그인한 사용자의 familyId를 확인하여 families 컬렉션에서 해당 가족의 모든 데이터를 한 번에 로드합니다 (sampleRoutines 등). 이후 각 페이지는 이 로드된 데이터를 필요에 맞게 필터링하여 사용합니다.

Firebase 연동 로직:

인증 (Authentication): 구글 계정을 통한 사용자 식별 및 로그인/로그아웃을 처리합니다.

데이터베이스 (Firestore):

users 컬렉션은 사용자의 기본 정보와 소속 가족(familyId)을 연결하는 '인명부' 역할을 합니다.

families 컬렉션은 모든 루틴, 목표, 보상 데이터가 저장되는 '가족 공동 캐비닛' 역할을 합니다. 모든 CRUD(생성, 조회, 수정, 삭제) 함수는 이 families 컬렉션을 대상으로 작동합니다.

페이지 네비게이션: 하단 탭 바의 버튼 클릭에 따라 activePage 전역 변수를 변경하고, renderCurrentPage 함수를 통해 해당 페이지 컨테이너를 표시합니다.

2. script.js - 앱의 두뇌 (Application Logic)
JavaScript 파일은 HTML이라는 뼈대에 생명을 불어넣는 신경망과 같습니다. 각 함수는 특정 임무를 부여받은 장교입니다.

전역 변수 (Global Variables):

    currentUser, sampleRoutines, userRewards 등 앱의 현재 상태(로그인한 사용자, 로드된 데이터 등)를 저장하여 모든 함수가 공유하는 핵심 정보 저장소입니다.

초기화 및 인증 (Initialization & Auth):

    DOMContentLoaded: HTML 문서 로딩이 완료되면 가장 먼저 실행되어 모든 시스템을 준비시킵니다.

    onAuthStateChanged: 사용자의 로그인 또는 로그아웃 상태 변화를 실시간으로 감지하여, 데이터 로딩(loadAllDataForUser) 또는 UI 초기화 같은 핵심적인 후속 조치를 명령합니다.

데이터 로딩 장교 (Data Loading Officer):

    loadAllDataForUser: 로그인 직후, 사용자의 familyId를 기반으로 families 컬렉션에서 해당 가족의 모든 루틴, 목표, 보상 데이터를 가져와 전역 변수에 보급하는 핵심 보급 장교입니다.

CRUD 장교 (데이터베이스 직접 통신):

    add...ToFirebase, update...InFirebase, delete...FromFirebase: addRoutineToFirebase처럼 이름이 ...ToFirebase로 끝나는 함수들입니다. 이들은 Firestore 데이터베이스와 직접 통신하여 데이터를 생성, 수정, 삭제하는 최전방 실무 부대입니다.

렌더링 장교 (UI 구성):

    renderRoutines, renderManagePage, renderRewardManagement 등 render...로 시작하는 함수들입니다. 이들은 Firebase로부터 보급받은 데이터를 바탕으로 실제 HTML 요소를 동적으로 생성하여 화면에 배치(렌더링)하는 임무를 수행합니다.

모달 통제 장교 (Modal Controllers):

    showRoutineForm, handleAddRoutineConfirm, showRewardModal 등 모달의 종류별로 전담 장교가 배치되어 있습니다. 이들은 모달을 열고, 닫고, 모달 안에서 '저장' 버튼이 눌렸을 때 입력된 데이터를 처리하여 CRUD 장교에게 전달하는 임무를 맡습니다.

페이지 항법 장교 (Page Navigation):

    showPage, showHomePage, showManagePage 등 show...로 시작하는 함수들입니다. 하단 탭 바의 명령에 따라 불필요한 페이지는 숨기고, 요청된 페이지만 화면에 표시하는 역할을 합니다.



---

#### **3. `styles.css` - 앱의 옷과 화장 (Visual Design)**

CSS 파일은 애플리케이션의 시각적인 모든 요소를 책임집니다.

CSS 파일은 우리 앱의 모든 시각적 요소를 정의하여 사용성을 높이고 정체성을 부여합니다.

:root (전역 변수):

    앱 전체의 색상, 둥근 모서리 값(--radius), 그림자 등을 변수로 정의하여, 앱의 디자인 테마를 일관되게 유지하고 변경을 용이하게 하는 핵심 디자인 규약입니다.

컴포넌트 스타일:

    .routine-item: 루틴의 상태(completed, inprogress, skipped)와 시간대(morning, afternoon, evening)에 따라 각기 다른 배경색과 효과를 부여하여 사용자가 시각적으로 상태를 즉시 인지하도록 합니다.

    .modal-overlay, .modal: 화면 전체를 덮는 반투명 오버레이와 중앙에 뜨는 모달창의 디자인을 정의합니다.

    .tab-btn: '관리' 페이지의 탭 버튼과, 현재 활성화된 탭(active)의 시각적 차이를 정의합니다.

애니메이션:

    @keyframes fadeInUp: 모달이나 새로운 요소가 나타날 때 아래에서 위로 부드럽게 떠오르는 효과를 부여하여 사용자 경험을 향상시킵니다.

    @keyframes pulse, confetti: 루틴 완료 등 긍정적인 상호작용 시 사용자에게 시각적인 피드백과 즐거움을 제공합니다.



---
2. 프로젝트 개발 계획 (Milestones)
2.1. 완료된 마일스톤 (Completed)
✅ 핵심 아키텍처 재설계: users 중심 모델에서 families 중심의 '가족 공유 데이터베이스' 모델로 성공적으로 전환 완료. (성능 및 비용 효율성, 확장성 확보)
✅ 역할 기반 시스템 구축: 부모와 자녀의 역할을 구분하고, Firestore 보안 규칙을 통해 역할에 맞는 데이터 접근 권한을 설정 완료.
✅ 부모의 자녀 루틴 관리: 부모가 관리 페이지에서 자신 또는 특정 자녀에게 루틴을 생성하고 할당하는 기능 구현 완료.
✅ 자녀용 인터페이스: 자녀에게는 '오늘의 미션'과 '보상' 탭만 보이는 간소화된 UI를 제공.
✅ 포인트 시스템 기반: 자녀가 루틴 완료 시 설정된 포인트를 획득하는 로직 구현 완료.
✅ 보상 시스템 (1단계): 부모가 '관리' 페이지에서 보상 아이템을 생성/수정/삭제하는 기능 구현 완료.

2.2. 향후 작전 목표 (Next Objectives)
🎯 보상 시스템 완성 (2, 3단계):

Task 1 (자녀): 자녀가 '보상(🎁)' 탭에서 부모가 등록한 보상 목록을 보고, 자신의 포인트로 '요청'하는 기능을 구현한다.
Task 2 (부모): 부모가 '보상(🎁)' 탭에서 자녀의 요청을 확인하고 '승인'해야만 포인트가 차감되는 승인 시스템을 구현한다.

🎯 가족 초대 시스템 구축:

현재 수동으로 설정하는 가족 관계를, 부모가 초대 코드를 생성하고 자녀가 코드를 입력하여 참여하는 방식으로 자동화한다.

🎯 게임화(Gamification) 요소 도입:

'펫 키우기' 등 자녀가 획득한 포인트를 즐겁게 사용할 수 있는 추가 콘텐츠를 도입한다.

🎯 그 외 아이디어:

가족 랭킹 시스템, 공동 목표 설정, 주간 가족 리포트 등.


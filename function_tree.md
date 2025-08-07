graph TD
    subgraph 초기화 및 인증 (Initialization & Auth)
        A[DOM 로드] --> B(DOMContentLoaded);
        B --> C{setupAllEventListeners};
        B --> D[Firebase Auth Listener];
        D --> E{onAuthStateChanged};
    end

    subgraph 데이터 관리 (Data Management)
        E --> F(loadAllDataForUser);
        F --> G{신규 유저?};
        G -- Yes --> H(uploadInitialDataForUser);
        H --> F;
        G -- No --> I[데이터 파싱];
        F --> J(resetDailyProgressForUser);
        J --> F;
    end

    subgraph 사용자 액션 핸들러 (User Action Handlers)
        K(사용자 액션: 클릭, 입력 등) --> L(handle... 함수 그룹);
        L -- 값 저장 요청 --> M(updateRoutineInFirebase);
        L -- 통계 업데이트 요청 --> N(updateUserStatsInFirebase);
        L -- 새 루틴 추가 요청 --> O(addRoutineToFirebase);
        L -- 루틴 삭제 요청 --> P(deleteRoutineFromFirebase);
    end

    subgraph Firebase 통신 (Backend Logic)
        M -- Firestore.update() --> Q([Firestore DB]);
        N -- Firestore.set() --> Q;



        
Show thinking
네, 현재 script.js 파일의 복잡한 구조를 이해하기 쉽도록 **기능 의존도 맵(Function Dependency Map)**을 그려드리겠습니다.

아래 맵은 어떤 함수가 다른 함수를 호출하고, 어떤 순서로 기능이 실행되는지를 시각적으로 보여줍니다.

## 🗺️ 기능 의존도 맵 (Mermaid Diagram)
Code snippet

graph TD
    subgraph 초기화 및 인증 (Initialization & Auth)
        A[DOM 로드] --> B(DOMContentLoaded);
        B --> C{setupAllEventListeners};
        B --> D[Firebase Auth Listener];
        D --> E{onAuthStateChanged};
    end

    subgraph 데이터 관리 (Data Management)
        E --> F(loadAllDataForUser);
        F --> G{신규 유저?};
        G -- Yes --> H(uploadInitialDataForUser);
        H --> F;
        G -- No --> I[데이터 파싱];
        F --> J(resetDailyProgressForUser);
        J --> F;
    end

    subgraph 사용자 액션 핸들러 (User Action Handlers)
        K(사용자 액션: 클릭, 입력 등) --> L(handle... 함수 그룹);
        L -- 값 저장 요청 --> M(updateRoutineInFirebase);
        L -- 통계 업데이트 요청 --> N(updateUserStatsInFirebase);
        L -- 새 루틴 추가 요청 --> O(addRoutineToFirebase);
        L -- 루틴 삭제 요청 --> P(deleteRoutineFromFirebase);
    end

    subgraph Firebase 통신 (Backend Logic)
        M -- Firestore.update() --> Q([Firestore DB]);
        N -- Firestore.set() --> Q;
        O -- Firestore.set() --> Q;
        P -- Firestore.delete() --> Q;
    end

    subgraph UI 렌더링 (UI Rendering)
        I --> R(renderRoutines);
        M --> R;
        N --> S(renderAreaStats);
        R --> T(updateDailyProgress);
    end

    style Q fill:#f9f,stroke:#333,stroke-width:2px

## ⚙️ 주요 기능 그룹별 설명
위 다이어그램은 5개의 주요 기능 그룹으로 나눌 수 있습니다.

1. 초기화 및 인증 (Initialization & Auth)
시작점: 웹 페이지가 로드되면(DOMContentLoaded) 모든 이벤트 리스너를 설정하고, Firebase에 사용자의 로그인 상태 변경을 감지하는 리스너를 부착합니다.

흐름: 사용자가 로그인하면 onAuthStateChanged가 이를 감지하고, 데이터 관리 그룹의 loadAllDataForUser 함수를 호출하며 본격적인 앱 실행이 시작됩니다.

2. 데이터 관리 (Data Management)
핵심 허브: loadAllDataForUser 함수가 이 그룹의 중심입니다. 사용자가 신규인지 기존 사용자인지 판단하여 초기 데이터를 생성(uploadInitialDataForUser)하거나 기존 데이터를 불러옵니다.

일일 초기화: 하루가 지나면 resetDailyProgressForUser를 통해 루틴 진행 상태를 초기화합니다.

3. 사용자 인터랙션 핸들러 (User Action Handlers)
중간 다리: handle...로 시작하는 함수들이 이 그룹에 속합니다. 사용자가 루틴을 완료하거나, 모달에서 값을 입력하는 등의 모든 행동(Action)을 받아, 어떤 데이터를 어떻게 처리할지 결정한 후 Firebase 통신 그룹에 요청을 보냅니다.

예시: handleStepperConfirm 함수는 스테퍼 모달에서 받은 숫자 값을 updateRoutineInFirebase 함수에 전달하여 데이터베이스 업데이트를 요청합니다.

4. Firebase 통신 (Backend Logic)
실제 저장소: 이 그룹의 함수들(update..., add..., delete...)이 실제로 Firestore 데이터베이스와 통신하여 데이터를 쓰고, 읽고, 수정하고, 삭제하는 작업을 담당합니다.

결과 전달: 데이터베이스 작업이 성공적으로 끝나면, UI 렌더링 그룹의 함수를 호출하여 변경된 내용을 화면에 반영하도록 지시합니다.

5. UI 렌더링 (UI Rendering)
화면 표시: render...로 시작하는 함수들이 여기에 속합니다. 데이터베이스에서 불러온 데이터나, 변경이 완료된 데이터를 기반으로 사용자가 보는 HTML 화면을 동적으로 생성하고 업데이트하는 역할을 합니다.

연쇄 반응: renderRoutines 함수가 실행되면, 진행률을 다시 계산하기 위해 updateDailyProgress 함수를 연쇄적으로 호출합니다.
        O -- Firestore.set() --> Q;
        P -- Firestore.delete() --> Q;
    end

    subgraph UI 렌더링 (UI Rendering)
        I --> R(renderRoutines);
        M --> R;
        N --> S(renderAreaStats);
        R --> T(updateDailyProgress);
    end

    style Q fill:#f9f,stroke:#333,stroke-width:2px

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

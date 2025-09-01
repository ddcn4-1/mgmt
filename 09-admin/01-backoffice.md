# 어드민/백오피스

## 주요 기능
- 대시보드: 예매 현황, 트래픽 지표, 에러율, 대기열 상태
- 권한 관리: 루트/하위 계정, 역할(Role)과 권한(Permission) 기반 접근 제어
- 트래픽 제어: Rate Limit/캐시 TTL/큐 처리량 등 동적 설정
- 이벤트 관리: 공연/좌석/가격 정책 CRUD

## 동적 설정 UI 예시
- Rate Limit: perMinute, burst, 대상 라우트 설정
- 캐시 정책: 리스트/상세 TTL, 무효화 트리거
- 스케일링: 컨테이너 증설 요청, 읽기 레플리카 토글(문서 지향)

## 권한 모델(RBAC) 예시
- ROOT_ADMIN: 모든 권한
- ADMIN: CONFIG_READ/WRITE, EVENT_MANAGE, USER_MANAGE
- ANALYST: METRICS_READ

## 학습 포인트
- 운영자 친화 UI/복구 가능 워크플로우(취소/롤백/확인)
- 감사로그(Audit Log)와 변경 이력 트래킹
- 구성 변경의 롤아웃/롤백 전략(Feature Flag)

## 실습 과제
- 동적 설정 폼 → 백엔드 `/admin/config` API와 연동
- 권한에 따른 UI 컴포넌트 가드 구현 (ProtectedRoute)
- 이벤트 CRUD 화면 목업 및 서버 DTO/검증 규칙 명세

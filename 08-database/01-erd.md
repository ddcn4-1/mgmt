# 데이터베이스 ERD

```mermaid
erDiagram
  USERS ||--o{ ORDERS : places
  USERS {
    uuid id PK
    string email
    string name
    string role  // USER/ADMIN
    datetime created_at
  }

  EVENTS ||--o{ SEATS : has
  EVENTS ||--o{ ORDERS : for
  EVENTS {
    uuid id PK
    string title
    datetime start_at
    datetime end_at
    string venue
    datetime created_at
  }

  SEATS {
    uuid id PK
    uuid event_id FK
    string section
    string row
    int number
    int price
    string status // AVAILABLE/HELD/SOLD
  }

  ORDERS {
    uuid id PK
    uuid user_id FK
    uuid event_id FK
    uuid seat_id FK
    string status // PENDING/PAID/CANCELLED
    datetime created_at
  }

  ROLES ||--o{ PERMISSIONS : grants
  USERS }o--o{ ROLES : has
  PERMISSIONS {
    uuid id PK
    string name // e.g., ADMIN:CONFIG_WRITE
  }
```

## 학습 포인트
- 이벤트/좌석/주문 간 무결성 및 인덱싱 설계
- 상태전이(AVAILABLE→HELD→SOLD)와 동시성 이슈
- 권한 모델(RBAC) 스키마와 확장성

## 실습 과제
- 좌석 상태/주문 상태 전이 표 정의 및 DB 제약조건 초안
- 고빈도 쿼리(INDEX PLAN) 설계: `event_id+status`, `user_id+created_at`
- 마이그레이션 스크립트(Flyway) 초안 작성

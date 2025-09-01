# 기술 스택

## 프론트엔드
- React, TypeScript
- UI 라이브러리 (예: MUI/Chakra/AntD 중 선택)
- 상태관리 (예: React Query/Redux Toolkit)

## 백엔드
- Java 17+, Spring Boot, Gradle
- Spring MVC, Spring Data JPA
- Swagger/OpenAPI 문서화
- Redis(락/캐시), 메시징(SQS)

## 데이터베이스
- PostgreSQL (AWS Aurora 호환) — 대안 MariaDB
- 마이그레이션: Flyway 또는 Liquibase

## 인프라
- Docker, Docker Compose (로컬/EC2)
- AWS: EC2, ALB, SQS, Lambda, EventBridge, CloudWatch

## 테스트/품질
- JUnit/Spock, Testcontainers
- 부하 테스트: k6 또는 Gatling
- 정적 분석: SpotBugs/Checkstyle, ESLint/Prettier

## 학습 포인트
- 트래픽/확장성 관점에서의 스택 선택 기준
- 메시지 큐/이벤트 기반 설계가 주는 유연성
- IaC/자동화 전환 시 고려사항

## 실습 과제
- 로컬 Docker Compose로 DB/Redis 기동 스크립트 작성
- Spring Boot + Swagger 초기 템플릿 생성 후 OpenAPI 노출
- 프론트 React + TS 템플릿에 UI 라이브러리 설치/레이아웃 구성

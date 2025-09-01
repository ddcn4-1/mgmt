# 인프라 배포

## 로컬(Docker Compose)
```yaml
version: '3.9'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
  api:
    build: ./api
    depends_on: [db, redis]
    environment:
      SPRING_PROFILES_ACTIVE: local
    ports: ["8080:8080"]
```

## 클라우드(AWS)
- EC2 + Docker Compose로 단일/소규모 구성부터 시작
- 필요 시 ALB 도입, 다중 EC2 스케일아웃, 오토스케일링 그룹
- SQS/Lambda/EventBridge로 비동기 파이프라인 구성
- CloudWatch로 로그/메트릭 수집, 경보 → Slack 연동

## 배포 파이프라인(예시)
- GitHub Actions: build → test → docker build/push → EC2 SSH 배포(or CodeDeploy)
- 환경 구성: `.env`/SSM Parameter Store/Secrets Manager 활용

## 학습 포인트
- 점진적 확장 전략: 단일 → ALB → ASG/멀티AZ
- 상태 저장/상태 비저장 컴포넌트 분리
- 비용/가용성/운영 복잡도 균형 맞추기

## 실습 과제
- EC2 1대에 Compose로 API/DB/Redis 배포(테스트용)
- ALB 뒤에 API 인스턴스 2대로 수평 확장 실습(헬스체크)
- CloudWatch 대시보드/알람 생성 및 Slack Webhook 연동

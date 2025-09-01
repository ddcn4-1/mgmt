# 테스트와 성능

## 테스트 전략
- 단위 테스트: 서비스/유틸 단위, 경계값/에러 케이스 포함
- 통합 테스트: Controller + Repository + DB(Testcontainers)
- 계약 테스트: OpenAPI 기반 요청/응답 스키마 검증

## 성능/부하 테스트
- 목표: 피크 순간 RPS, 평균/최대 지연, 오류율, 오버셀 0
- 도구: k6 또는 Gatling
- 시나리오: 인기 이벤트 동시 예매, 취소/재시도 혼합, 캐시 히트율 변화

### 예시(k6)
```js
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { vus: 200, duration: '60s' };
export default function () {
  const res = http.post('https://api.example.com/api/v1/orders', JSON.stringify({ eventId: 'E1', seatIds: ['S1'] }), { headers: { 'Content-Type': 'application/json' }});
  check(res, { 'status is 201 or 409': (r) => r.status === 201 || r.status === 409 });
  sleep(1);
}
```

## 캐시/세션 전략
- 캐시: 이벤트 리스트/상세 TTL, 무효화 타이밍
- 세션: JWT(무상태) vs 세션(상태) 선택 트레이드오프

## 학습 포인트
- 성능 KPI 정의와 테스트-운영 지표 연결
- 동시성 오류(Deadlock/Lock Contention) 재현 및 완화
- 캐시 적중률/콜드스타트 영향 분석

## 실습 과제
- Testcontainers로 Postgres/Redis 통합 테스트 구성
- k6 스크립트 작성 후 201/409 비율/지연시간 리포트
- 캐시 TTL/RateLimit 동적 조정 → 성능 변화 비교표 작성

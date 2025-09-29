# 좌석 락 시스템 구현 가이드

## 시스템 개요

### 배경

티켓팅 시스템에서 좌석 선택 시 발생하는 동시성 문제를 해결하고, 사용자 간의 좌석 경합을 효율적으로 관리하기 위한 좌석 락 시스템을 구현했습니다.

### 기능

- **실시간 좌석 가용성 조회**: 현재 사용 가능한 좌석 정보 제공
- **좌석 임시 잠금**: 사용자가 선택한 좌석을 일정 시간 동안 잠금
- **자동 만료 처리**: 설정된 시간이 지나면 자동으로 잠금 해제
- **동시성 제어**: 여러 사용자가 같은 좌석을 선택할 때 충돌 방지
- **보안 강화**: 인증된 사용자만 자신의 좌석을 제어할 수 있도록 제한

---

## 아키텍처 설계

### 이중화 락 시스템

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Client      │    │   Spring App    │    │     Redis       │
│                 │    │                 │    │   (Distributed  │
│   좌석 선택 요청   ├───▶│   SeatService   ├───▶│     Lock)       │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   PostgreSQL    │
                       │   (Persistent   │
                       │     State)      │
                       └─────────────────┘

```

### 데이터 플로우

1. **사용자 요청**: 특정 좌석들에 대한 잠금 요청
2. **Redis 락**: 분산 락으로 동시성 제어
3. **DB 상태 확인**: 실제 좌석 상태 검증
4. **상태 업데이트**: 좌석 상태를 LOCKED로 변경
5. **락 정보 저장**: SeatLock 엔티티에 잠금 정보 저장

---

## 핵심 구현 내용

### 1. 좌석 잠금 메커니즘

```java
public SeatLockResponse lockSeats(List<Long> seatIds, Long userId, String sessionId) {
    // 1. 만료된 락 정리
    cleanupExpiredLocks();

    // 2. 좌석 가용성 확인
    for (ScheduleSeat seat : seats) {
        if (seat.getStatus() == ScheduleSeat.SeatStatus.BOOKED) {
            return SeatLockResponse.failure("이미 예약된 좌석이 포함되어 있습니다");
        }

        if (seat.getStatus() == ScheduleSeat.SeatStatus.LOCKED) {
            // 같은 사용자/세션이면 연장, 아니면 실패
            Optional<SeatLock> existingLock = seatLockRepository
                .findBySeatAndStatusAndExpiresAtAfter(seat, SeatLock.LockStatus.ACTIVE, LocalDateTime.now());

            if (existingLock.isPresent() && !isSameUserOrSession(existingLock.get(), user, sessionId)) {
                return SeatLockResponse.failure("다른 사용자가 선택 중인 좌석입니다");
            }
        }
    }

    // 3. Redis 분산 락으로 동시성 제어
    for (String lockKey : lockKeys) {
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(
            lockKey, lockValue, LOCK_DURATION_MINUTES, TimeUnit.MINUTES
        );

        if (Boolean.FALSE.equals(acquired)) {
            rollbackRedisLocks(lockKeys, lockValue);
            return SeatLockResponse.failure("좌석 락 획득 실패");
        }
    }

    // 4. DB 상태 업데이트
    // ... 좌석 상태 변경 및 SeatLock 엔티티 저장
}

```

### 2. 만료 처리 시스템

**스케줄러 기반 자동 정리**

```java
@Scheduled(fixedRate = 60000) // 1분마다 실행
public void cleanupExpiredLocks() {
    List<SeatLock> expiredLocks = seatLockRepository
        .findByStatusAndExpiresAtBefore(SeatLock.LockStatus.ACTIVE, LocalDateTime.now());

    for (SeatLock lock : expiredLocks) {
        releaseSingleSeat(lock);
    }
}

```

### 3. 데이터 일관성 보장

**트랜잭션 롤백 처리**

```java
try {
    // Redis 락 획득
    // DB 상태 변경
} catch (Exception e) {
    // 실패 시 Redis 락 정리
    rollbackRedisLocks(lockKeys, lockValue);
    throw new RuntimeException("좌석 락 처리 중 오류 발생", e);
}

```

---

## 동시성 제어

### Redis 분산 락 패턴

```java
private static final String REDIS_LOCK_PREFIX = "seat_lock:";

// 락 획득
Boolean acquired = redisTemplate.opsForValue().setIfAbsent(
    lockKey,
    lockValue,  // userId:sessionId 형태
    LOCK_DURATION_MINUTES,
    TimeUnit.MINUTES
);

// 롤백 시 안전한 락 해제
private void rollbackRedisLocks(List<String> lockKeys, String lockValue) {
    for (String lockKey : lockKeys) {
        try {
            String currentValue = redisTemplate.opsForValue().get(lockKey);
            if (lockValue.equals(currentValue)) {
                redisTemplate.delete(lockKey);  // 본인이 설정한 락만 삭제
            }
        } catch (Exception e) {
            // 롤백 중 오류는 로깅만 하고 계속 진행
        }
    }
}

```

### 경합 상황 처리

1. **같은 좌석을 여러 사용자가 선택**: 첫 번째 사용자만 성공, 나머지는 실패 응답
2. **기존 락 연장**: 같은 사용자/세션이면 만료 시간 연장
3. **부분 실패 처리**: 일부 좌석만 락 실패 시 전체 롤백

---

## 트러블슈팅

### 1. Redis 연결 실패

**증상**: 좌석 락 기능 전체 장애
**해결**:

```yaml
# application.yml에서 타임아웃 설정
spring:
  data:
    redis:
      timeout: 2000ms
      # 연결 실패 시 fallback 로직 구현 필요

```

### 2. 락 만료 시간 부족

**증상**: 사용자가 결제 중 좌석이 해제됨
**해결**:

- 기본 락 시간을 10분으로 설정
- 필요 시 연장 API 구현

### 3. 대량 동시 접속 시 성능 저하

**증상**: 좌석 선택 응답 시간 증가
**해결**:

- Redis 커넥션 풀 크기 조정
- DB 쿼리 최적화 (배치 처리)

### 성능 최적화 방안

### 1. 배치 처리

```java
// 여러 좌석을 한 번에 처리
List<ScheduleSeat> seats = scheduleSeatRepository.findAllById(seatIds);
// 개별 조회 대신 배치 조회 사용

```

### 2. 캐싱 전략

```java
// 자주 조회되는 스케줄 정보 캐싱
@Cacheable("schedules")
public PerformanceSchedule getSchedule(Long scheduleId) {
    return scheduleRepository.findById(scheduleId).orElse(null);
}

```

---

## API 사용법

### 1. 좌석 가용성 조회

```
GET /api/v1/schedules/{scheduleId}/seats
Authorization: Bearer {token}

```

**응답 예시**

```json
{
  "status": "success",
  "message": "좌석 조회 성공",
  "data": {
    "scheduleId": 1,
    "totalSeats": 10,
    "availableSeats": 8,
    "seats": [
      {
        "seatId": 1,
        "seatRow": "A",
        "seatNumber": "1",
        "price": 200000,
        "status": "AVAILABLE"
      }
    ]
  }
}

```

### 2. 좌석 잠금

```
POST /api/v1/schedules/{scheduleId}/seats/lock
Authorization: Bearer {token}
Content-Type: application/json

{
  "seatIds": [1, 2, 3],
  "userId": 123,
  "sessionId": "session-abc-123"
}

```

**응답 예시**

```json
{
  "status": "success",
  "message": "좌석 락 성공",
  "data": {
    "success": true,
    "message": "좌석 락 성공",
    "expiresAt": "2024-12-01T10:10:00Z"
  }
}

```

### 3. 예약 생성

```
POST /api/v1/bookings
Authorization: Bearer {token}
Content-Type: application/json

{
  "scheduleId": 1,
  "seatIds": [1, 2, 3],
  "queueToken": "queue-token-xyz"
}

```

### 테스트 시나리오

### 정상 케이스

1. 로그인 → 좌석 조회 → 좌석 선택 → 예약 생성 → 결제 → 예약 확정

### 예외 케이스

1. **다른 사용자 좌석 조작 시도**
    
    ```bash
    # 403 Forbidden 응답 확인
    curl -X POST /api/v1/schedules/1/seats/lock \\
         -H "Authorization: Bearer user1-token" \\
         -d '{"seatIds":[1],"userId":999,"sessionId":"test"}'
    
    ```
    
2. **Cross-schedule 공격 시도**
    
    ```bash
    # 400 Bad Request 응답 확인
    curl -X POST /api/v1/bookings \\
         -H "Authorization: Bearer user1-token" \\
         -d '{"scheduleId":1,"seatIds":[11,12,13]}'  # 스케줄 3의 좌석들
    
    ```
    

---

## 이후 개선 사항

1. **대기열 시스템**: 인기 공연의 동시 접속 제어
2. **분산 캐시**: 다중 인스턴스 환경에서의 성능 개선

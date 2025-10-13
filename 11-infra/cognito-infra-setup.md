# AWS Cognito 인증 시스템 구축 가이드

## 목차
- [왜 AWS Cognito인가?](#왜-aws-cognito인가)
- [Cognito User Pool 구성](#cognito-user-pool-구성)
- [App Client 설정](#app-client-설정)
- [Lambda와 API Gateway 통합](#lambda와-api-gateway-통합)
- [Custom Domain 및 DNS 설정](#custom-domain-및-dns-설정)
- [보안 고려사항](#보안-고려사항)
- [운영 Best Practices](#운영-best-practices)

---

## 왜 AWS Cognito인가?

### 관리형 인증 서비스의 장점

**직접 구현 vs Cognito 비교**:

```yaml
직접 구현 시 필요한 요소:
  - 사용자 데이터베이스 설계 및 관리
  - 비밀번호 해싱 및 보안 저장 (bcrypt, Argon2)
  - 이메일/SMS 인증 인프라
  - 토큰 생성 및 검증 로직 (JWT)
  - 토큰 갱신 메커니즘
  - 세션 관리 및 만료 처리
  - 보안 취약점 지속 모니터링
  - 규정 준수 (GDPR, CCPA 등)

Cognito 사용 시:
  ✅ 완전 관리형 사용자 풀
  ✅ 자동 확장 및 고가용성
  ✅ 내장 보안 기능 (MFA, 비밀번호 정책)
  ✅ OAuth 2.0 / OIDC 표준 준수
  ✅ 소셜 로그인 통합 지원
  ✅ AWS 서비스와 네이티브 통합
  ✅ 규정 준수 인증 (SOC, ISO, PCI DSS)
```

### 프로젝트 적용 배경

우리 프로젝트는 **MSA 전환과 함께 인증 서비스를 분리**하는 과정에서 Cognito를 도입했습니다:

```yaml
인증 아키텍처 요구사항:
  - 서브도메인 간 인증 상태 공유 (ddcn41.com, admin.ddcn41.com)
  - 쿠키 기반 세션 관리
  - 서버리스 인증 처리 (Lambda)
  - 빠른 구현 및 안정적인 운영

Cognito 선택 이유:
  1. 완전 관리형으로 개발 시간 단축
  2. AWS Lambda와 API Gateway 네이티브 통합
  3. 쿠키 기반 인증 구현 용이
  4. 프로덕션 수준의 보안 및 확장성
```

> 참조: [AWS Cognito 개발자 가이드](https://docs.aws.amazon.com/cognito/latest/developerguide/)

---

## Cognito User Pool 구성

### User Pool 기본 설정

**AWS Console**: `Amazon Cognito → User Pools → Create user pool`

```yaml
기본 설정:
  Pool name: your-user-pool-name
  Tier: Essentials (개발/소규모) | Plus (프로덕션)

로그인 옵션:
  ✅ Email (필수)
  ⬜ Phone number (선택)
  ⬜ Username (선택)

설정 가이드:
  - 이메일 로그인: 가장 보편적이고 관리 용이
  - 전화번호: SMS 비용 발생, MFA 구현 시 고려
  - Username: 사용자가 기억해야 하는 추가 정보
```

> 참조: [User Pool 생성 가이드](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-as-user-directory.html)

### 비밀번호 정책

보안과 사용자 경험의 균형을 고려한 정책 설정:

```yaml
권장 비밀번호 정책:
  최소 길이: 8자
  필수 문자:
    ✅ 대문자
    ✅ 소문자
    ✅ 숫자
    ✅ 특수문자

  Password history: 5개 (재사용 방지)
  임시 비밀번호 유효기간: 7일

보안 수준별 권장사항:
  기본 (소규모/내부): 8자, 3가지 문자 유형
  표준 (일반 서비스): 8자, 4가지 문자 유형 (위 설정)
  강화 (금융/의료): 12자 이상, 4가지 문자 유형 + MFA 필수
```

### 사용자 속성 설정

```yaml
표준 속성 (필수/선택):
  ✅ email (필수, 고유 식별자)
  ⬜ name (선택)
  ⬜ phone_number (선택, MFA 사용 시 권장)
  ⬜ picture (선택)

커스텀 속성 예시:
  - custom:organization_id: 조직 식별
  - custom:role: 사용자 역할
  - custom:subscription_tier: 구독 등급

⚠️ 주의사항:
  - 커스텀 속성은 생성 후 삭제 불가
  - 속성 타입 변경 불가
  - 신중하게 설계 필요
```

### 이메일 설정

```yaml
개발 환경:
  Provider: Cognito default
  제한: 일일 50통
  용도: 개발 및 테스트

프로덕션 환경:
  Provider: Amazon SES (권장)
  FROM 주소: noreply@yourdomain.com
  도메인 인증: DKIM, SPF 설정
  장점:
    - 무제한 발송 (요청 시)
    - 발송 통계 및 모니터링
    - 반송/불만 처리
    - 커스텀 이메일 템플릿
```

> 참조: [Cognito 이메일 설정](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html)

---

## App Client 설정

### App Client 생성 및 구성

**경로**: `User Pool → App integration → App clients → Create app client`

```yaml
기본 설정:
  App client name: "My web app"
  App type: Public client (SPA) | Confidential client (Server-side)

인증 흐름 (Authentication flows):
  ✅ ALLOW_USER_AUTH: 선택 기반 로그인
  ✅ ALLOW_USER_SRP_AUTH: Secure Remote Password (권장)
  ✅ ALLOW_USER_PASSWORD_AUTH: 직접 비밀번호 인증
  ✅ ALLOW_REFRESH_TOKEN_AUTH: 토큰 갱신
  ⬜ ALLOW_CUSTOM_AUTH: Lambda 트리거 사용 시

Authentication flow session: 3분 (기본값)
```

**인증 흐름 선택 가이드**:

| 흐름 | 설명 | 보안 수준 | 사용 사례 |
|------|------|-----------|-----------|
| USER_SRP_AUTH | SRP 프로토콜, 비밀번호 서버 전송 X | 높음 | 프로덕션 권장 |
| USER_PASSWORD_AUTH | 직접 비밀번호 전송 | 중간 | 내부 도구, 빠른 구현 |
| USER_AUTH | 다중 인증 방법 지원 | 높음 | 최신 권장 방식 |
| CUSTOM_AUTH | Lambda 커스텀 로직 | 가변 | 특수 요구사항 |

> 참조: [Cognito 인증 흐름](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow.html)

### 토큰 설정

```yaml
토큰 유효기간 권장 설정:

  Access Token:
    설정: 60분
    용도: API 요청 인증
    특징: 짧은 수명, 자주 갱신

  ID Token:
    설정: 60분
    용도: 사용자 정보 포함
    특징: Access Token과 동일 수명 권장

  Refresh Token:
    설정: 5일 (개발) | 30일 (프로덕션)
    용도: Access/ID Token 재발급
    특징: 긴 수명, 보안 저장 필수

보안 수준별 권장:
  높음 (금융): Access 15분, Refresh 1일
  표준 (일반): Access 60분, Refresh 30일
  편의 (내부): Access 4시간, Refresh 90일
```

### 토큰 관리 기능

```yaml
필수 활성화 기능:

✅ Enable token revocation:
  - 로그아웃 시 토큰 즉시 무효화
  - 보안 사고 시 토큰 강제 만료
  - 약간의 성능 오버헤드 있음

✅ Prevent user existence errors:
  - 로그인 실패 시 일관된 오류 메시지
  - 사용자 열거 공격 방어
  - 보안 강화 필수 기능

선택 기능:

Refresh token rotation:
  - Refresh Token 사용 시 새 토큰 발급
  - 토큰 도용 위험 감소
  - 복잡도 증가, 신중히 고려

Refresh token grace period:
  - 기본: 0초
  - 시계 불일치 허용 범위
  - 특수 상황에만 설정
```

> 참조: [Token revocation](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html)

---

## Lambda와 API Gateway 통합

### 아키텍처 개요

```yaml
인증 처리 흐름:

  클라이언트 (브라우저)
    ↓ HTTPS
  API Gateway (accounts.ddcn41.com)
    ↓ Lambda Proxy Integration
  Lambda Function (auth-handler)
    ↓ AWS SDK
  Cognito User Pool
    ↓ 토큰 발급
  Lambda → 클라이언트 (쿠키 설정)

장점:
  ✅ 서버리스 자동 확장
  ✅ 쿠키 설정 등 커스텀 로직 추가 가능
  ✅ 비용 효율적 (사용량 기반)
  ✅ 관리 오버헤드 최소화
```

### Lambda 함수 구성

**경로**: `AWS Lambda → Create function`

```yaml
기본 설정:
  Function name: auth-handler
  Runtime: Node.js 20.x (최신 LTS 권장)
  Architecture: arm64 (20% 비용 절감) | x86_64
  Memory: 256MB (기본값)
  Timeout: 10초 (API 호출 고려)

환경 변수:
  CLIENT_ID: Cognito App Client ID
  USER_POOL_ID: User Pool ID
  COOKIE_DOMAIN: .ddcn41.com (점 포함!)
  LOGOUT_REDIRECT_URI: https://ddcn41.com

IAM 권한 (Lambda Execution Role):
  - cognito-idp:InitiateAuth
  - cognito-idp:GetUser
  - cognito-idp:GlobalSignOut
```

**Lambda 함수 핵심 구조**:

```javascript
// 필수 패키지
const { CognitoIdentityProviderClient } = require("@aws-sdk/client-cognito-identity-provider");

// 라우트 처리
exports.handler = async (event) => {
  const path = event.rawPath;
  const method = event.requestContext.http.method;

  // 라우팅
  if (path.includes("/login") && method === "POST") {
    return await handleLogin(event);
  }
  if (path.includes("/refresh") && method === "POST") {
    return await handleRefresh(event);
  }
  if (path.includes("/logout") && method === "POST") {
    return await handleLogout(event);
  }
  if (path.includes("/me") && method === "GET") {
    return await handleGetUser(event);
  }

  return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
};
```

**주요 엔드포인트**:

| 경로 | 메서드 | 기능 | Cognito API |
|------|--------|------|-------------|
| /v2/auth/login | POST | 로그인 | InitiateAuth (USER_PASSWORD_AUTH) |
| /v2/auth/refresh | POST | 토큰 갱신 | InitiateAuth (REFRESH_TOKEN_AUTH) |
| /v2/auth/logout | POST | 로그아웃 | GlobalSignOut |
| /v2/auth/me | GET | 사용자 정보 | GetUser |

> 참조: [Cognito InitiateAuth API](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_InitiateAuth.html)

### API Gateway 설정

**경로**: `API Gateway → Create API → HTTP API`

```yaml
API 기본 설정:
  API name: api-ddcn41v2
  API type: HTTP API (권장, 저렴하고 빠름)
  Integration: Lambda (auth-handler)

라우트 구성:
  /v2/auth/{proxy+}
    - OPTIONS (CORS preflight)
    - GET (사용자 정보 조회)
    - POST (로그인, 갱신, 로그아웃)

Integration 설정:
  Type: Lambda Proxy Integration
  Payload version: 2.0
  설명: Lambda가 요청/응답 전체 제어
```

### CORS 설정

**경로**: `API Gateway → CORS`

```yaml
CORS 필수 설정:

Access-Control-Allow-Origin:
  개발: https://local.ddcn41.com, https://local.admin.ddcn41.com
  프로덕션: https://ddcn41.com, https://admin.ddcn41.com

⚠️ 중요: 쿠키 사용 시 와일드카드(*) 사용 불가!

Access-Control-Allow-Headers:
  - content-type
  - authorization

Access-Control-Allow-Methods:
  - GET, POST, OPTIONS, HEAD

Access-Control-Allow-Credentials: YES (필수!)
  - 쿠키 전송을 위해 반드시 활성화

Access-Control-Max-Age: 3600 (1시간)
```

> 참조: [API Gateway CORS 설정](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html)

---

## Custom Domain 및 DNS 설정

### ACM 인증서 준비

**경로**: `AWS Certificate Manager (us-east-1 리전)`

```yaml
⚠️ 중요: 인증서는 반드시 us-east-1에서 생성!

인증서 설정:
  Domain names:
    - accounts.ddcn41.com
    또는
    - *.ddcn41.com (와일드카드, 권장)

  Validation: DNS validation (권장)

검증 프로세스:
  1. ACM이 CNAME 레코드 제공
  2. Route53에 CNAME 레코드 추가
  3. 검증 완료 대기 (5-30분)
  4. 상태: Issued 확인
```

### API Gateway Custom Domain

**경로**: `API Gateway → Custom domain names → Create`

```yaml
도메인 설정:
  Domain name: accounts.ddcn41.com
  Endpoint type: Regional (권장)
  TLS version: TLS 1.2 (기본값)
  ACM certificate: [위에서 생성한 인증서 선택]

API Mapping:
  API: api-ddcn41v2
  Stage: $default
  Path: (비어있음)

결과 URL:
  https://accounts.ddcn41.com/v2/auth/login
```

### 기본 도메인 노출 방지

Custom Domain 사용 시에도 기본 API Gateway 엔드포인트가 노출됩니다:

```
https://abc123xyz.execute-api.ap-northeast-2.amazonaws.com
```

**방어 방법**:

**1. Resource Policy (권장)**:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Principal": "*",
    "Action": "execute-api:Invoke",
    "Resource": "arn:aws:execute-api:region:account-id:api-id/*",
    "Condition": {
      "StringNotEquals": {
        "aws:Referer": "accounts.ddcn41.com"
      }
    }
  }]
}
```

**2. Lambda에서 Host 헤더 검증**:

```javascript
exports.handler = async (event) => {
  const host = event.headers.host || event.headers.Host;
  const allowedHosts = ['accounts.ddcn41.com'];

  if (!allowedHosts.includes(host)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  // 정상 처리
};
```

> 참조: [API Gateway Resource Policies](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies.html)

### Route53 DNS 설정

**경로**: `Route53 → Hosted zones → Create record`

```yaml
A 레코드 (Alias):
  Record name: accounts
  Record type: A

  Alias: YES (필수)
  Route traffic to: Alias to API Gateway API
  Region: ap-northeast-2
  Endpoint: [자동 검색되는 API Gateway 도메인]

  Routing policy: Simple routing
  Evaluate target health: YES (권장)

DNS 전파:
  Route53 → API Gateway: 즉시 (수 초)
  글로벌 전파: 1-2분
  최대: 5분
```

> 참조: [Route53 API Gateway 라우팅](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-api-gateway.html)

---

## 보안 고려사항

### 쿠키 보안 설정

```yaml
필수 쿠키 속성:

HttpOnly: true
  - JavaScript 접근 차단
  - XSS 공격 방어

Secure: true
  - HTTPS 전송만 허용
  - 중간자 공격 방어

SameSite: None (서브도메인 간 공유)
  - Strict: 동일 사이트만
  - Lax: GET 요청 허용 (기본값)
  - None: 모든 요청 허용 (Secure 필수)

Domain: .ddcn41.com (점 포함!)
  - 서브도메인 간 공유
  - 보안 범위 최소화 원칙

Path: /
  - 전체 경로 접근
```

### 토큰 보안

```yaml
보안 원칙:

✅ DO:
  - Access Token은 짧은 수명 유지 (≤60분)
  - Refresh Token은 HttpOnly 쿠키에 저장
  - Token revocation 활성화
  - HTTPS 필수 사용
  - 토큰 만료 시 자동 갱신

❌ DON'T:
  - 로컬스토리지에 토큰 저장 (XSS 위험)
  - URL 파라미터로 토큰 전달
  - 토큰을 로그에 기록
  - 만료된 토큰 재사용
```

### 인프라 보안

```yaml
Lambda 보안:
  - 최소 권한 원칙 (IAM)
  - 환경 변수 암호화
  - VPC 격리 (필요 시)
  - CloudWatch 로그 모니터링

API Gateway 보안:
  - WAF 연동 (DDoS 방어)
  - Rate limiting (429 응답)
  - API Key 관리 (필요 시)
  - 로깅 및 모니터링

Cognito 보안:
  - MFA 활성화 (프로덕션)
  - Advanced security features
  - 로그인 시도 제한
  - 의심스러운 활동 감지
```

---

## 운영 Best Practices

### 모니터링 및 로깅

```yaml
필수 모니터링:

CloudWatch Metrics:
  Lambda:
    - Invocation count
    - Error count & rate
    - Duration (cold start 포함)
    - Concurrent executions

  API Gateway:
    - Request count
    - 4XX/5XX error rate
    - Latency (p50, p99)
    - Integration latency

  Cognito:
    - Sign-in success/failure
    - Token generation
    - User pool size

CloudWatch Alarms:
  - 5XX 에러율 > 1%
  - Lambda duration > 3000ms
  - API Gateway 4XX > 10%
  - Cognito 로그인 실패율 > 5%
```

### 성능 최적화

```yaml
Lambda 최적화:
  ✅ Cold start 최소화:
    - Provisioned concurrency (트래픽 예측 가능 시)
    - 최소 의존성 패키지
    - 연결 재사용 (Cognito client)

  ✅ 메모리 튜닝:
    - 128MB: 단순 인증 (저비용)
    - 256MB: 표준 권장
    - 512MB: 복잡한 로직

API Gateway:
  ✅ 캐싱 (신중히):
    - /me 엔드포인트: 짧은 TTL (30초)
    - /login, /logout: 캐싱 비활성화

  ✅ Throttling:
    - Rate limit: 1000 req/sec
    - Burst limit: 2000 req
```

### 비용 최적화

```yaml
서비스별 비용 구조:

Cognito:
  - 월 50,000 MAU까지 무료
  - 이후: $0.00550/MAU
  - MFA SMS: 별도 과금

Lambda:
  - 월 100만 요청 무료
  - 이후: $0.20/100만 요청
  - Duration: $0.0000166667/GB-초

API Gateway:
  - 월 100만 요청 무료 (12개월)
  - 이후: $1.00/100만 요청

최적화 팁:
  - Lambda arm64 사용 (20% 절감)
  - HTTP API 사용 (REST API 대비 70% 저렴)
  - CloudWatch 로그 보존 기간 설정
```

### 재해 복구 및 백업

```yaml
백업 전략:

Cognito User Pool:
  - CSV 내보내기 (정기 백업)
  - Lambda 트리거로 자동화
  - S3 암호화 저장

Infrastructure as Code:
  - Terraform/CloudFormation
  - Git 버전 관리
  - 다중 리전 배포 (DR)

복구 시나리오:
  1. User Pool 삭제: 백업에서 복원
  2. Lambda 장애: 버전 롤백
  3. API Gateway 장애: 다른 리전 failover
  4. 리전 장애: Cross-region replication
```

---

## 참고 문서

### AWS Cognito
- [Amazon Cognito Developer Guide](https://docs.aws.amazon.com/cognito/latest/developerguide/)
- [User Pool Authentication Flow](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow.html)
- [Using Tokens with User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-with-identity-providers.html)
- [Token Revocation](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html)

### API Gateway & Lambda
- [HTTP API Developer Guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html)
- [Working with CORS](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html)
- [Custom Domain Names](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-custom-domains.html)
- [Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)

### Route53 & Security
- [Routing Traffic to API Gateway](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-api-gateway.html)
- [API Gateway Resource Policies](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies.html)


---
**작성일**: 2025-10-13  
**최종 업데이트**: 2025-10-13

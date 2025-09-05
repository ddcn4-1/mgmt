# Folder Structure in SpringBoot

## 계층형 구조

Layer-based Structure

-   장점: 이해하기 쉽고, 작은 프로젝트에 적합
-   단점: 프로젝트가 커질수록 파일 찾기 어려움

예시 프로젝트: 스프링 팀의 공식 샘플 PetClinic
https://github.com/spring-projects/spring-petclinic/tree/main/src

```bash
src/main/java/com/example/project/
├── config/                 # 설정 관련
│   ├── security/           # 보안 설정
│   ├── database/           # DB 설정
│   └── swagger/            # API 문서 설정
├── controller/             # 컨트롤러
├── service/               # 서비스 로직
│   └── impl/              # 서비스 구현체
├── repository/            # 데이터 접근
├── entity/                # JPA 엔티티
├── dto/                   # 데이터 전송 객체
│   ├── request/           # 요청 DTO
│   └── response/          # 응답 DTO
├── exception/             # 예외 처리
│   ├── custom/            # 커스텀 예외
│   └── handler/           # 글로벌 예외 핸들러
├── util/                  # 유틸리티
├── common/                # 공통 코드
│   ├── constants/         # 상수
│   └── enums/            # 열거형
├── security/              # 보안 관련
└── validation/            # 유효성 검증
```

## 도메인 중심 구조

Domain-driven Structure -장점: 비즈니스 로직이 명확하고, 팀 단위 개발에 유리

-   단점: 초기 설계가 중요하고, 도메인 분리가 애매할 수 있음

```bash
src/main/java/com/example/project/
├── global/                # 전역 설정 및 공통 기능
│   ├── config/
│   ├── exception/
│   ├── util/
│   └── security/
├── domain/
│   ├── user/              # 사용자 도메인
│   │   ├── controller/
│   │   ├── service/
│   │   ├── repository/
│   │   ├── entity/
│   │   └── dto/
│   ├── product/           # 상품 도메인
│   │   ├── controller/
│   │   ├── service/
│   │   ├── repository/
│   │   ├── entity/
│   │   └── dto/
│   └── order/             # 주문 도메인
│       ├── controller/
│       ├── service/
│       ├── repository/
│       ├── entity/
│       └── dto/
└── common/                # 공통 코드
    ├── constants/
    └── enums/


```

## 제안

-   현재: 계층형 구조
-   변경: 도메인 중심 구조

API 9/5~9/8 사이 API 머지 후 폴더 구조 일괄적 변경

### 근거

#### 1. Spring Boot 공식 문서의 "Structuring Your Code" 섹션:

> "We generally recommend that you locate your main application class in a root package above other classes"

도메인별 패키지 구성을 권장: `com.example.myapplication.customer`, `com.example.myapplication.order` 형태

##### 2. Baeldung의 모범 사례

> "Package by Feature (Domain)" 방식을 권장

> "Each package contains all classes related to a particular feature"

관련된 클래스들의 응집도(cohesion)를 높이고 결합도(coupling)를 낮춤

#### 3. Oracle Java Tutorials에서 패키지 네이밍 원칙

> "Packages should be named to reflect their purpose"

기능적 그룹핑보다는 목적과 도메인에 따른 그룹핑 권장

## 추가로 볼만한 토픽

-   헥사고날 아키텍쳐 구조 (Ports and Adapters)

## Reference

-   Spring Boot doc : Structuring Your Code" 섹션 https://docs.spring.io/spring-boot/reference/using/structuring-your-code.html#using.structuring-your-code
-   Non-official spring learning site https://www.baeldung.com/
    -   https://www.baeldung.com/spring-boot-package-structure
    -   https://www.baeldung.com/java-packages
-   Oracle Java Tutorials - naming a pacakge https://docs.oracle.com/javase/tutorial/java/package/namingpkgs.html

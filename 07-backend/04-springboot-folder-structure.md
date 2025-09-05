# Folder Structure in SpringBoot

## 계층형 구조

Layer-based Structure

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

##

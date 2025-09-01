# 공통 규칙(컨벤션)

## 브랜치/릴리스
- 브랜치: `main`(보호), `feature/*`, `hotfix/*`
- 커밋 메시지: Conventional Commits(예: feat:, fix:, docs:)
- PR 규칙: 템플릿 사용, 리뷰어 1+ 승인

## 네이밍/구조
- 백엔드: 패키지 by-layer, DTO 명확 구분, JPA 엔티티 접미사 금지
- 프론트: 폴더 by-feature, 컴포넌트 PascalCase, 훅 camelCase

## 코드 스타일
- 백엔드: Checkstyle/SpotBugs, 포맷팅 고정
- 프론트: ESLint + Prettier, strict TS 옵션

## 문서
- 다이어그램은 Mermaid 기본, 파일명은 섹션 내 2자리 번호 접두사
- 새 페이지 추가 시 SUMMARY 업데이트 필수

## 리뷰 체크리스트
- [ ] 테스트 포함/갱신 여부
- [ ] 보안/권한 영향 검토
- [ ] 성능/쿼리 계획 검토

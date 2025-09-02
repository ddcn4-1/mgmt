# GitHub Issue Template 생성 및 활용 가이드

## Issue Template 생성 과정

### 1단계: Template 설정 페이지 접근

1. **개별 레포지토리의 경우**: 해당 레포지토리의 **Settings** 탭으로 이동
2. **Organization 전체 적용의 경우**: `.github` 레포지토리의 **Settings** 탭으로 이동
3. **Features** 섹션에서 **Issues** 항목을 찾아 **'Set up templates'** 버튼 클릭

### 2단계: 템플릿 추가 및 작성

1. **'Add template: select'** 버튼을 클릭하여 원하는 템플릿 유형 선택
    - **Bug Report**: 버그 신고용 템플릿
    - **Feature Request**: 기능 요청용 템플릿
    - **Custom Template**: 사용자 정의 템플릿
2. 템플릿 내용을 작성하고 **'Propose changes'** 버튼 클릭
3. 변경사항을 커밋하여 템플릿 저장 완료

## 적용한 Feature Request 템플릿

```markdown
### 이슈 타입 (하나 이상의 타입을 선택)
- [ ] Feat : 새로운 기능 추가
- [ ] Fix : 버그 수정

### 반영 브랜치
ex) feat/#1 (이슈 넘버)

### 기능 내용
ex) 로그인 시, 구글 소셜 로그인 기능을 추가했습니다.

### 작업 상세 내용
- [ ] TODO 1
- [ ] TODO 2  
- [ ] TODO 3
```

## Issue Template 활용

### 이슈 생성 시

1. 새로운 이슈 생성 페이지에서 **템플릿 선택 화면**이 자동으로 표시
2. 원하는 템플릿을 선택하면 **미리 작성된 양식**이 자동으로 적용
3. 템플릿에 따라 필요한 정보를 채워 이슈를 작성

## 중요 참고사항

### Organization의 .github 레포지토리

- `.github` 레포지토리는 **Organization 전용 특수 레포지토리**
- 이 레포지토리에 설정한 Template은 **같은 Organization의 모든 레포지토리**에 자동 적용

## 참고 자료

- [GitHub 공식 문서 - Issue Template 설정](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository)
- [Issue & PR Template 설정 가이드](https://amaran-th.github.io/Github/%5BGithub%5D%20Issue%20&%20PR%20Template%20%EC%84%A4%EC%A0%95%ED%95%98%EA%B8%B0/)

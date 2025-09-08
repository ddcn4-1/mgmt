# GitHub 프로젝트 관리 가이드 (v1)

이 가이드는 우리 팀이 GitHub Projects를 활용해 프로젝트를 체계적으로 관리하기 위해 정리한 문서입니다.  
새 프로젝트를 시작하거나, 스프린트·로드맵·이슈 관리를 GitHub Projects로 해보려는 분들께 도움이 되길 바랍니다.
 
**이 문서에서 다루는 내용:**
- GitHub Projects의 기본 개념
- 우리 팀 깃헙 프로젝트 관리 전략
- 실제 운영 워크플로우와 개선 아이디어

## Part 1: GitHub Projects 기본 개념

### GitHub Projects 버전 비교: v1 vs v2

| 버전 | 특징 | 주요 기능 | 활용 사례 |
| --- | --- | --- | --- |
| **Projects v1** | [레거시] 단순 칸반 보드 형태로 기본적인 작업 관리에 적합 | 기본 칸반 보드 (To do, In Progress, Done), 기본 필터링, 이슈 연결 | 소규모 프로젝트 및 단순 태스크 트래킹 |
| **Projects v2** | 커스텀 필드, 로드맵 뷰, 자동화 기능 등 확장된 기능 제공 | 커스텀 필드 (날짜, 단일 선택, 번호 등), 다양한 뷰 (보드, 표, 로드맵, 간트차트), 자동화 워크플로우, 이슈 그룹화 및 필터링, 이터레이션 관리 | 중대규모 프로젝트, 애자일 스프린트, 복잡한 작업 흐름 관리 |

> **Note:**
> - **Projects v1**은 현재 레거시로 취급되며, 더 이상 선택할 수 없습니다.
> - **Projects v2**는 Jira나 Notion만큼은 아니지만 유사한 프로젝트 관리 경험을 제공하며, 로드맵 뷰로 전체 일정과 진행률을 한눈에 확인할 수 있습니다.
> - **Projects v2**는 사용자·조직 설정에서 웹훅 트리거를 설정할 때, 아래 이미지와 같이 선택 가능한 이벤트 목록을 제공합니다.

<p align="center">
  <img src="https://github.com/user-attachments/assets/57ac032e-29ba-434d-9b51-a0bda6548465" alt="Projects v2 Webhook 이벤트 선택 화면" style="max-width: 80%; height: auto; border-radius: 6px;" />
</p>

### 기본 필드 설명

GitHub Projects에서는 기본적으로 다음과 같은 필드를 제공하여 이슈의 상태를 직관적으로 추적합니다.

- **Status (상태):** 이슈의 현재 진행 상황을 나타냅니다. (예: `Todo`, `In Progress`, `Done`)
- **Sub-issues progress (하위 이슈 진행률):** 부모 이슈에 연결된 하위 이슈들의 완료 상태를 바탕으로 전체 진행률을 시각적으로 보여줍니다. (예: `2/5 40%`)
- 이 외의 필드(Assignee, Labels, Milestone 등)는 기존 리포지토리의 이슈 필드를 그대로 사용합니다.

<p align="center">
  <img src="https://github.com/user-attachments/assets/ff7e3a8c-1af7-45e5-87b3-d8b0dcc14426" alt="기본 필드 예시 화면 1" style="max-width: 50%; height: auto; border-radius: 6px;" />
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/a1f18aec-5e0c-4c66-b9cd-1018bdddfc79" alt="기본 필드 예시 화면 2" style="max-width: 50%; height: auto; border-radius: 6px;" />
</p>

### 이슈 타입 (Issue Type) 개념

이슈의 성격을 명확히 구분하기 위한 분류 체계입니다. 기본적으로 다음과 같은 타입을 제공합니다.
라벨과 달리 개별 리포지토리나 이슈 페이지에서는 추가할 수 없으며, 조직(Organization) 설정에서만 관리할 수 있습니다.

- **Bug:** 잘못된 동작이나 오류 수정이 필요한 경우
- **Task:** 구체적인 할 일이나 작업 단위
- **Feature:** 새로운 기능 개발 또는 기존 기능 변경

> Note: Epic과 Refactor는 조직에서 새롭게 정의해 추가한 커스텀 이슈 타입입니다.
<p align="center">
<img width="685" height="705" alt="image" src="https://github.com/user-attachments/assets/fbfaa353-50fa-4a6a-ba8f-9041c93f4867" style="max-width: 50%; height: auto; border-radius: 6px;" />
</p>


### 마일스톤
- **마일스톤(Milestone)**: 리포지토리 단위에서 설정하는 주요 목표나 중간 점검 기준입니다. 주로 프로젝트의 중요한 분기점(예: MVP 출시, Feature Freeze)을 관리하는 데 활용됩니다.
- 필요 시 직접 생성해야 하며, 기본적으로는 설정되어 있지 않습니다.

<p align="center">
<img width="705" height="350" alt="image" src="https://github.com/user-attachments/assets/a21e4897-bd82-432e-9954-deca38d088f0" style="max-width: 50%; height: auto; border-radius: 6px;"  />
</p>

## Part 2: 깃헙 프로젝트 관리 전략

### 프로젝트 개요

- **목표:** 프로젝트 관리, 코드 버전 관리, CI/CD를 GitHub 플랫폼 하나로 통합하여 운영합니다. 이를 통해 여러 도구를 오가는 번거로움 없이 프로젝트 진행 상황 추적부터 배포까지 연결된 워크플로우를 구축합니다.
- **적용:** 이 문서는 버전 1.0으로, 2025년 8월 28일부터 9월 23일까지 진행되는 클라우드 네이티브 과정 1차 프로젝트에 적용됩니다. 프로젝트 종료 후 회고를 통해 개선점을 도출하여 다음 버전에 반영할 예정입니다.

### 커스텀 필드 정의 (Project Setting)

기본 필드 외에 팀의 특성과 작업 흐름에 맞춰 다음과 같은 커스텀 필드를 정의하여 사용합니다.

| 필드 | 설명 | 예시 | 기본 제공 |
| --- | --- | --- | --- |
| **Status** | 이슈 진행 상태 | Done | Yes |
| **Sub-issues progress** | 서브 이슈 진행율 | 2/5 40% | Yes |
| **Phase** | 프로젝트 단계 (기획, 설계, 구현 등) | Implementation | No |
| **Start Date** | 작업 시작일 | 2025-09-01 | No |
| **Due Date** | 마감 예정일 | 2025-09-12 | No |
| **Iteration** | 스프린트/주차 구분 | Iteration 1 | No |

**필드별 상세 설명:**

- **Status 필드:** 기본값(`Todo` / `In Progress` / `Done`) 외에 `UpNext` 옵션을 추가하여 다음 스프린트에서 진행할 작업을 명확히 구분합니다.
- **Start/Due 필드:** 로드맵 뷰에서 작업 기간을 시각화하여 계획 대비 진행률과 지연 여부를 쉽게 파악할 수 있습니다.
- **Phase 필드:** `Planning` → `Design` → `Implementation` → `Testing` → `Delivery` 단계로 구분하여 각 작업의 현재 위치를 명확히 표시합니다.
- **Iteration 필드:** 로드맵에서 그룹화 기준으로 활용할 수 있으며, 현재는 기간 체크용 보조 지표로 사용하고 있습니다.

### 조직별 이슈 타입

기본 제공 타입(Bug, Task, Feature) 외에 아래 타입을 추가하여 작업 단위를 세분화합니다.

- **Refactor:** 코드 품질 개선 및 구조 변경 작업을 위한 타입
- **Epic:** 여러 Feature와 Task를 포함하는 대규모 작업 단위. Epic을 생성하고 세부 구현은 하위 이슈로 분할하여 관리합니다.

> Note: Epic과 Refactor는 조직에서 새롭게 정의해 추가한 커스텀 이슈 타입입니다.  
> ⚠️ 현재 Epic 외의 이슈들에 대한 타입 할당 기준과 라벨 활용 방식(예: 우선순위, 영역별 분류)에 대해서는 추가 논의가 필요합니다.

### 리포지토리 구조 (mgmt/app 분리 전략)

문서와 코드의 역할을 명확히 분리하여 관리 효율을 높입니다.

| 리포지토리 | 역할 |
| --- | --- |
| **mgmt** | Epic 이슈 관리, GitBook 문서 관리, 프로젝트 종료 시 학습·회고 내용 업로드 |
| **app** | 애플리케이션 코드 개발, 기능 구현 및 변경 관련 이슈 관리 |

**기대 효과:**

- 기록(문서)과 구현(코드)의 이력을 분리하여 관리 용이
- GitBook 배포 시 불필요한 코드가 포함되지 않도록 설계
- 각 리포지토리의 목적이 명확해져 협업 시 충돌 최소화

### 마일스톤 설정

app 리포지토리에서만 운영하며, 로드맵에서 마감일 기준 마커로 표시됩니다.

| 마일스톤 | 설명 |
| --- | --- |
| **MVP** | 최소기능제품 (Minimum Viable Product) 완성 |
| **Feature Freeze** | 기능 개발 완료, 버그 수정만 허용 |
| **Code Freeze** | 코드 변경 제한, 배포 전 QA 집중 |

> 참고: 마일스톤은 리포지토리 단위에서만 설정 가능하므로, 프로젝트 전역 관리가 필요한 경우 커스텀 필드로 별도 정의 필요

### 이슈 분류 규칙 (Prefix 규칙과 예시)

이슈 제목에 Prefix를 사용하여 어떤 종류의 작업인지 쉽게 식별할 수 있도록 합니다.

| 리포지토리 | Prefix | 타입 | 설명 | 브랜치 예시 |
| --- | --- | --- | --- | --- |
| **mgmt** | (없음) | Epic | 프로젝트 전반 단계 관리 | - |
| **mgmt** | `Docs:` | Task | 문서 작성 및 회고 이슈 | `docs/#24` |
| **app** | `Feature:` | Feature | 새로운 기능 추가/변경 | `feat/#42` |
| **app** | `Refactor:` | Refactor | 코드 리팩터링 및 구조 개선 | `refactor/#18` |
| **app** | `BUG:` | Bug | 잘못된 동작 수정 | `fix/#35` |
| **app** | `ERROR:` | Bug | 크래시 등 심각한 문제 해결 | `hotfix/#67` |

**예시: MVP 개발 Epic (Parent Issue & Sub-Issue 구조)**

| 구분 | Prefix | 제목 | Type | 리포지토리 | 담당자 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| **Parent-Issue** | (없음) | MVP 개발 | Epic | mgmt | - | In Progress |
| **Sub-Issues** | `Feature` | JWT 기반 인증 시스템 | Feature | app | GukDaHye | Done |
|  | `Feature` | 공연 CRUD API | Feature | app | yhjune | Done |
|  | `Feature` | 사용자(어드민) CRUD API | Feature | app | Hwara | Done |
|  | `Feature` | 예매(Booking) API CRUD | Feature | app | kimhxsong | Done |
|  | `Feature` | Front 연결 – 공연 API | Feature | app | yhjune | Todo |
|  | `Feature` | AWS 연결 | Feature | app | yhjune | UpNext |
|  | `Feature` | 좌석 잠금 | Feature | app | GukDaHye | Todo |
|  | `Docs` | 스프링부트 예외 처리 유틸 클래스 공유 | Task | mgmt | yhjune | Done |
|  | `Refactor` | folder structure 수정 (계층→도메인) | Refactor | app | GukDaHye, Hwara | Done |
|  | `Docs` | 로그 목록 정리 | Task | mgmt | yhjune | Done |
|  | `Feature` | Spring OpenAPI Generator 도입 | Feature | app | kimhxsong | Done |
|  | `Feature` | Swagger(OpenAPI) 도입 | Feature | app | kimhxsong | Todo |

### 워크플로우

1. **일반적인 개발·문서 작업 흐름:** 체계적인 관리가 필요한 대부분의 작업에 적용됩니다.
    - `Epic` → `Parent Issue` → `Sub-Issue` → `브랜치 생성` → `PR 생성` → `코드 리뷰` → `Merge`
2. **간단·긴급 수정:** 이슈 생성 없이 빠르게 수정 및 반영이 필요할 때 사용됩니다.
    - `브랜치 생성` → `PR 생성` → `바로 Merge`
  
### 프로젝트 대시보드
- **로드맵 뷰**
<p align="center">
  <img src="https://github.com/user-attachments/assets/3f5e5073-7448-4f05-a798-32b6822cdd3a" alt="로드맵 뷰 전체 화면" style="max-width: 85%; height: auto; border-radius: 6px;" />
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/725a1ed0-bce2-484c-bc8f-61414b9513fc" alt="로드맵 뷰 세부 화면" style="max-width: 85%; height: auto; border-radius: 6px;" />
</p>

- **테이블 뷰**

<p align="center">
  <img src="https://github.com/user-attachments/assets/b533fd36-cda4-4130-a0b9-7ce5b7b15839" alt="테이블 뷰 예시 화면" style="max-width: 85%; height: auto; border-radius: 6px;" />
</p>

## Part 3: 운영 및 개선

### 설계 의도

- GitHub Projects를 통해 **Epic-Story-Task 계층 구조**로 프로젝트를 체계적으로 관리합니다.
- 커스텀 필드(Phase, Start/Due Date)로 작업 흐름과 일정을 시각화하여 팀원과 관리자 모두에게 명확한 정보를 제공합니다.
- **Parent-Sub Issue 구조**를 통해 작업 간 관계를 명확히 추적하고, 코드 변경 이력과 연결함으로써 문제 발생 시 원인을 신속하게 파악할 수 있습니다.

### 기대 효과

- 프로젝트, 코드, CI/CD를 한 곳에서 **통합 관리**하여 작업 흐름을 간소화합니다.
- 팀원 간 실시간 진행 상황 공유로 **프로젝트 투명성**을 확보합니다.
- 이슈와 코드 변경 내역을 직접 연결함으로써 **협업 효율성**을 향상시킵니다.

### 향후 개선 아이디어

- **자동화:**
    - 이슈 제목 기반 자동 라벨링 및 Type 설정 자동화
    - PR 생성 시 프로젝트 커스텀 필드 자동 업데이트
- **프로세스 개선:**
    - Notion 회고 관리 → GitHub Discussion으로 이전 시도
- **외부 도구 연동:**
    - Notion 데이터베이스와 GitHub Project를 n8n으로 연동해 양방향 동기화 구현 (예: Notion에서 상태 변경 시 GitHub Status 필드 업데이트, GitHub 이슈 종료 시 Notion DB 자동 반영)

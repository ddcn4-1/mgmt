## 1. CI/CD 개요

코드 커밋 → 빌드 → 테스트 → 정적 분석 → 패키징 → 배포 → 모니터링

**CI (Continuous Integration)**

-   개발자들이 작성한 코드를 정기적으로 통합하는 개발 방법론
-   코드 변경사항을 자동으로 빌드, 테스트하여 문제를 조기 발견
-   여러 개발자가 동시에 작업할 때 발생하는 충돌을 최소화

**CD (Continuous Deployment/Delivery)**

-   **Continuous Delivery**: 배포 가능한 상태로 자동 준비
-   **Continuous Deployment**: 자동으로 프로덕션 환경까지 배포
-   수동 개입을 최소화하여 안정적이고 빠른 배포 실현

### 장점

-   **품질 향상**: 자동화된 테스트로 버그 조기 발견
-   **배포 속도**: 수동 작업 제거로 배포 시간 단축
-   **개발 생산성**: 반복 작업 자동화로 개발에 집중

## 2. Github Actions 선택 Trade-Off

### 구성 요소 비교

Github Actions 공식문서(https://docs.github.com/en/actions/get-started/understand-github-actions)에 있는 요소를 기준으로, 내가 이해하고 있는 선에서 다른 툴들과 비교를 해보았다. 거의 비슷한 구조이고, 다만 어떤 환경에서 작업을 하느냐에 따라 선택 기준이 나뉘는 것 같았다.

| 계층              | GitHub Actions                                             | GitLab CI/CD                                                                  | Jenkins                                                               |
| ----------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **전체 프로세스** | **Workflow**<br/>`.github/workflows/` 디렉토리의 YAML 파일 | **Pipeline**<br/>`.gitlab-ci.yml`로 정의되는 전체 CI/CD 프로세스              | **Pipeline**<br/>Jenkinsfile로 정의되는 워크플로우                    |
| **그룹 단위**     | **Job**<br/>워크플로우 내의 병렬/순차 실행 단위            | **Stage**<br/>순차적으로 실행되는 단계 (build → test → deploy)                | **Stage**<br/>파이프라인 내의 논리적 단계                             |
| **작업 단위**     | **Step**<br/>Job 내의 개별 명령어/액션                     | **Job**<br/>Stage 내에서 실행되는 개별 작업                                   | **Step**<br/>Stage 내의 개별 작업                                     |
| **재사용 요소**   | **Action**<br/>Marketplace의 재사용 가능한 컴포넌트        | **Include/Extends**<br/>템플릿과 상속을 통한 재사용                           | **Shared Library**<br/>Groovy 기반 공유 라이브러리                    |
| **실행 환경**     | **Runner**<br/>GitHub 호스팅 또는 셀프 호스팅              | **Runner**<br/>GitLab 호스팅 또는 자체 Runner                                 | **Agent/Node**<br/>Master-Agent 구조                                  |
| **작업 공간**     | **Job별 완전 격리**<br>(새 VM/Container)                   | **Job별 선택적 격리**<br>(Runner 설정에 따라)                                 | **Workspace**<br/>Agent의 지정된 작업 디렉토리                        |
| **트리거**        | **Event**<br>push, pull_request, schedule 등               | **Rules/Only/Except**<br/>브랜치, 태그, 스케줄 조건<br/>(rules, only, except) | **Trigger**<br/>SCM polling, 웹훅, 스케줄러<br/>(Build Triggers 설정) |

**GitHub Actions 추천 상황:**

-   GitHub를 주 저장소로 사용하는 경우
-   클라우드 환경 위주의 개발
-   빠른 시작과 간단한 설정이 필요한 경우

**GitLab CI/CD 추천 상황:**

-   GitLab을 사용하는 경우
-   통합된 DevOps 플랫폼이 필요한 경우
-   복잡한 파이프라인과 고급 기능이 필요한 경우
-   온프레미스와 클라우드 하이브리드 환경

**Jenkins 추천 상황:**

-   복잡한 엔터프라이즈 환경
-   기존 Jenkins 인프라가 있는 경우
-   높은 커스터마이징이 필요한 경우
-   다양한 도구와의 연동이 필요한 경우

### 선택 기준

우리 상황에서는 Github Actions이 가장 적합해 보였다.

-   빠르게 배포하고, 복잡할 것이 없는 프론트/백 어플리케이션인 상황
-   Github가 주 저장소
-   로컬에서 개발이 끝나면 클라우드로 이전하여 인프라 작업을 이어갈 예정이기 때문에, 온프레미스와는 연관이 없음

위 기준으로 3가지 툴을 비교해보았을 때,

| 차원             | GitHub Actions          | GitLab CI/CD       | Jenkins         |
| ---------------- | ----------------------- | ------------------ | --------------- |
| **시작 용이성**  | 쉬움                    | 보통               | 어려움          |
| **운영 복잡성**  | 낮음                    | 보통               | 높음            |
| **커스터마이징** | 제한적                  | 높음               | 높음            |
| **벤더 종속성**  | 높음                    | 중간               | 낮음            |
| **확장성**       | 중간                    | 다양한 Runner 옵션 | 1,900+ 플러그인 |
| **비용 예측성**  | public repo일 경우 무료 | 복합적             | 예측 가능       |

## 3. 테스트 배포

본격적으로 프론트/백엔드 개발 레포지토리 적용하기 전에, 문서 폴더인 mgmt에서 테스트로 Github Actions를 연결하여 테스트해보기로 했다.

테스트 순서는 CI 를 우선 테스트 -> 배포 -> CD 테스트

### CI 테스트

현재 mgmt 환경과 작업 플로우는 다음과 같다.

```
HonKit(오픈 소스 깃북)
- mermaid 다이어그램 렌더링 포함 설치

1. (로컬) 설명 및 조사 관련 문서를 마크다운으로 추가
2. (로컬) 문서 제목을 SUMMARY.MD에 추가
3. (GitHub) 메인 브랜치에 머지
4. (로컬) 로컬로 pull 후 http://localhost:4000 에서 문서 확인
```

변경 예상 플로우는

```
1. (로컬) 설명 및 조사 관련 문서를 마크다운으로 추가
2. (GitHub Actions) 새로 추가된 문서를 감지
3. (GitHub Actions) 제목이 SUMMARY.md에 없으면 자동으로 추가
4. (GitHub Actions) HonKit으로 문서 빌드
5. (GitHub Actions) 빌드된 결과물을 메인 브랜치 혹은 배포 브랜치로 push
6. (로컬) http://localhost:4000 에서 문서 확인
```

#### GitHub Actions 설정

[honkit](https://github.com/honkit/honkit?tab=readme-ov-file)의 공식 문서에 보면, Github Action을 붙인 사례들이 나와있다. Marketplace에도 몇가지 action이 있긴 하지만, 크게 사용해본 사람도 없는 것 같아서 아래 사례를 보고 테스트용 빌드를 직접 붙였다. 사례가 조금 옛날 버전이라, checkout과 Node.js 버전만 honkit에서 요구하는 대로 최신 버전을 넣었다.

-   [Add a Github action to deploy · DjangoGirls/tutorial](https://github.com/DjangoGirls/tutorial/pull/1666)

```
name: Build
on:
    pull_request:
    push: #for test in feat/#32. todo: delete

jobs:
    build:
        runs-on: ubuntu-latest
        steps:
            - name: Checkout
              uses: actions/checkout@v4

            - name: Setup Node.js
              uses: actions/setup-node@v3
              with:
                  node-version: 'lts/*'
                  cache: 'npm'

            - name: Install and Build
              run: |
                  npm install
                  npx honkit build
```

**이 경우 미리 설정되어 있어야 하는 것들:**

1. `package.json`에 honkit 의존성이 있어야 함
2. `book.json`이 이미 있어야 함
3. `SUMMARY.md`가 수동으로 관리되어야 함

![actions](./image/Pasted%20image%2020250916111321.png)

첫번째가 노드 버전이 맞지 않아서 빌드가 실패한 것이고, 수정 후에는 잘 되는 것을 볼 수 있다.

#### Auto Summary 기능 추가 Only Github Actions

> (GitHub Actions) 제목이 SUMMARY.md에 없으면 자동으로 추가

매번 문서를 추가한 후 SUMMARY에 나오게 하는 것이 반복 작업이기 때문에, 자동으로 SUMMARY에 추가되도록 변경해주고 싶었다. 방법은 2가지로, GitHub Actions에 직접 스크립트를 넣어주거나, node.js script를 프로젝트에 넣어주는 것이다.

파일을 수정한 뒤 푸시를 다시 해주는 것이라서, 쓰기 권한을 허용해주기 위해 토큰이 필요한데, `GITHUB_TOKEN`은 GitHub Actions에서 **자동으로 제공되는 토큰**이기 때문에 따로 토큰 발행 작업은 필요 없었다.
https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#using-secrets-in-a-workflow

먼저 Github Actions로만 추가해 보았다.

```
name: Update SUMMARY.md

on:
  push:
    branches: [main, 'feat/#32']
    paths: ['**/*.md', '!SUMMARY.md']

jobs:
  update-summary:
    runs-on: ubuntu-latest

    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js LTS
        uses: actions/setup-node@v3
        with:
          node-version: 'lts/*'

      - name: Create update script
        run: |
          mkdir -p scripts
          cat > scripts/update-summary.js << 'EOF'
          const fs = require('fs').promises;
          const path = require('path');

          class SummaryUpdater {
            constructor() {
              this.excludeFiles = new Set(['README.md', 'SUMMARY.md']);
              this.excludeDirs = new Set(['.git', 'node_modules', '_book', '.github', 'scripts']);
            }

            async findMarkdownFiles() {
              console.log('Finding all markdown files...');
              const files = [];

              const scanDirectory = async (dir) => {
                try {
                  const items = await fs.readdir(dir, { withFileTypes: true });

                  for (const item of items) {
                    const fullPath = path.join(dir, item.name);

                    if (item.isDirectory()) {
                      if (!this.excludeDirs.has(item.name) && !item.name.startsWith('.')) {
                        await scanDirectory(fullPath);
                      }
                    } else if (item.name.endsWith('.md') && !this.excludeFiles.has(item.name)) {
                      const relativePath = path.relative('.', fullPath);
                      files.push(relativePath);
                    }
                  }
                } catch (error) {
                  console.warn(`Warning: Could not scan directory ${dir}: ${error.message}`);
                }
              };

              await scanDirectory('.');
              return files.sort();
            }

            async extractTitle(filePath) {
              try {
                const content = await fs.readFile(filePath, 'utf8');
                const titleMatch = content.match(/^#\s+(.+)$/m);

                if (titleMatch) {
                  return titleMatch[1].trim();
                }
              } catch (error) {
                console.warn(`Warning: Could not read ${filePath}: ${error.message}`);
              }

              return path.basename(filePath, '.md')
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());
            }

            async getExistingFiles() {
              try {
                const summaryExists = await fs.access('SUMMARY.md').then(() => true).catch(() => false);
                if (!summaryExists) {
                  return new Set();
                }

                const content = await fs.readFile('SUMMARY.md', 'utf8');
                const existing = new Set();
                const linkPattern = /\[.*?\]\(([^)]+\.md)\)/g;

                let match;
                while ((match = linkPattern.exec(content)) !== null) {
                  existing.add(match[1]);
                }

                return existing;
              } catch (error) {
                console.warn(`Warning: Could not read SUMMARY.md: ${error.message}`);
                return new Set();
              }
            }

            categorizeFiles(files) {
              const categories = new Map();

              for (const filePath of files) {
                const dirName = path.dirname(filePath);
                let categoryName;

                if (dirName === '.' || dirName === '') {
                  categoryName = 'Main Documents';
                } else {
                  const firstDir = dirName.split('/')[0];
                  categoryName = firstDir.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                }

                if (!categories.has(categoryName)) {
                  categories.set(categoryName, []);
                }
                categories.get(categoryName).push(filePath);
              }

              return categories;
            }

            async updateSummary() {
              try {
                const allFiles = await this.findMarkdownFiles();
                const existingFiles = await this.getExistingFiles();
                const newFiles = allFiles.filter(file => !existingFiles.has(file));

                console.log(`Found ${allFiles.length} total files`);
                console.log(`Already in SUMMARY.md: ${existingFiles.size} files`);
                console.log(`New files to add: ${newFiles.length} files`);

                if (newFiles.length === 0) {
                  console.log('No new files to add to SUMMARY.md');
                  return false;
                }

                console.log('\nNew files found:');
                newFiles.forEach(file => console.log(`  + ${file}`));

                let summaryLines = [];
                try {
                  const summaryContent = await fs.readFile('SUMMARY.md', 'utf8');
                  summaryLines = summaryContent.split('\n');
                } catch (error) {
                  summaryLines = [
                    '# Summary',
                    '',
                    '* [Introduction](README.md)',
                    ''
                  ];
                }

                if (summaryLines.length > 0 && summaryLines[summaryLines.length - 1] !== '') {
                  summaryLines.push('');
                }

                const categories = this.categorizeFiles(newFiles);

                for (const [categoryName, files] of Array.from(categories.entries()).sort()) {
                  summaryLines.push(`## ${categoryName}`);
                  summaryLines.push('');

                  for (const filePath of files) {
                    const title = await this.extractTitle(filePath);
                    summaryLines.push(`* [${title}](${filePath})`);
                  }
                  summaryLines.push('');
                }

                await fs.writeFile('SUMMARY.md', summaryLines.join('\n'), 'utf8');
                console.log(`SUMMARY.md updated with ${newFiles.length} new files`);
                return true;

              } catch (error) {
                console.error(`Error updating SUMMARY.md: ${error.message}`);
                throw error;
              }
            }
          }

          if (require.main === module) {
            const updater = new SummaryUpdater();

            updater.updateSummary()
              .then(updated => {
                process.exit(0);
              })
              .catch(error => {
                console.error('Failed to update SUMMARY.md:', error);
                process.exit(1);
              });
          }

          module.exports = SummaryUpdater;
          EOF

      - name: Update SUMMARY.md
        run: npm run docs:update-summary

      - name: Commit updated SUMMARY.md
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"

          if ! git diff --quiet SUMMARY.md; then
            echo "SUMMARY.md has been updated, committing..."
            git add SUMMARY.md
            git commit -m "docs: Auto-update SUMMARY.md with new documents [skip ci]"
            git push
          else
            echo "No changes in SUMMARY.md"
          fi
```

![summary](./image/Pasted%20image%2020250916113900.png)

1. 푸시할 때마다 두 워크플로우 실행
2. Update SUMMARY.md 워크플로우가 새 파일들을 감지하고 SUMMARY.md 업데이트
3. Build 워크플로우가 업데이트된 SUMMARY.md로 HonKit 빌드

![summary2](./image/Pasted%20image%2020250916115142.png)

#### auto summary 기능을 Actions에서 분리하여 Node.js script 로

파이썬 코드가 yaml 안에서 함께 동작하고 있어서, 가독성이 별로였다. 그래서 스크립트를 생성하여 따로 분리를 해주었다. `script/update-summary.js`로 로직을 분리하고, package-json에 `"docs:update-summary": "node scripts/update-summary.js"` 를 추가해주면 된다. 그러면 actions가 이렇게 깔끔해진다.

```
name: Update SUMMARY.md

on:
    push:
        branches: [main, 'feat/#32']
        paths: ['**/*.md', '!SUMMARY.md']

jobs:
    update-summary:
        runs-on: ubuntu-latest

        permissions:
            contents: write

        steps:
            - name: Checkout
              uses: actions/checkout@v4
              with:
                  token: ${{ secrets.GITHUB_TOKEN }}

            - name: Setup Node.js LTS
              uses: actions/setup-node@v3
              with:
                  node-version: 'lts/*'

            - name: Update SUMMARY.md
              run: npm run docs:update-summary

            - name: Commit updated SUMMARY.md
              run: |
                  git config --local user.email "action@github.com"
                  git config --local user.name "GitHub Action"

                  if ! git diff --quiet SUMMARY.md; then
                    echo "SUMMARY.md has been updated, committing..."
                    git add SUMMARY.md
                    git commit -m "docs: Auto-update SUMMARY.md with new documents [skip ci]"
                    git push
                  else
                    echo "No changes in SUMMARY.md"
                  fi
```

![bug](./image/Pasted%20image%2020250916115844.png)
스크립트를 저장을 안해서 커밋에 포함이 안되어 있었던 바보같은일...

![well](./image/Pasted%20image%2020250916121000.png)
잘 작동한다.

### 배포

어떤 호스팅 툴로 배포를 할지 고민이 있었다.

-   한 번 배포 하고 나서는 따로 신경을 쓸 필요가 없어야한다(유지보수 X)
-   mgmt는 문서 확인용으로 사용할 것이어서, 복잡한 기능이 없다.
-   단순 정적인 사이트다.
-   금액적으로 무료면 가장 좋다.

**비교**

| 방식                        | 비용          | 설정 복잡도      | 유지보수  | URL 형태                              | 빌드 속도 | 기타 제한사항            |
| --------------------------- | ------------- | ---------------- | --------- | ------------------------------------- | --------- | ------------------------ |
| **pr-preview-action**       | 완전 무료     | GitHub 네이티브  | 자동      | `*.github.io/repo/pr-preview/pr-X/`   | 보통      | GitHub Actions 시간 제한 |
| **GitHub Pages + Surge.sh** | 완전 무료     | 워크 플로우 필요 | 토큰 관리 | `mgmt-pr-X.surge.sh`                  | 빠름      | 토큰 만료 관리 필요      |
| **Netlify**                 | 300분 빌드/월 | 자동 연동        | 자동      | `deploy-preview-X--app.netlify.app`   | 빠름      |                          |
| **Vercel**                  | 100GB/월      | 자동 연동        | 자동      | `mgmt-git-branch-username.vercel.app` | 빠름      |                          |

처음에는 Surge.sh를 붙이는 것이 가장 좋을 것 같았다. 무료 버전에서도 커스텀 도메인이 가능했고, pr preivew도 지원해주기 때문이다. 단 토큰 관리를 해줘야 한다는 점에서 신경을 조금 써줘야 하는 것이 걸렸다.

혹시나 싶어서 marketplace를 찾아보니 Github Actions로 pr-preview를 지원해주는 네이티브 도구가 있어서, 이 녀석을 우선 도입하고, 커스텀 도메인이 필요해지면 surge.sh를 사용하는 방향으로 생각했다.

### CD 테스트

CI로 빌드된 결과물을 정적 호스팅 가능한 클라우드 환경에 자동 배포한다.  
초기 테스트 환경은 다음과 같다.

-   **호스팅 서비스**: GitHub Pages
-   **배포 대상**: HonKit으로 빌드된 `_book/` 디렉토리
-   **배포 조건**: `pg-pages` 브랜치에 변경 사항이 머지되면 자동으로 배포

현재:

```
1. GitHub Actions가 문서를 감지하고 빌드 수행
2. 빌드된 결과물(_book/)을 배포 브랜치(pg-pages)로 push
3. prd-book 브랜치에 push되면 GitHub Pages를 통해 자동 반영
```

이후:

```
1. 새로운 문서 파일 (예: test-doc.md)을 추가하고 PR 생성
2. GitHub Actions 로그를 통해 SUMMARY.md 자동 갱신 확인
3. HonKit 빌드 결과물 확인
4. prd-book 브랜치의 변경 내역 확인
5. 실제 배포 URL에서 문서 확인 (예: https://사용자명.github.io/레포명)
```

각 기능마다 파일을 다르게 해서 가독성이 좋게 만들었다.

```
name: Build
on:
    pull_request:
        paths: ['**/*.md', 'book.json', 'package.json']

jobs:
    build:
        runs-on: ubuntu-latest
        steps:
            - name: Checkout
              uses: actions/checkout@v4

            - name: Setup Node.js
              uses: actions/setup-node@v3
              with:
                  node-version: 'lts/*'
                  cache: 'npm'

            - name: Install and Build
              run: |
                  npm install
                  npx honkit build

```

```
name: Deploy Main Documentation

on:
    push:
        branches: [main]
        paths: ['**/*.md', 'book.json', 'package.json', 'SUMMARY.md']
    workflow_run:
        workflows: ['Update SUMMARY.md']
        types: [completed]
        branches: [main]

jobs:
    deploy-main:
        runs-on: ubuntu-latest

        permissions:
            contents: write
            pages: write
            id-token: write

        steps:
            - name: Checkout
              uses: actions/checkout@v4

            - name: Setup Node.js
              uses: actions/setup-node@v3
              with:
                  node-version: 'lts/*'
                  cache: 'npm'

            - name: Build documentation
              run: |
                  npm install
                  npx honkit build

            - name: Deploy to GitHub Pages
              uses: peaceiris/actions-gh-pages@v4
              with:
                  github_token: ${{ secrets.GITHUB_TOKEN }}
                  publish_dir: ./_book
                  commit_message: 'Deploy: ${{ github.sha }}'
```

```
name: Update SUMMARY.md

on:
    push:
        branches: [main]
        paths: ['**/*.md', '!SUMMARY.md']

jobs:
    update-summary:
        runs-on: ubuntu-latest

        permissions:
            contents: write

        steps:
            - name: Checkout
              uses: actions/checkout@v4
              with:
                  token: ${{ secrets.GITHUB_TOKEN }}

            - name: Setup Node.js LTS
              uses: actions/setup-node@v3
              with:
                  node-version: 'lts/*'
                  cache: 'npm'

            - name: Update SUMMARY.md
              run: npm run docs:update-summary

            - name: Commit updated SUMMARY.md
              run: |
                  git config --local user.email "action@github.com"
                  git config --local user.name "GitHub Action"

                  if ! git diff --quiet SUMMARY.md; then
                    echo "SUMMARY.md has been updated, committing..."
                    git add SUMMARY.md
                    git commit -m "docs: Auto-update SUMMARY.md with new documents [skip ci]"
                    git push
                  else
                    echo "No changes in SUMMARY.md"
                  fi

```

![cd](./image/Pasted%20image%2020250916152459.png)

## 앞으로 수정할 부분

-   PR 생성 시 빌드 미리보기(preview) 링크를 자동으로 PR 코멘트에 추가
-   EC2, Docker를 추가한 배포

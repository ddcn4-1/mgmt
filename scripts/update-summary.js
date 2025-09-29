const fs = require('fs').promises;
const path = require('path');

class SummaryUpdater {
    constructor() {
        this.excludeFiles = new Set(['README.md', 'SUMMARY.md']);
        this.excludeDirs = new Set([
            '.git',
            'node_modules',
            '_book',
            '.github',
            'scripts',
        ]);
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
                        if (
                            !this.excludeDirs.has(item.name) &&
                            !item.name.startsWith('.')
                        ) {
                            await scanDirectory(fullPath);
                        }
                    } else if (
                        item.name.endsWith('.md') &&
                        !this.excludeFiles.has(item.name)
                    ) {
                        const relativePath = path.relative('.', fullPath);
                        files.push(relativePath);
                    }
                }
            } catch (error) {
                console.warn(
                    `Warning: Could not scan directory ${dir}: ${error.message}`
                );
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
            console.warn(
                `Warning: Could not read ${filePath}: ${error.message}`
            );
        }

        // 파일명을 제목으로 사용
        return path
            .basename(filePath, '.md')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase());
    }

    async getStaticContent() {
        try {
            const summaryExists = await fs
                .access('SUMMARY.md')
                .then(() => true)
                .catch(() => false);

            if (!summaryExists) {
                return {
                    staticContent: ['# Summary', ''],
                };
            }

            const content = await fs.readFile('SUMMARY.md', 'utf8');
            const lines = content.split('\n');
            const staticContent = [];

            // "## 숫자 폴더명" 패턴이 나오기 전까지는 모두 정적 콘텐츠로 간주
            for (const line of lines) {
                if (line.match(/^## \d{2}\s+/)) {
                    break; // 동적 섹션 시작점에서 중단
                }

                // 파일 링크가 있는 라인인지 확인 (더 포괄적인 패턴)
                const linkMatches = [
                    ...line.matchAll(/\[.*?\]\(([^)]+\.md)\)/g),
                ];

                if (linkMatches.length > 0) {
                    // 이 라인의 모든 파일 링크들을 확인
                    let shouldIncludeLine = true;

                    for (const match of linkMatches) {
                        const filePath = match[1];
                        try {
                            await fs.access(filePath);
                            // 파일이 존재함
                        } catch (error) {
                            // 파일이 존재하지 않음
                            console.log(
                                `Removing line with deleted file: ${filePath}`
                            );
                            shouldIncludeLine = false;
                            break;
                        }
                    }

                    if (shouldIncludeLine) {
                        staticContent.push(line);
                    }
                } else {
                    // 파일 링크가 아닌 라인은 그대로 추가
                    staticContent.push(line);
                }
            }

            // 연속된 빈 줄들 정리 (2개 이상의 연속 빈 줄을 1개로)
            const cleanedContent = [];
            let prevLineEmpty = false;

            for (const line of staticContent) {
                if (line.trim() === '') {
                    if (!prevLineEmpty) {
                        cleanedContent.push(line);
                    }
                    prevLineEmpty = true;
                } else {
                    cleanedContent.push(line);
                    prevLineEmpty = false;
                }
            }

            // 마지막 빈 줄들 정리
            while (
                cleanedContent.length > 0 &&
                cleanedContent[cleanedContent.length - 1] === ''
            ) {
                cleanedContent.pop();
            }

            return { staticContent: cleanedContent };
        } catch (error) {
            console.warn(
                `Warning: Could not read SUMMARY.md: ${error.message}`
            );
            return {
                staticContent: ['# Summary', ''],
            };
        }
    }

    categorizeFilesByFolder(files) {
        const categories = new Map();

        for (const filePath of files) {
            const dirName = path.dirname(filePath);

            if (dirName === '.' || dirName === '') {
                // 루트 레벨 파일은 제외 (보통 README.md만 있음)
                continue;
            }

            const firstDir = dirName.split('/')[0];

            if (!categories.has(firstDir)) {
                categories.set(firstDir, []);
            }
            categories.get(firstDir).push(filePath);
        }

        // 각 카테고리 내에서 파일 정렬
        for (const [category, fileList] of categories) {
            fileList.sort();
        }

        return categories;
    }

    formatCategoryName(folderName) {
        // 폴더명을 보기 좋은 제목으로 변환
        return folderName
            .replace(/^\d{2}-/, '') // 앞의 숫자- 제거
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase());
    }

    async updateSummary() {
        try {
            console.log('Rebuilding SUMMARY.md...');

            const allFiles = await this.findMarkdownFiles();
            console.log(`Found ${allFiles.length} markdown files`);

            // 정적 콘텐츠 가져오기
            const { staticContent } = await this.getStaticContent();

            // 새로운 SUMMARY 구성
            const summaryLines = [...staticContent];
            if (
                staticContent.length > 0 &&
                staticContent[staticContent.length - 1] !== ''
            ) {
                summaryLines.push('');
            }

            // 파일들을 폴더별로 분류
            const categories = this.categorizeFilesByFolder(allFiles);

            // 폴더 순서대로 정렬 (숫자 접두사 고려)
            const sortedCategories = Array.from(categories.entries()).sort(
                ([a], [b]) => {
                    const aNum = a.match(/^(\d+)/);
                    const bNum = b.match(/^(\d+)/);

                    if (aNum && bNum) {
                        return parseInt(aNum[1]) - parseInt(bNum[1]);
                    }
                    return a.localeCompare(b);
                }
            );

            // 각 폴더별로 섹션 생성
            for (const [folderName, files] of sortedCategories) {
                const categoryTitle = this.formatCategoryName(folderName);
                summaryLines.push(`## ${categoryTitle}`);
                summaryLines.push('');

                for (const filePath of files) {
                    const title = await this.extractTitle(filePath);
                    summaryLines.push(`* [${title}](${filePath})`);
                }
                summaryLines.push('');
            }

            // 마지막 빈 줄 제거
            while (
                summaryLines.length > 0 &&
                summaryLines[summaryLines.length - 1] === ''
            ) {
                summaryLines.pop();
            }

            // SUMMARY.md 쓰기
            await fs.writeFile(
                'SUMMARY.md',
                summaryLines.join('\n') + '\n',
                'utf8'
            );
            console.log('SUMMARY.md has been completely rebuilt');
            return true;
        } catch (error) {
            console.error(`Error updating SUMMARY.md: ${error.message}`);
            throw error;
        }
    }
}

// CLI 실행
if (require.main === module) {
    const updater = new SummaryUpdater();

    updater
        .updateSummary()
        .then((updated) => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('Failed to update SUMMARY.md:', error);
            process.exit(1);
        });
}

module.exports = SummaryUpdater;

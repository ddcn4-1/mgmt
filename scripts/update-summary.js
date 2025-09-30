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

    categorizeFilesByFolder(files) {
        const categories = new Map();

        for (const filePath of files) {
            const dirName = path.dirname(filePath);

            if (dirName === '.' || dirName === '') {
                // 루트 레벨 파일은 제외
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
            console.log('Rebuilding SUMMARY.md from scratch...');

            const allFiles = await this.findMarkdownFiles();
            console.log(`Found ${allFiles.length} markdown files`);

            // SUMMARY.md를 처음부터 새로 구성
            const summaryLines = ['# Summary', '', '- [소개](README.md)', ''];

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

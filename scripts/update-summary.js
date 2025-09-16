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

    async getExistingFiles() {
        try {
            const summaryExists = await fs
                .access('SUMMARY.md')
                .then(() => true)
                .catch(() => false);
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
            console.warn(
                `Warning: Could not read SUMMARY.md: ${error.message}`
            );
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
                categoryName = firstDir
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase());
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
            const newFiles = allFiles.filter(
                (file) => !existingFiles.has(file)
            );

            console.log(`Found ${allFiles.length} total files`);
            console.log(`Already in SUMMARY.md: ${existingFiles.size} files`);
            console.log(`New files to add: ${newFiles.length} files`);

            if (newFiles.length === 0) {
                console.log('No new files to add to SUMMARY.md');
                return false;
            }

            console.log('\nNew files found:');
            newFiles.forEach((file) => console.log(`  + ${file}`));

            // 기존 SUMMARY.md 읽기
            let summaryLines = [];
            try {
                const summaryContent = await fs.readFile('SUMMARY.md', 'utf8');
                summaryLines = summaryContent.split('\n');
            } catch (error) {
                // SUMMARY.md가 없으면 기본 구조 생성
                summaryLines = [
                    '# Summary',
                    '',
                    '* [Introduction](README.md)',
                    '',
                ];
            }

            // 마지막 줄이 빈 줄이 아니면 추가
            if (
                summaryLines.length > 0 &&
                summaryLines[summaryLines.length - 1] !== ''
            ) {
                summaryLines.push('');
            }

            // 새 파일들을 카테고리별로 추가
            const categories = this.categorizeFiles(newFiles);

            for (const [categoryName, files] of Array.from(
                categories.entries()
            ).sort()) {
                summaryLines.push(`## ${categoryName}`);
                summaryLines.push('');

                for (const filePath of files) {
                    const title = await this.extractTitle(filePath);
                    summaryLines.push(`* [${title}](${filePath})`);
                }
                summaryLines.push('');
            }

            // SUMMARY.md 쓰기
            await fs.writeFile('SUMMARY.md', summaryLines.join('\n'), 'utf8');
            console.log(`SUMMARY.md updated with ${newFiles.length} new files`);
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

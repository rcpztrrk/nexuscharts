import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const extractExportEntries = (source, modulePath) => {
    const fromToken = `} from "${modulePath}";`;
    const blockEnd = source.indexOf(fromToken);
    if (blockEnd < 0) {
        throw new Error(`Could not find export block for ${modulePath}.`);
    }

    const blockStart = source.lastIndexOf('export {', blockEnd);
    if (blockStart < 0) {
        throw new Error(`Could not find export block start for ${modulePath}.`);
    }

    return source.slice(blockStart + 'export {'.length, blockEnd)
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/,$/, ''))
        .filter(Boolean);
};

const main = async () => {
    const [sourceIndex, publicIndex] = await Promise.all([
        readFile(path.join(rootDir, 'ts-src', 'index.ts'), 'utf8'),
        readFile(path.join(rootDir, 'build', 'public-types', 'index.d.ts'), 'utf8'),
    ]);

    const expected = extractExportEntries(sourceIndex, './core/data/DataAdapter');
    const actual = new Set(extractExportEntries(publicIndex, './DataAdapter'));
    const missing = expected.filter((entry) => !actual.has(entry));

    if (missing.length > 0) {
        throw new Error(`Public type declarations are missing DataAdapter exports: ${missing.join(', ')}`);
    }

    console.log(`[nexuscharts] Public type declarations include ${expected.length} DataAdapter exports.`);
};

main().catch((error) => {
    console.error('[nexuscharts] Public type declaration check failed.');
    console.error(error);
    process.exitCode = 1;
});

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const internalTypesDir = path.join(rootDir, 'build', 'types');
const publicTypesDir = path.join(rootDir, 'build', 'public-types');

const filterPrivateMembers = (source) => source
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('private '))
    .join('\n');

const main = async () => {
    const [typesSource, chartSource] = await Promise.all([
        readFile(path.join(internalTypesDir, 'types.d.ts'), 'utf8'),
        readFile(path.join(internalTypesDir, 'core', 'NexusCharts.d.ts'), 'utf8'),
    ]);

    const publicTypes = typesSource.replace('./core/NexusCharts', './NexusCharts');
    const publicChart = filterPrivateMembers(
        chartSource.replace('../types', './types')
    ).trimEnd() + '\n';

    await mkdir(publicTypesDir, { recursive: true });
    await Promise.all([
        writeFile(
            path.join(publicTypesDir, 'index.d.ts'),
            'export * from "./types";\nexport { NexusCharts } from "./NexusCharts";\n',
            'utf8'
        ),
        writeFile(path.join(publicTypesDir, 'types.d.ts'), publicTypes, 'utf8'),
        writeFile(path.join(publicTypesDir, 'NexusCharts.d.ts'), publicChart, 'utf8'),
    ]);
};

main().catch((error) => {
    console.error('[nexuscharts] Failed to prepare public type declarations.');
    console.error(error);
    process.exitCode = 1;
});

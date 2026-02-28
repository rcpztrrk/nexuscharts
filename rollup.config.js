import typescript from '@rollup/plugin-typescript';

export default {
    input: 'ts-src/index.ts',
    output: [
        {
            file: 'build/nexus-charts.cjs.js',
            format: 'cjs',
        },
        {
            file: 'build/nexus-charts.esm.js',
            format: 'es',
        },
        {
            name: 'NexusCharts',
            file: 'build/nexus-charts.umd.js',
            format: 'umd',
        },
    ],
    plugins: [typescript()]
};

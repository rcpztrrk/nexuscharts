import typescript from '@rollup/plugin-typescript';

export default [
    {
        input: 'ts-src/index.ts',
        output: [
            {
                file: 'build/nexus-charts.cjs',
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
    },
    {
        input: 'ts-src/index.ts',
        output: {
            file: 'public/nexus-charts.esm.js',
            format: 'es',
        },
        plugins: [typescript({
            tsconfig: './tsconfig.public.json'
        })]
    }
];

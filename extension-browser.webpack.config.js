'use strict'

const path = require('path')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const { ProvidePlugin } = require('webpack')

module.exports = {
    entry: {
        extension: './src/extension.ts'
    },
    mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
    target: 'webworker', // extensions run in a webworker context
    resolve: {
        mainFields: ['browser', 'module', 'main'],
        extensions: ['.ts', '.js'], // support ts-files and js-files
        fallback: {
            'fs': false, // do not include a polyfill,
            'assert': false,
            'unxhr': false,
            'glob': false,
            'http': false,
            'https': false,
            'url': false,
            'zlib': false,
            'os': require.resolve('os-browserify/browser'),
            'child_process': false,
            'crypto': false,
            'stream': false,
            'path': require.resolve('path-browserify'),
            'util': require.resolve('util'),
            'querystring': require.resolve('querystring'),
            'tty': require.resolve('tty-browserify'),
            'worker_threads': require.resolve('worker-thread')
        }
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            use: [{
                // configure TypeScript loader:
                // * enable sources maps for end-to-end source maps
                loader: 'ts-loader',
                options: {
                    compilerOptions: {
                        'sourceMap': true,
                    },
                    configFile: 'tsconfig.browser.json'
                }
            }]
        }]
    },
    externals: {
        'vscode': 'commonjs vscode', // ignored because it doesn't exist,
        'applicationinsights-native-metrics': 'commonjs applicationinsights-native-metrics', // ignored because we don't ship native module
        '@opentelemetry/tracing': 'commonjs @opentelemetry/tracing' // ignored because we don't ship this module
    },
    performance: {
        hints: false
    },
    output: {
        // all output goes into `dist`.
        // packaging depends on that and this must always be like it
        filename: '[name].js',
        path: path.join(__dirname, 'dist', 'browser'),
        libraryTarget: 'commonjs',
    },
    amd: false, // disable amd
    // yes, really source maps
    devtool: 'nosources-source-map',
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'src',
                    to: '.',
                    globOptions: { ignore: ['**/test/**', '**/*.ts'] },
                    noErrorOnMissing: true
                }
            ]
        }),
        new ProvidePlugin({
            process: 'process/browser' // provide a shim for the global `process` variable
        })
    ]
}

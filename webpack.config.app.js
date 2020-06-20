/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');

module.exports = {
  
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded.
    'asciidoctor-opal-runtime': 'asciidoctor-opal-runtime',
    '@asciidoctor/core': '@asciidoctor/core',
    '@asciidoctor/docbook-converter': '@asciidoctor/docbook-converter',
    'balanced-match': 'balanced-match',
    'brace-expansion': 'brace-expansion',
    'concat-map': 'concat-map',
    'docbook': '@asciidoctor/docbook-converter',
    'fs.realpath': 'fs.realpath',
    'inflight': 'inflight',
    'inherits': 'inherits',
    'minimatch': 'minimatch',
    'once': 'once',
    'path-is-absolute': 'path-is-absolute',
    'unxhr': 'unxhr',
    'wrappy': 'wrappy'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  node: {
    __dirname: false,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
};
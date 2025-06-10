//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');

/** @type {import('webpack').Configuration} */
const config = {
  target: 'node',
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode',
    // Add other node modules that should not be bundled
    'vm2': 'commonjs vm2'
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'],
    extensions: ['.ts', '.js'],
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@api': path.resolve(__dirname, 'src/api'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@integrations': path.resolve(__dirname, 'src/integrations'),
      '@types': path.resolve(__dirname, 'src/shared/types'),
      '@utils': path.resolve(__dirname, 'src/shared/utils'),
      '@constants': path.resolve(__dirname, 'src/shared/constants'),
      '@config': path.resolve(__dirname, 'src/shared/config')
    },
    fallback: {
      // Provide polyfills for node modules used in the browser
      "util": require.resolve("util/"),
      "path": require.resolve("path-browserify"),
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer/")
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                "module": "es6"
              }
            }
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/
    })
  ],
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'async',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          priority: 10,
          reuseExistingChunk: true
        }
      }
    }
  }
};

module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    config.devtool = 'source-map';
    config.optimization.minimize = false;
  }

  if (argv.mode === 'production') {
    config.devtool = false;
  }

  return config;
};
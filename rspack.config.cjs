const { ModuleFederationPlugin } = require('@module-federation/enhanced/rspack');
const rspack = require('@rspack/core');
const path = require('path');

// Determine if we're building for production (GitHub Pages)
const isProduction = process.env.NODE_ENV === 'production' || process.env.BASE_URL;
const BASE_URL = process.env.BASE_URL || '/PrometheOS-src/';

// Configuration constants - modify these for different environments
const PYMCP_URL = process.env.PYMCP_URL || (isProduction ? `${BASE_URL}packages/PyMCP/` : 'http://localhost:3005/');
const DEV_SERVER_PORT = 3005;

// Ensure URL ends with /
const normalizedPyMcpUrl = PYMCP_URL.endsWith('/') ? PYMCP_URL : `${PYMCP_URL}/`;

module.exports = {
  mode: isProduction ? 'production' : 'development',
  target: 'web', // Explicitly set target to web to fix compiler.platform undefined error
  entry: {
    index: './src/index.ts',
    'workers/py.worker': './src/workers/py.worker.ts',
  },

  devServer: {
    port: DEV_SERVER_PORT,
    static: {
      directory: path.join(__dirname, 'src'),
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },

  output: {
    publicPath: normalizedPyMcpUrl,
    chunkLoading: 'jsonp',
    chunkFormat: 'array-push',
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    fallback: {
      "child_process": false,
      "fs": false,
      "path": false,
      "os": false,
    },
  },

  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
              tsx: true,
              decorators: false,
              dynamicImport: true,
            },
            transform: {
              react: {
                runtime: 'automatic',
              },
            },
          },
        },
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
        ],
      },
      {
        test: /\.py$/,
        type: 'asset/source',
      },
    ],
  },

  plugins: [
    new ModuleFederationPlugin({
      name: 'shared_pymcp',
      filename: 'remoteEntry.js',
      exposes: {
        './mcp-client': './src/lib/mcp-pyodide-client',
        './mcp-transport': './src/lib/mcp-transport',
        './runtime-generator': './src/lib/runtime-class-generator',
        './py-worker': './src/workers/py.worker.ts',
      },
      shared: {
        react: {
          singleton: true,
          eager: true,
          strictVersion: false,
          requiredVersion: false,
        },
        'react-dom': {
          singleton: true,
          eager: true,
          strictVersion: false,
          requiredVersion: false,
        },
        'react/jsx-runtime': {
          singleton: true,
          eager: true,
          strictVersion: false,
          requiredVersion: false,
        },
        '@shared/api-client': {
          singleton: true,
          eager: true,
          strictVersion: false,
          requiredVersion: false,
        },
      },
      dts: false,
    }),

    new rspack.HtmlRspackPlugin({
      template: './public/index.html',
    }),
  ],
};

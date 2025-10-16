const { ModuleFederationPlugin } = require('@module-federation/enhanced');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

// Configuration constants - modify these for different environments
const PYMCP_URL = process.env.PYMCP_URL || 'http://localhost:3005';
const DEV_SERVER_PORT = process.env.DEV_SERVER_PORT || 3005;

module.exports = {
  mode: 'development',
  entry: './src/index.ts',
  
  devServer: {
    port: DEV_SERVER_PORT,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    client: {
      overlay: {
        runtimeErrors: (error) => {
          // Suppress ResizeObserver loop errors in development
          if (error?.message === "ResizeObserver loop completed with undelivered notifications.") {
            console.warn('ResizeObserver loop completed with undelivered notifications. (This is harmless and can be ignored)');
            return false; // Don't show overlay for this error
          }
          return true; // Show overlay for other errors
        },
      },
    },
  },

  output: {
    publicPath: `${PYMCP_URL}/`,
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            configFile: 'tsconfig.json',
          },
        },
        exclude: /node_modules/,
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
        './types': './src/types/mcp-tools.gen',
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
    
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
  ],
};

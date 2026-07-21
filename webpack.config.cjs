const path = require('path');

module.exports = {
  entry: './src/index.ts',
  mode: 'production',
  target: ['web', 'es2020'],
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
        exclude: path.join(__dirname, 'node_modules')
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.join(__dirname, 'src')
    }
  },
  optimization: {
    minimize: false,
    splitChunks: false,
    runtimeChunk: false,
  },
  plugins: [],
  output: {
    filename: 'index.js',
    path: path.join(__dirname, 'dist'),
    clean: true,
    globalObject: 'this',
    library: {
      name: 'YamlSetter',
      type: 'umd',
    },
  }
};

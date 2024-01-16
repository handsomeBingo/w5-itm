
const path = require('path')

module.exports = {
  entry: {
    bundle1: './src/index.js',
  },
  cache: {
    type: 'filesystem',
    cacheDirectory: path.join(__dirname, './.cache'),
    buildDependencies: {
      config: [__filename]
    }
  },
  snapshot: { // 这里面的选项都是用来决定快照是否失效的
    managedPaths: [path.join(__dirname, 'node_modules/')]
  },
  // mode: 'development', // 调试 splitChunk 时为了看哪些模块被拆出来需要开发模式看看
  mode: 'production', //  tree shaking 时需要启用 production 模式、ModuleConcatenationPlugin 也是生成模式才启用
  devtool: 'source-map',
  output: {
    filename: 'bundle.[chunkhash:4].js',
    path: path.resolve(__dirname, './dist'),
    clean: true
  },
  recordsPath: path.join(__dirname, 'records.json'),
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env'],
              plugins: [
                // [ // babel transform-runtime 暂时屏蔽，会额外多处很多模块，不利于看到现状
                //   '@babel/plugin-transform-runtime',
                //   {
                //     corejs: 3
                //   }
                // ]
              ]
            }
          }
        ]
      }
    ]
  },
  resolve: {
    alias: {
      Src: path.resolve(__dirname, './src')
    },
    extensions: ['.js', '.jsx', '.json'],
    fallback: {
      assert: require.resolve('assert'),
      buffer: require.resolve('buffer')
    },
     // roots: [__dirname] // 把 request 中的 第一个 / 表示的根目录替换成 __dirname
    // importsFields: ['imports']
    // restrictions: [/\.(sass|scss|css)$/]
    // plugins: [new ATR('before-resolved', __dirname)]
  },
  plugins: [
    // new HtmlWebpackPlugin({
    //   template: './src/index.html'
    // }),
    // new VirtualModulesPlugin({
    //   'node_modules/module-foo.js': `module.exports={foo: 'foo'}`,
    //   'node_modules/module-bar.js': `module.exports={foo: 'bar'}`
    // }),
    // new CleanWebpackPlugin()
  ]
}

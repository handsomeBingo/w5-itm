// hack: origin `require` method for loader-runner
// hack: enhanced-resolve instance creation in non-webpack env
// const Module = require('module')
// const context = __dirname

// Module._cache = new Proxy(Module._cache, {
//   get (target, p, receiver) {
//     if (p.includes('/mpxRelativeRootPlaceholder')) {
//       p = p.replace(/(\/mpxRelativeRootPlaceholder)/g, context)
//     }
//     return Reflect.get(target, p)
//   }
// })

const path = require('path')
// const HtmlWebpackPlugin = require('html-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
// const DashedAddModuleProxyPlugin = require('./plugins/DashedAddModuleProxyPlugin')
// const FSProxyPlugin = require('./plugins/FSProxyPlugin2')
// const ATR = require('./plugins/AbsoluteToRelativePlugin')

module.exports = {
  entry: {
    bundle1: './src/index.js',
    // bundle2: './src/a/d.js'
  },
  cache: {
    type: 'filesystem',
    cacheDirectory: path.join(__dirname, './.cache'),
    buildDependencies: {
      // 构建依赖对象：key 可以自定义，但是值是一个绝对路径数组，这里面包含了构建相关的依赖，webpack 会监听这些文件的变化，一旦这些路径发生变化
      // webpack 会是缓存失效触发重新构建，还可以通过 loaderContext.addBuildDependencies(file:string) 的方式添加;
      // 这一配置实在 webpack 的 WebpackOptionsApply.js 中生效的，webpack 会 for in 循环这个对象，然后给每个 key 对应的数组创注册一个 AddBuildDependenciesPlugin 插件
      // build: [path.resolve('./build/')],
      config: [__filename]
    }
  },
  snapshot: { // 这里面的选项都是用来决定快照是否失效的
    managedPaths: [path.join(__dirname, 'node_modules/')], // 包管理器管理的路径数组，这些路径将会被信任不会发生修改，同样使用正则，需要保证路径放在可以被捕获的分组中；这个有一个常用的场景是从 node_modules/ 中剔除掉某些包，默认是 node_modules 下的都不会发生变化，但是有些时候我们是希望更改 node_modules 中的包的，这个时候就要用上这个了，利用 ?! 预查询剔除掉
    // buildDependencies: { hash: true, timestamp: true } 使用持久化缓存时构建依赖快照生成及校验选项；hash 是文件hash，二者都设置首先比较时间戳，时间戳相同在比较 hash
    // immutablePaths: [] // (RegExp | string)[] 一组由包管理器管理的路径，这些路径中包含版本号或者 hash 确保这些文件是永恒不变的，如果使用正则确保路径要在被捕获的分组中，也就是 reg.exec()[索引>=1] 的就是捕获分组
    // module: { hash: true, timestamp: true } 构建模块的快照生成；hash 比较hash决定是否失效，timestamps 靠时间戳决定失效
    // resolve: { hash: true, timestamp: true } 解析 request 的快照
    // resolveBuildDependencies: { hash: true, timestamp: true } 使用持久化构建依赖的解析结果快照，决定快照的失效方式 hash、时间戳
  },
  // mode: 'development', // 调试 splitChunk 时为了看哪些模块被拆出来需要开发模式看看
  mode: 'production', //  tree shaking 时需要启用 production 模式、ModuleConcatenationPlugin 也是生成模式才启用
  devtool: 'source-map',
  output: {
    filename: 'bundle.[chunkhash:4].js',
    path: path.resolve(__dirname, './dist')
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
        ],
        // resolve: {
        //   plugins: [new ATR('before-resolved', __dirname)]
        // }
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
    // plugins: [new ATR('before-resolved', __dirname)] 通过 compiler.resolverFactory.hooks.resolveOptions.for(normal/loader) 注册
    // 为啥 before 都行，after 和钩子类型有关，bail 钩子又返后面就不执行了，确认钩子是最后
  },
  plugins: [
    // new DashedAddModuleProxyPlugin(), 废弃，逻辑移动到 FSProxyPlugin 中
    // new HtmlWebpackPlugin({
    //   template: './src/index.html'
    // }),
    // new FSProxyPlugin(),
    // new VirtualModulesPlugin({
    //   'node_modules/module-foo.js': `module.exports={foo: 'foo'}`,
    //   'node_modules/module-bar.js': `module.exports={foo: 'bar'}`
    // }),
    new CleanWebpackPlugin()
  ]
}

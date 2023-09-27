const path = require('path');
const Module = require('module');
const fs = require('graceful-fs');
const ATR = require('./AbsoluteToRelativePlugin');
const CachedInputFileSystem = require('enhanced-resolve/lib/CachedInputFileSystem');
const AsyncQueue = require('webpack/lib/util/AsyncQueue');

let context;

const ms = [];

// hack: origin `require` method for loader-runner
// hack: enhanced-resolve instance creation in non-webpack env
const originRequire = Module.prototype.require
Module.prototype.require = function (...args) {
  let [firstArg, ...restArg] = args;
  if (/^(\/mpxRelativeRootPlaceholder)/g.test(firstArg)) {
    firstArg = firstArg.replace(/^(\/mpxRelativeRootPlaceholder)/g, context)
  }
  const originModule = originRequire.apply(this, [firstArg, ...restArg])
  if (firstArg.includes('enhanced-resolve') && this.id.includes('webpack/lib/FileSystemInfo.js')) {
    // 处理 enhanced-resolve
    return new Proxy({}, {
      get (target, key) {
        if (key === 'create') return function proxyCreateResolver (...args) {
          const [options, ...rest] = args
          return originModule.create.apply(null, [injectResolverPlugins(options), ...rest])
        }
        return originModule[key]
      },

      apply (target, thisArg, argArray) {
        return originModule.call(thisArg, ...argArray)
      }
    })
  }

  if (firstArg.includes('cache/PackFileCacheStrategy')) {
    return new Proxy(originModule, {
      construct (target, [options], newTarget) {
        const originalCtx = options.context
        options.context = '/mpxRelativeRootPlaceholder'
        // options.cacheLocation = options.cacheLocation.replace(originalCtx, '/mpxRelativeRootPlaceholder')
        return new target(options)
      }
    })
  }

  return originModule
}

function ensureAbsolutePath (p) {
  if (typeof p === 'string' && /^(\/mpxRelativeRootPlaceholder)/g.test(p)) {
    return p.replace(/^(\/mpxRelativeRootPlaceholder)/g, context || path.resolve(__dirname, '../'))
  }
  return p
}

function replaceCtx (contextPath, replacer, str) {
  return str.replace(new RegExp(contextPath, 'g'), replacer)
}

// 跑 日志得出的
const namesToBeOverload =[
  'lstat',
  'lstatSync',
  'stat',
  'statSync',
  'readdir',
  'readdirSync',
  'readFile',
  'readFileSync',
  'readlink',
  'readlinkSync',
  'realpath', // 已改写
  'mkdir',
  'createWriteStream',
  'rename'
];

// 方法I：局部改写
// namesToBeOverload.forEach(method => {
//   const origin = fs[method];
//   fs[method] = new Proxy(origin, {
//     apply (target, ctx, args) {
//       let [firstArg, ...remaining] = args;
//       firstArg = ensureAbsolutePath(firstArg);
//       return target.apply(ctx, [firstArg, ...remaining])
//     }
//   })
// })


// 方法II：全量改写 fs 的 get 和 apply
// 方案1：枚举所有接收 path 的方法
// 方案2：模糊匹配第一个参数是否为类路径的参数，若是则代理
let timer = null
const proxyFS = new Proxy(fs, {
  get (target, key) {
    const fn = target[key]
    if (typeof fn !== 'function') return fn;
    if (!ms.includes(key)) {
      // 计算所有被调用的 fs 上的方法名
      ms.push(key)
      clearTimeout(timer)
      timer = setTimeout(() => console.log(ms), 8000)
    }
    return new Proxy(fn, {
      apply (target, ctx, args) {
        let [firstArg, ...remaining] = args;
        let restoredFirstArg
        if (typeof firstArg === 'string' && /^(\/mpxRelativeRootPlaceholder)/g.test(firstArg)) {
          restoredFirstArg = ensureAbsolutePath(firstArg)
        }
        if (['realpath'].includes(key) && restoredFirstArg) {
          // 处理快照里面的 key 有 compiler.context 这个绝对路径
          const cb = remaining.pop()
          remaining.push((err, _realPath) => {
            if (_realPath) {
              _realPath = firstArg
            }
            return cb(err, _realPath)
          })
        }
        return target.apply(ctx, [restoredFirstArg ?? firstArg, ...remaining])
      }
    })
  }
})

const injectResolverPlugins = resolveOptions => {
  const plugins = resolveOptions.plugins || (resolveOptions.plugins = [])
  plugins.push(new ATR('before-resolved', context))
  return { ...resolveOptions }
};

module.exports = class FSProxy {
  constructor (ctx) {
    this.ctx = ctx
  }
  apply (compiler) {

    context = compiler.options.context

    const replaceRootWithPlaceholder = replaceCtx.bind(null, context, '/mpxRelativeRootPlaceholder')

    // overwrite intermediateFileSystem
    compiler.intermediateFileSystem = proxyFS

    // overwrite inputFileSystem
    // loaderContext.fs referenced the CacheInputFileSystem
    compiler.inputFileSystem = new CachedInputFileSystem(proxyFS, 60000);

    // add ATR plugin to both normal-resolver and loader-resolver
    compiler.resolverFactory.hooks.resolveOptions.for('normal').tap('FSProxyPlugin', injectResolverPlugins)
    compiler.resolverFactory.hooks.resolveOptions.for('loader').tap('FSProxyPlugin', injectResolverPlugins)


    // replace webpack.config.js.cache.buildDependencies root with `/mpxRelativeRootPlaceholder`
    compiler.hooks.afterEnvironment.tap('FSProxyPlugin', () => {
      const originalBuildDeps = compiler.options.cache.buildDependencies
      for (const key in originalBuildDeps) {
        if (originalBuildDeps.hasOwnProperty(key)) {
          originalBuildDeps[key] = originalBuildDeps[key].map(replaceRootWithPlaceholder)
        }
      }
    })

    // 改写 _addModule 方法处理 identifier
    // todo: identifier 不用改了
    compiler.hooks.compilation.tap('FSProxyPlugin', (compilation, compilationParams) => {
      const originDashAddModule = compilation._addModule;
      compilation._addModule = (module, callback) => {
        const originIdentifier = module.identifier
        module.identifier = function () {
          return ensureAbsolutePath(originIdentifier.call(module))
        }
        originDashAddModule.call(compilation, module, callback)
      }

      compilation.addModuleQueue = new AsyncQueue({
        name: "addModule2",
        parent: compilation.processDependenciesQueue,
        getKey: module => module.identifier(),
        processor: compilation._addModule.bind(compilation)
      });
    });
  }

  // 方案： require.cache 写入后处理，读取预处理
}

// 使用 webpack-virtual-modules 方案？
// webpack-virtual-modules 是操作 CachedInputFileSystem._data 对象的读写，按照 CachedInputFileSystem._data 的缓存数据结构进行实现虚拟的文件模块；能实现的前提是当读写发生时优先操作 _data 对象。
// 但是构建缓存主要有以下四方面的路径改写：
// 1. webpack 内的 resolver 解析所得的模块路径和loader路径结果
// 2. webpack 内的 loader-runner 加载 loader 时的还原
// 3. webpack 构建依赖的收集：
//    3.1 webpack.config.js.cache.buildDependencies 目录
//    3.2 webpack 构建过程中收集的 loader 的解析路径
//    3.3 构建依赖的 package.json 的 dependencies 的路径
//    3.4 构建依赖 js 模块的子模块路径（children）

// 所以我们要做的是什么呢？
// 1. 实现一个类似 CacheInputFileSystem 的类，改写 fs 的10+方法处理路径的替换和还原吗？这个和直接代理 graceful-fs 有啥区别？
// 2. 感觉并不能完全解决掉构建依赖过程中另行创建的 resolver 时传递的 graceful-fs 原始对象以及解析结果的替换、还原，还有 require.cache 无解

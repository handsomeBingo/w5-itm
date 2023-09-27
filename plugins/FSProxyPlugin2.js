const path = require('path');
const Module = require('module');
const fs = require('graceful-fs');
const ATR = require('./AbsoluteToRelativePlugin');
const RTA = require('./RelativeRootRestorePlguin');
const CachedInputFileSystem = require('enhanced-resolve/lib/CachedInputFileSystem');
const FileSystemInfo = require('webpack/lib/FileSystemInfo')
const PackFileCacheStrategy = require('webpack/lib/cache/PackFileCacheStrategy')
const AsyncQueue = require('webpack/lib/util/AsyncQueue');
const LazySet = require('webpack/lib/util/LazySet')
const Snapshot = FileSystemInfo.Snapshot
const { create: createResolver } = require("enhanced-resolve");

let context;

const ms = [];

function ensureAbsolutePath (p) {
  if (typeof p === 'string' && /^(\/mpxRelativeRootPlaceholder)/g.test(p)) {
    return p.replace(/^(\/mpxRelativeRootPlaceholder)/g, context || path.resolve(__dirname, '../'))
  }
  return p
}

// hack: origin `require` method for loader-runner
// hack: enhanced-resolve instance creation in non-webpack env
const originRequire = Module.prototype.require
Module.prototype.require = function (...args) {
  let [firstArg, ...restArg] = args;
  if (/^(\/mpxRelativeRootPlaceholder)/g.test(firstArg)) {
    firstArg = firstArg.replace(/^(\/mpxRelativeRootPlaceholder)/g, context)
  }
  const originModule = originRequire.apply(this, [firstArg, ...restArg])

  return originModule
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
      // ms.push(key)
      // clearTimeout(timer)
      // timer = setTimeout(() => console.log(ms), 8000)
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

const injectResolverPlugins = (pluginToBeInjected) => {
  return (resolveOptions) => {
    const plugins = resolveOptions.plugins || (resolveOptions.plugins = [])
    plugins.push(pluginToBeInjected)
    return { ...resolveOptions }
  }
};

module.exports = class FSProxy {
  constructor (ctx) {
    this.ctx = ctx
  }
  apply (compiler) {

    const relativeRoot = '/mpxRelativeRootPlaceholder'
    context = compiler.options.context

    const replaceRootWithPlaceholder = replaceCtx.bind(null, context, relativeRoot)

    // overwrite intermediateFileSystem
    compiler.intermediateFileSystem = proxyFS

    // overwrite inputFileSystem
    // loaderContext.fs referenced the CacheInputFileSystem
    compiler.inputFileSystem = new CachedInputFileSystem(proxyFS, 60000);

    // add ATR plugin to both normal-resolver and loader-resolver
    compiler.resolverFactory.hooks.resolveOptions
      .for('normal').tap('FSProxyPlugin2', injectResolverPlugins(new ATR('before-resolved', context)))
    compiler.resolverFactory.hooks.resolveOptions
      .for('loader').tap('FSProxyPlugin2', injectResolverPlugins(new ATR('before-resolved', context)))

    // proxy FileSystemInfo.prototype._createBuildDependencies to inject the RelativeToAbsolutePath
    // when resolveBuildDependencies working
    // for the /mpxRelativeRoot restoring when resolveBuildDependencies resolving
    const RTAFactory = () => new RTA('resolve', 'internal-resolve', { context, relativeRoot })
    FileSystemInfo.prototype._createBuildDependenciesResolvers = function () {
      const resolveContext = createResolver({
        resolveToContext: true,
        exportsFields: [],
        plugins: [RTAFactory()],
        fileSystem: this.fs
      });
      const resolveCjs = createResolver({
        extensions: [".js", ".json", ".node"],
        conditionNames: ["require", "node"],
        exportsFields: ["exports"],
        plugins: [RTAFactory()],
        fileSystem: this.fs
      });
      const resolveCjsAsChild = createResolver({
        extensions: [".js", ".json", ".node"],
        conditionNames: ["require", "node"],
        exportsFields: [],
        plugins: [RTAFactory()],
        fileSystem: this.fs
      });
      const resolveEsm = createResolver({
        extensions: [".js", ".json", ".node"],
        fullySpecified: true,
        conditionNames: ["import", "node"],
        exportsFields: ["exports"],
        plugins: [RTAFactory()],
        fileSystem: this.fs
      });
      return { resolveContext, resolveEsm, resolveCjs, resolveCjsAsChild };
    }

    const originalResolveBuildDependencies = FileSystemInfo.prototype.resolveBuildDependencies
    FileSystemInfo.prototype.resolveBuildDependencies = function (context, deps, callback) {
      originalResolveBuildDependencies.call(this, context, deps, (err, result) => {
        const rebuiltResult = {}
        // todo: turn the recursion into another form when deep copy
        // maybe while queue ?
        function handler (src, target) {
          for (const key in src) {
            const sv = src[key]
            if (sv instanceof Map) {
              target[key] = new Map()
              for (const [k, v] of sv) {
                target[key].set(replaceRootWithPlaceholder(k), replaceRootWithPlaceholder(v))
              }
            } else if (sv instanceof Set) {
              target[key] = new Set(Array.from(sv).map(i => replaceRootWithPlaceholder(i)))
            } else {
              handler(sv, target[key] = {})
            }
          }
          return target
        }
        callback(err, handler(result, rebuiltResult))
      })
    }

    const originalPackFileCacheStrategyStore = PackFileCacheStrategy.prototype.store
    PackFileCacheStrategy.prototype.store = function (identifier, etag, data) {
      // 模块的就要从源头改？
      // 强行替换会爆栈
      // const identifierReplacer = replaceRootWithPlaceholder(identifier)
      function replaceObject (obj) {
        const q = [obj]
        while (q.length) {
          const itm = q.pop()
          for (const k in itm) {
            const val = itm[k]
            if (Object.prototype.toString.call(val) === '[object Object]' && Object.keys(val).length !== 0) {
              q.push(val)
              continue
            }
            if (new RegExp(context, 'g').test(val)) {
              itm[k] = replaceRootWithPlaceholder(val)
            }
          }
        }
        return obj
      }
      // if (data.request) {
      //   data.request = replaceRootWithPlaceholder(data.request)
      // }
      originalPackFileCacheStrategyStore.call(this, identifier, etag, data)
    }

    const originalStoreBuildDependencies = PackFileCacheStrategy.prototype.storeBuildDependencies
    PackFileCacheStrategy.prototype.storeBuildDependencies = function (dependencies) {
      const cpLazySet = new LazySet()
      dependencies.forEach(d => cpLazySet.add(replaceRootWithPlaceholder(d)))
      originalStoreBuildDependencies.call(this, cpLazySet)
    }

    // overwrite Snapshot public methods
    const originalSetStartTime = Snapshot.prototype.setStartTime;
    const originalSetMergedStartTime = Snapshot.prototype.setMergedStartTime;
    const originalSetFileTimestamps = Snapshot.prototype.setFileTimestamps;
    const originalSetFileHashes = Snapshot.prototype.setFileHashes;
    const originalSetFileTshs = Snapshot.prototype.setFileTshs;
    const originalSetContextTimestamps = Snapshot.prototype.setContextTimestamps;
    const originalSetContextHashes = Snapshot.prototype.setContextHashes;
    const originalSetContextTshs = Snapshot.prototype.setContextTshs;
    const originalSetMissingExistence = Snapshot.prototype.setMissingExistence;
    const originalSetManagedItemInfo = Snapshot.prototype.setManagedItemInfo;
    const originalSetManagedFiles = Snapshot.prototype.setManagedFiles;
    const originalSetManagedContexts = Snapshot.prototype.setManagedContexts;
    const originalSetManagedMissing = Snapshot.prototype.setManagedMissing;
    const originalSetChildren = Snapshot.prototype.setChildren;

    const handleMapReplacing = (value) => {
      for (const [k, v] of value.entries()) {
        const tryReplacer = replaceRootWithPlaceholder(k)
        if (tryReplacer !== k) {
          value.delete(k)
          value.set(tryReplacer, v)
        }
      }
      return value
    }

    const handleSetReplacing = value => new Set(Array.from(value).map(i => replaceRootWithPlaceholder(i)))

    Snapshot.prototype.setStartTime = function (value) {
      originalSetStartTime.call(this, value)
    }

    Snapshot.prototype.setMergedStartTime = function (value, snapshot) {
      // todo: snapshot 不太好办？
      // snapshot.fileTshs 包含父路径，这些路径无法替换；预计把替换不了的删除或者用更多占位符$1/$2/$3/$... 替换掉父路径
      // 是因为 ResolverCachePlugin 第一次解析 入口时 路径后创建的 snapshot 中记录解析过程中 enhanced-resolve 收录的 fileDependencies
      originalSetMergedStartTime.call(this, value, snapshot)
    }

    Snapshot.prototype.setFileTimestamps = function (value) {
      originalSetFileTimestamps.call(this, value)
    }

    Snapshot.prototype.setFileHashes = function (value) {
      originalSetFileHashes.call(this, value)
    }

    Snapshot.prototype.setFileTshs = function (value) {// Map
      // 值里面有一大堆从当前项目目录依次找到 / 的结果，这些玩意儿有啥用吗？
      handleMapReplacing(value)
      originalSetFileTshs.call(this, value)
    }


    Snapshot.prototype.setContextTimestamps = function (value) {
      originalSetContextTimestamps.call(this)
    }

    Snapshot.prototype.setContextHashes = function (value) {
      originalSetContextHashes.call(this, value)
    }

    Snapshot.prototype.setContextTshs = function (value) {
      originalSetContextTshs.call(this, value)
    }

    Snapshot.prototype.setMissingExistence = function (value) { // Map/Set
      switch (value.constructor) {
        case Map:
          handleMapReplacing(value)
          break;
        case Set:
          value = handleSetReplacing(value)
      }

      originalSetMissingExistence.call(this, value)
    }

    Snapshot.prototype.setManagedItemInfo = function (value) {
      handleMapReplacing(value)
      originalSetManagedItemInfo.call(this, value)
    }

    Snapshot.prototype.setManagedFiles = function (value) {
      const replacedSet = handleSetReplacing(value)
      originalSetManagedFiles.call(this, replacedSet)
    }

    Snapshot.prototype.setManagedContexts = function (value) {
      const replacedSet = handleSetReplacing(value)
      originalSetManagedContexts.call(this, replacedSet)
    }

    Snapshot.prototype.setManagedMissing = function (value) {
      const replacedSet = handleSetReplacing(value)
      originalSetManagedMissing.call(this, replacedSet)
    }

    Snapshot.prototype.setChildren = function (value) { // Set
      const replacedSet = handleSetReplacing(value)
      originalSetChildren.call(this, replacedSet)
    }
  }

}

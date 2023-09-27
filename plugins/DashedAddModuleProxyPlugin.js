const path = require('path')
const AsyncQueue = require("webpack/lib/util/AsyncQueue");
class DashedAddModuleProxyPlugin {
  constructor () {}

  apply (compiler) {


    const contextPath = compiler.options.context;

    function r (str) {
      return str.replace(new RegExp(contextPath, 'g'), '.')
    }

    // webpackOptionsApply.js 的构建依赖添加处理成相对路径
    compiler.hooks.environment.tap('AddModuleProxyPlugin', () => {
      const buildDeps = compiler.options.cache.buildDependencies
      for (let k in buildDeps) {
        buildDeps[k] = buildDeps[k].map(i => r(i))
      }
    })

    compiler.hooks.compilation.tap('AddModuleProxyPlugin', (compilation, compilationParams) => {
      const originDashAddModule = compilation._addModule;
      compilation._addModule = (module, callback) => {
        const originIdentifier = module.identifier
        module.identifier = function () {
          return r(originIdentifier.call(module))
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

    // compiler.cache.hooks.storeBuildDependencies.intercept({
    //   call (a, b, c, d) {
    //     console.log(a, b, c, d)
    //   },
    //   register(tap) {
    //     console.log(tap)
    //     return tap
    //   }
    // })
  }
}
module.exports = DashedAddModuleProxyPlugin

module.exports = class RelativeRootRestore {
  constructor (source, target, cfg) {
    this.source = source;
    this.target = target;
    this.ctx = cfg.context;
    this.relativeRoot = cfg.relativeRoot
  }
  apply (resolver) {
    const target = resolver.ensureHook(this.target)
    const source = resolver.getHook(this.source)
    source.tapAsync({
      name: 'RelativeRootRestore',
      stage: -100
    }, (request, resolveContext, callback) => {
      const obj = {}
      for (const key in request) {
        const val = request[key]
        obj[key] = typeof val === 'string' ? val.replace(new RegExp(this.relativeRoot, 'g'), this.ctx) : val
      }
      // doResolve(hook, request, message, resolveContext, callback)
      resolver.doResolve(target, obj, `${this.relativeRoot} has been restored ${this.ctx}`, resolveContext, callback)
    })
  }
}

// 写一个统一的 webpack plugin 统一处理：
// 1. 改写 fs、
// 2. 注册 resolver 插件
// 3. hack require
module.exports = class AbsoluteToRelativePlugin {
  constructor (source, ctx, target) {
    this.source = source
    this.ctx = ctx
    this.target = target
  }
  sth () {
    return 'sth'
  }

  apply (resolver) {
    const target = resolver.ensureHook(this.target)
    const source = resolver.getHook(this.source)
    source.tapAsync(
      'AbsoluteToRelative',
      (request, resolveContext, callback) => {
        // 不用 . 用 /mpxRelativePath，在 fs 这一层去替换
        const replaceHandler = p => p.replace(new RegExp(this.ctx, 'g'), '/mpxRelativeRootPlaceholder')
        const relativeToRootPath = replaceHandler(request.path)
        const descriptionFilePath = replaceHandler(request.descriptionFilePath)
        const descriptionFileRoot = replaceHandler(request.descriptionFileRoot)
        const obj = {
          ...request,
          path: relativeToRootPath,
          // relativePath: , // relativePath 疑似给 resolver.resolve(, cb) 的 cb 用
          relativeToRootPath: relativeToRootPath,
          descriptionFilePath,
          descriptionFileRoot,
        }
        callback(null, obj)
      })
  }
}

---
theme: cyanosis
highlight: an-old-hope
---
## 〇、webpack 的配置项 Resolve

把这些选项列一列;

relativePath 是模块和包的相对路径，比如 babel-loader 的 path 是 /user/gg/Document/proj/node_modules/lib/index.js
，relativePath 是 ./lib/index.js；
如果在项目目录中就是相对于项目根目录的相对路径；

## 一、enhanced-resolve 与构建流程

在 NormaoModuleFactory 模块构建过程中，参与模块路径的解析，将解析所得的 loader 和模块路径交给后续的构建流程。

### 1.1 getResolver

NormalModuleFactory.prototype.getResolver 方法，调用 this.resolverFactory.get 方法

    class NormalModuleFactory {
      // ....
      getResolver(type, resolveOptions) {
        return this.resolverFactory.get(type, resolveOptions);
      }
    }

### 1.2 webpack/lib/ResolverFactory.get

该方法来自 webpack/lib/ResolverFactory.js 的静态方法：

```js
class ResolverFactory {
   get(type, resolveOptions = EMPTY_RESOLVE_OPTIONS) {
     let typedCaches = this.cache.get(type);
     if (!typedCaches) {
      typedCaches = {
       direct: new WeakMap(),
       stringified: new Map()
      };
      this.cache.set(type, typedCaches);
     }
     // 获取缓存
     const cachedResolver = typedCaches.direct.get(resolveOptions);
     if (cachedResolver) {
      // 命中缓存
      return cachedResolver;
     }
     const ident = JSON.stringify(resolveOptions);
     const resolver = typedCaches.stringified.get(ident);
     if (resolver) {
      typedCaches.direct.set(resolveOptions, resolver);
      return resolver;
     }
     
     // 无缓存创建新的 resolver
     const newResolver = this._create(type, resolveOptions);
     typedCaches.direct.set(resolveOptions, newResolver);
     typedCaches.stringified.set(ident, newResolver);
     return newResolver;
   }
   _create () {
   
    const originalResolveOptions = { ...resolveOptionsWithDepType };

    const resolveOptions = convertToResolveOptions(
     this.hooks.resolveOptions.for(type).call(resolveOptionsWithDepType)
    );
    const resolver = (
     // 新建 Resolver
     Factory.createResolver(resolveOptions)
    );

    const childCache = new WeakMap();
    resolver.withOptions = options => {
     const cacheEntry = childCache.get(options);
     if (cacheEntry !== undefined) return cacheEntry;
     const mergedOptions = cachedCleverMerge(originalResolveOptions, options);
     const resolver = this.get(type, mergedOptions);
     childCache.set(options, resolver);
     return resolver;
    };
    this.hooks.resolver
     .for(type)
     .call(resolver, resolveOptions, originalResolveOptions);
    return resolver;
   }
}
```

webpack/lib/ResolverFactory.js 的 `_create` 方法调用了 enhanced-resolve/lib/ResolverFactory.js 的 createResolver 方法：

## 二、Factory.createResolver 工作流

方法来自 `enhanced-resolve/lib/ResolverFactory.js` 模块导出的方法 createResolver ：

```js
exports.createResolver = function (options) {
 // ....
 return resolver;
};
```

createResolver 方法主要工作如下：总结一下，包括后面的几个阶段：

### 2.1 normalizeOptions 格式化选项对象

1.  normalizeOptions 格式化选项对象

### 2.2 创建 Resolver 实例 resolver

3.  new Resolver() 创建 resolver 实例

### 2.3 流水线钩子注册

调用 resolver.enuserHook 完成从 resolve 到 resolved 的流水线钩子注册

### 2.4 // resolve: 开始 resolve

如果启用 `unsafeCache` 注册则在 `new-resolve` 和 `new-internal-resolve` source 钩子注册两个插件：UnsafeCachePlugin、ParsePlugin 插件，这两个插件的 target 都是 `parsed-resolve`；如果没未启用，则为 `resolve`和 `internal-resolve` source 钩子注册 ParsePlugin，这两个钩子的 target 钩子都是 `parsed-resolve`。[webpack.config.js.resolve.unsafeCache 传送门](https://webpack.js.org/configuration/resolve/#resolveunsafecache)，缓存一切！

### 2.5 // parsed-resolve: request 解析阶段

为 `parsed-resolve` source 钩子注册 `DescriptionFilePlugin` 插件，该插件的 target 钩子为 `described-resolve`
注册 NextPlugin，引导从 `described-resolved` source 钩子到 `raw-resolve` target 钩子；

### 2.6 // described-resolve 描述文件已解析

如果 fallback.length 不为0，fallback 的作用是当解析失败时的解析重定向，详细配置 [resolve.fallback 配置传送门](https://webpack.docschina.org/configuration/resolve/#resolvefallback)。具体实现：为 `described-resolved` source 钩子注册 AliasPlugin，其 target 钩子为 `internal-resolve` ， 这个 `internal-resolve` 在前面 【4】中注册了 ParsePlugin，这就说明这个执行流程被退回到了 `internal-resolve` 阶段。啥意思嘞，很简单，alias 被分析后需要重新解析，重新走流程；

### 2.7 // raw-resolve: 原始解析阶段

1.  如果 alias.length 不为 0，说明配置了 resolve.alias 选项。则为 `raw-resolve` source 钩子注册 AliasPlguin，其 target 钩子为 `internal-resolve`；
2.  遍历 `aliasFields` 配置，该配置源数据来自 webpack.cofig.js.resolve.aliasFields 字段，表示的 [resolve.aliasFields 传送门](https://webpack.js.org/configuration/resolve/#resolvealiasfields) ，这个玩意儿是当 webpack 构建的代码产物运行于`浏览器`环境时告知 resolver 解析模块过程中需要查找的 package.json 中代表浏览器入口文件的标识字段。有点拗口了。。。我也组织好几次才说出来。。。就是说：有的 npm 包里面的某些文件不能直接在浏览器运行，而 npm 包的作者提供了另一个文件专门用在浏览器环境，npm 包作者通过在它包里面的 package.json.browser 字段告诉你这个浏览器版本的文件是哪个，相当于官方给你 hack 好了的。这种情况下需要 enhanced-resolver 专门处理。处理插件就是 AliasFieldPlugin 插件，该插件注册的 source 钩子 `raw-resolve`，target 钩子 `internal-resolve` 钩子。
3.  遍历 `extensionAlias`，给每个 extensionAlias 注册 ExtensionAliasPlugin 插件，该插件的 source 钩子 `raw-resolve`，target 钩子是 `normal-resolve`。extensionAlias 是扩展名的别名映射。上[webpack.config.js.resolve.extensionAlias 传送门](https://webpack.js.org/configuration/resolve/#resolveextensionalias)
4.  注册 NextPlugin 插件，引导从 `raw-resolve` source 钩子到 `normal-resolve` target 钩子。

### 2.8 // normal-resolve: 普通解析阶段

1.  判断 preferRealative 配置项，默认 `false`，如果为 true，则注册 JoinRequestPlugin 插件，该插件的 source 钩子是 `after-normal-resolve`，target 钩子是 `relative`。preferRealative 是偏好相对路径，其作用是把不写路径的的 request ，比如 `import logo from 'logo1';` logo1 就会被当成 './logo1.js' 而不是当成 node_modules/logo1 这个模块文件夹解析。上 [webpack.config.js.resolve.preferRelative 传送门](https://webpack.js.org/configuration/resolve/#resolvepreferrelative)

2.  注册 ConditionalPlugin 插件，条件 { module: true }，source 钩子为 `after-normal-resolve`，target 钩子为 `raw-resolve` 钩子。作为模块解析？

3.  注册 ConditionalPlugin 插件，条件 { internal: true }，source 钩子为 `after-normal-resolve`，target 钩子为 `internal` 钩子。作为内部 import 解析？

4.  判断如果 preferAbsolute 配置项，默认 `false`，如果为 `true` 注册 JoinRequestPlugin 拼接请求，`source 钩`子为 `after-normal-resolve`，`target 钩子` 为 `relative`。preferAbsolute 是指在解析的过程中优先 webpack.config.js.resolve.roots 配置的包管理路径；

5.  判断 roots.length > 0，即 webpack.config.js.resolve.roots 配置不为空，就注册 RootsPlugin 插件，`source 钩子`为 `after-normal-resolve`，`target 钩子`为 `relative`。webpack.config.js.resolve.roots 是 webpack 解析包的根路径，默认是 webpack 配置的 context 目录，上 [resolve.roots 传送门](https://webpack.js.org/configuration/resolve/#resolveroots)

6.  判断 `!preferRelative && !preferAbsolute`，如果条件成立表示无绝对路径偏好或者相对路径偏好，此时再次注册 JoinRequestPlugin，source 钩子`after-normal-resolve`，target 钩子 `relative`；这里有个问题？为啥 preferAbsolute 和 preferRelative 成立时注册 JoinRequestPlugin，都不满足的时候也要注册 JoinRequestPlguin？

### 2.9 // internal: 内部解析阶段

遍历 importsFields 字段，为每个字段注册 ImportsFieldPlugin 插件，source 钩子 `internal`，target 钩子 `internal-resolve`。importsFields 是用于提供包内部request 的 package.json 中的字段名，上 [webpack.config.js.resolve.importsFields 传送门](https://webpack.js.org/configuration/resolve/#resolveimportsfields)。值得注意的是官方文档上写的 importsFields 配置似乎有点问题，应该是：`importFields: ["imports"]`，imports 对应的就是 package.json.imports 字段，而不是配置 browser/node/module 这样的值。。。

就是说有些包内部的某些模块是可以直接给当前包内部解析用的比如有个 npm 包叫做 `"qiang-sheng-group"`，里面有两个模块 `"tangxiaolong.js"`、 `"tangxiaohu.js"` 两个模块除了强哥家里人谁也不敢用，这个时候这个包的 `package.json` 里面就要写上：

    {
      "name": "qiang-sheng-group",
      "main": "./lib/gaoqiqiang.js",
      "imports": {
        "#xiaohu": "./lib/tangxiaohu.js",
        "#xiaolong": "./lib/tangxiaolong.js"
      }
    }

这个时候 `"gaoqiqiang.js"` 里面就可以通过以下方式调用：
```js
import TangXiaolong from '#xiaolong';
console.log(Tangxiaolong)
```
其中 `"#xiaolong"` 就会发起`内部 request`；

imports 字段更多参考文献（反正我是看了TM好久才看明白的，原文赶紧上车`李有田主任的车`）：

1.  [webpack 指南：Package export](https://webpack.docschina.org/guides/package-exports/)
2.  [Node.js： package.json "imports" 字段](https://nodejs.org/api/packages.html#imports)

![See You Again](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/1568117283c643d795e5704f6b6c9477~tplv-k3u1fbpfcp-zoom-1.image)

### 2.10 // raw-module 阶段

1.  遍历 `exportsFields` 字段，为每个字段注册 `SelfReferencePlugin` 插件。source 钩子 `raw-module`，target 钩子 `resolve-as-module`。exportsFileds 是借助 package.json.exports(或其他字段)改写原有的 package.json 通过 main 字段指定入口等行为的，除了可以改写 main 主入口，还可以改写 pgk/sub/path 这种子路径，上 [webpack.config.js.resolve.exportsFields 传送门]。(https://webpack.js.org/configuration/resolve/#resolveexportsfields)

2. 遍历 modules 配置项，配置不同插件插件的 source 钩子为 `raw-module`，target 钩子为 `module`。webpack.config.js.resolve.modules 可以理解成一组包管理管理的目录，就是 node_modules 同功能的目录，告诉 webpack 从哪个路径解析包。[webpack.config.js.resolve.modules 传送门](https://webpack.js.org/configuration/resolve/#resolvemodules) 根据配置不同有以下不同行为：
    - 2.1 如果 item 是数组并且是 pnp 环境则注册 `ModulesInHierarchicalDirectoriesPlugin` 插件 和 `PnpPlugin` 插件。
    - 2.2 否则注册 `ModulesInHierarchicalDirectoriesPlugin` 插件；我们使用 node_modules 就是这个插件处理的。

### 2.11 // module 阶段
注册 `JoinRequestPartPlugin` 插件，source 钩子 `module`，target 钩子 `resolve-as-module`。处理对 @namespace/sub/pkg/file.js 这种针对带有 @ 符号的命名空间内部的子模块请求。感觉是把带有命名空间的包里面的子模块当成模块请求。起初有点好奇他为什么这么高，这样做就一点一点的变成了一个绝度路径了，体现在插件对 path 的改写。


### 2.12 // resolve-as-module
1. 判断 `resolveToContext` 是否为 false，如果成立（这个配置项在 webpack 官方文档没有找到，其默认值为 false），则注册 `ConditionalPlugin` 插件，source 钩子为`resolve-as-module`，target 钩子 `undescribed-raw-file`。条件是 `{ directory: false, request: "." },`。

2. 注册 `DirectoryExistsPlugin` 插件，source 钩子：`resolve-as-module`，target 钩子：`undescribed-resolve-in-package`。path 是不是一个真实存在的目录

### 2.13 // `undescribed-resolve-in-package`

1. 注册 `DescriptionFilePlugin` 插件，source 钩子 `undescribed-resolve-in-package`，target钩子：`resolve-in-package`。其实这个插件在前面注册过，其作用是读取目录下的 package.json 文件，但是此时经过前面的多个插件加工，path 已经发生了变化，此时需要重新读取 path 下面的 package.json 了。


2. 注册 `NextPlugin` 插件，source 钩子：`after-undescribed-resolve-in-package`，target 钩子 `resolve-in-package`。NextPlugin 不再赘述。

### 2.14 // resolve-in-package
1. 遍历 exportsFields 字段，给各个字段注册 `ExportsFieldPlugin` 插件，source 钩子：`resolve-in-package`，target 钩子：`relative`。exportsFields [webpack.config.js.resolve.exportsFields 传送门](https://webpack.js.org/configuration/resolve/#resolveexportsfields)

2. 注册 `NextPlugin`，source 钩子：`resolve-in-package`，target 钩子：`resolve-in-existing-directory`。

3. 再次注册 `JoinRequestPlugin` 插件，source 钩子：`resolve-in-existing-directory`，target 钩子：`relative`。

### 2.15 // resolve-in-existing-directory
注册 JoinRequestPlugin 插件，source 钩子：resolve-in-existing-directory，target：relative 钩子。

### 2.15 // relative

1. 再次注册 `DescriptionFilePlugin` 插件，source 钩子：`relative`，target 钩子：`described-relative`。
2. 注册 `NextPlugin`，source 钩子：`after-relative`，target 钩子：`described-relative`。


### 2.16 `// described-relative`

1. 判断 resolveToContext 是否存在，存在注册 NextPlugin，source 钩子：`described-relative`，target 钩子：`directory`；否则，注册 ConditionalPlugin，source 钩子：`described-relative`，target 钩子：`raw-file`，条件：`{ directory: false }`；再注册 ConditionalPlugin，source 钩子：`described-relative`，target 钩子：`directory`，条件：`{ fullySpecified: false }`；


### 2.17 `// directory`

注册 `DirectoryExistsPlugin` 插件，source 钩子：`directory`；target 钩子：`undescribed-existing-directory`；校验 request.path 是否存在。

### 2.18 `// undescribed-existing-directory`
根据是否有 resolveToContext 配置行为不同：

#### 2.18.1 有 resolveToContext
注册 `NextPlugin` 插件，source 钩子：`undescribed-existing-directory`，target 钩子：`resolved`。？？到 resolved 不就结束了？？？？

#### 2.18.2 否则，注册以下插件：
1. `DescriptionFilePlugin` 插件：source 钩子：`undescribed-existing-directory`，target 钩子：`existing-directory`；再次解析当前 path 下的 package.json 文件；

2. 遍历 `mainFiles` 字段，给每个 mainFiles 注册 UseFilePlugin 插件，source 钩子：`undescribed-existing-directory`，target 钩子：`undescribed-raw-file`，(webpack.config.js.resolve.mainFiles 传送门)[https://webpack.js.org/configuration/resolve/#resolvemainfiles] ，其作用是告知webpack 解析为目录时取用的默认文件，比如 import s from 'src'，会被解析成 src/index.js
   后续还有几个阶段，2.19 开始。

### 2.19 `described-existing-directory`
1. 遍历 `mainFields` 字段，注册 MainFieldPlugin 插件，source 钩子：`existing-directory`，target 钩子：`resolve-in-existing-directory`；该插件作用是把包名和它的主入口文件模块拼接起来得到包的解析结果。
2. 遍历 `mainFiles` 字段，给每个 mainFiles 注册 UseFilePlugin 插件，source 钩子：`existing-directory`，target 钩子：`undescribed-raw-file`，(webpack.config.js.resolve.mainFiles 传送门)[https://webpack.js.org/configuration/resolve/#resolvemainfiles] ，其作用是告知webpack 解析为目录时取用的默认文件，比如 import s from 'src'，会被解析成 src/index.js。

### 2.20 `// undescribed-raw-file`

1. 再注册 `DescriptionFilePlugin` 插件，source 钩子：`undescribed-raw-file`，target 钩子：`raw-file`；再次尝试解析 package.json
2. 再注册 `NextPlugin` 插件，source 钩子：`after-undescribed-raw-file`，target 钩子：`raw-file`；

### 2.21 `// raw-file`

1. 再次注册 `ConditionalPlugin`，source 钩子：`raw-file`，target 钩子：`file`。条件：`{ fullySpecified: true }`。
2. 再判断 !enforceExtension，是否未强制扩展名，如果为 true 注册 `TryNextPlugin` 插件，source 钩子：`raw-file`，target 钩子：`file`；
3. 遍历 extension，给每个 extension 注册一个 AppendPlugin，source 钩子：raw-file，target 钩子：file；给 path 和 relativePath 追加各个可能得扩展名

### 2.22 `// file`
1. 判断 alias.length 不为空，所谓 alias 就是路径别名，这个大家最常用的配置。如果不为空就再次注册 AliasPlugin，source 钩子 file，target 钩子为 internal-resolve；该插件的作用不再赘述。
2. 遍历 `aliasFields` 字段，为没给 aliasField 注册 AliasFiledPlugin 插件，source 钩子：file，target 钩子 internal-resolve。该插件前面叙述过，不再赘述。
3. 注册 NextPlugin，source 钩子：file，target 钩子：final-file；

### 2.23 `// final-file`
注册 `FileExistsPlugin`，source 钩子：final-file，target 钩子：existing-file ；该插件作用是通过 fs.stat 检查 rquest.path 对应的文件是否存在，如果不是就加入到 resolveContext.missingDependencies，否则加入 resolveContext.fileDependencies 中。

### 2.24 `// existing-file`
判断 symlinks 选项，默认 true。其作用开启时会把 symlink（软链接）解析成其对应的真实路径，上 (webpack.config.js.resolve.symlinks 传送门)[https://webpack.js.org/configuration/resolve/#resolvesymlinks] 默认 true，会注册以下插件：
1. 注册 SymlinkPlguin，source 钩子：existing-file，target 钩子：existing-file 本身，像个递归；
2. 注册 NextPlugin，souce 钩子：existing-file，target 钩子：resolve。

### 2.25 `// resolved`
1. 判断 restrictions 不为空，注册 RestrictionsPlugin，source 钩子：resolver.hooks.resolved，无 target 钩子。restrictions 是一组限制条件，最后限制解析所得的 path 符合规则，上 (webpack.config.js.resolve.restrictions 传送门)[https://webpack.js.org/configuration/resolve/#resolverestrictions]。 RestrictionsPlugin 的作用就是在验证是否符合条件，不符合条件就报错了。

2. 注册 `ResultPlugin`，source 钩子：resolver.hooks.resolved，无 target 钩子，这个钩子就是最后一个了。


### 2.26 用户插件注册
和 webpack 一样，调用插件实例的 apply 方法，传入 resolver 实例。另外还处理插件为 function 类型的情况。






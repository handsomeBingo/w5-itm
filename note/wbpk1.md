## 一、confused
1. module.variables 是什么东西？
2. Compilation.js this.applyModuleIds 方法 1841 行，这赋值的都是比 usedIdMax 小的数值，这不就有可能和 usedModule 的 id 重复么？还是说故意制造重复？
3. 为什么要在 Compilation.seal 方法中给 module、chunk 排序？
4. 为啥要创建 hash、module hash、chunk hash 这又个锤子用？
5. EnsureChunkConditonsPlugin 里面的 module.chunkCondition 是啥，代码里搜只有 ExternalPlugin 里实现了一个，这个玩意儿有啥用？
6. Compiler.options.output.futureEmitAssets 是啥意思？这个 futureEmitAssets 这个配置没有搜到；不过在 github 里面找到这么个 [issue](https://github.com/bugsnag/webpack-bugsnag-plugins/pull/29)大概意思是这个选项在 webpack5 会成为默认开启状态，这个玩意儿开启后会有个缓存判断、GC 优化、source 转 buffer 处理；这个应该是更优的解决方案，所以叫未来发射资源（下一代资源发射）；与之相对应的是，source.exitAt 这个方案，这个方案已经在 webpack4.29 里面作为兜底了，webpack5 以后默认启用 furtureEmitAssets 的方案；
## 二、webpack 启动构建过程

### 2.1 entryPlguin & compiler.hooks.make

entryPlugin 注册了 compiler.hooks.make 钩子，注册 make 钩子在其回调中通过获取传入刚刚创建的 compilation 对象，调用 compilation.addEntry() 的方式向编译中加入入口模块对象创建的 依赖：

```js
compiler.hooks.make.tapAsync("EntryPlugin", (compilation, callback) => {
 // addEntry 的结果是将 entry 加入到 compilation.factorizeQueue 中
 compilation.addEntry(context, dep, options, err => {
  callback(err);
 });
});
```

当 webpack 构建执行到 Compiler.prototype.compile 方法中，触发 compiler.hooks.make 就会触发 compilation.addEntry 方法；

### 2.2 compilation.addEntry() 方法

1compilation.addEntry 则是接收 entry 然后调用 `compilation._addEntryItem` 方法构建 entryData，接着调用 compilation.addModuleTree 方法根据 etnryData 中的 dependency.constructor 获取到创建模块需要的 moduleFactory （比如 NormalModuleFactory），然后调用 compilation.handleModuleCreation()，compilation.handleModuleCreation 内部调用 compilation.factorizeModule 方法，该方法就负责将数据和 handler 添加到 compilation.factorizeQueue 队列。

```js
addEntry(context, entry, optionsOrName, callback) {
 // TODO webpack 6 remove
 const options =
  typeof optionsOrName === "object"
   ? optionsOrName
   : { name: optionsOrName };

 this._addEntryItem(context, entry, "dependencies", options, callback);
}
```

到这里 entry 模块算是被加入到构建流了，接下来就是进入到模块的创建 -> 解析依赖 -> 创建依赖模块递归过程中。当然 webpack5 一改往日的回调递归的实现方式而采用了几个队列：



### 2.2 compilation 队列

1. webpack5 的几个队列：
 ```js
 // 格式：队列[ processor() 方法 ]
 -> ROOT: this.processDependenciesQueue[ this._processModuleDependencies() ]
   -> this.addModuleQueue[ this._addModule() ]
     -> this.factorizeQueue[ this._factorizeModule() ]
       -> this.buildQueue[ this._buildModule() ]
 ``` 
上面的这几个队列是通过 AsyncQueue.js 这个库提供的异步并发队列，这个队列与之前多进程构建的异步队列相同的点是：创建队列时指定该队列的消耗方法，队列内部实现向队列 add(item, callback) 即加入队列的操作时自动启动消耗队列的方法 `setImmediate(root._ensureProcessing)` 这里注意两个点，
1. 是 setImmediate 也就是 `root._ensureProcesssing` 方法被调用的时机；
2. 是被调用的消耗队列的方法是 `root._ensureProcessing`，这些队列间是亲子关系，每次消耗队列都是从 root 开始处理。好处是这些处理过程都是预置的，后面的构建只需要向对应的队列中 add 就可以自动触发构建流程，这个流程替代了原有 webpack4 中的递归解析依赖的过程。

8. webpack 在 compiler.hooks.make.callAsync() 触发时，触发 entryPlugin 插件，entryEntry里面调用 compilation.addEntry 之后，一通操作之后 this.factorizeModule 方法里面调用 this.factorizeQueue.add() 方法把入口 module 加入到 this.factorizeQueue 里面，进而触发 root 队列的 `root._ensureProcessing` 方法，里面会调用 this.processDependenciesQueue 的 processor 方法 `this._processModuleDependencies()`, 但是此时 this.processDependenciesQueue 里面是空的，就进入到处理 this.processDependenciesQueue 的子队列阶段，这个时候会 for of 循环，挨个调用子队列的 `_ensurePorcessing` 方法，也就是调用子队列的 processor，上面的队列关系可以看出 this.processDependenciesQueue 的子队列就是 this.addModuleQueue，这个过程类似个递归，addModuleQueue 也是空的，这个时候处理 addModuleQueue 的子队列 —— factrizeQueue，这个时候 factorizeQueue 里面有 entry 的，这个时候调用 `this._factorizeModule` 方法创建入口模块，进入到模块的生成阶段了;

9. `this._factorizeModule` 内部调用 factory.create 也就是 NormalModuleFactory.create 方法创建模块实例，nmf.create 方法主要作用就是触发 nmf.hooks.factorize 钩子，这个钩子是在 NMF 构造函数里面注册的，factorize 钩子触发会触发 nmf.hooks.resolve 钩子对 request 及其用到的 loader 的路径进行解析得到资源已经 loader 路径。然后在 nmf.hooks.afterResolve 钩子的回调中执行 createdModule = new NormalModule() 创建 NormalModule 实例，接着触发 nmf.hooks.module 钩子传入新创建的 createdModule 模块，createDate，resolveData，最后调用 callback(null, createdModule)；这个时候需要考虑这个 callback 是谁传进来的，答案是 factory.create(..., (err, result) => {..}) 调用时传入的，这个 callback 就拿到了 NormalModule 实例了，这个 callback 被调用后里面还会再调用 callback（alias cb_factroizeModule），`_factroizeModule` 是 factorizeQueue 的 processor 调用时接收到的回调，这个回调是 AsyncQueue 库里面在 `_startProcessing` 方法执行时传递给 processor 方法的，这个回掉里面主要是调用 `AsyncQueue.prototype._handleResult()` 方法的，这个 handleResult 会执行 add(item, callback) 时传入的 回调函数 callback —— this.factorizeModule(item, (err, factoryResult) => {...}) 执行时传入的回调（alias: cbFactorizeModule），cbFactorizeModule 执行主要是执行 compilation.addModule(newModule, (err, module) => {})； addModule 方法主要执行的是向 this.addModuleQueue 队列中添加项，与 factorize 阶段同理触发 addModuleQueue 的 processor `this._addModule()` 方法，这个方法的主要作用是根据 module.identifier 判断并尝试获取缓存，然后将 module 加入到 this.modules 和 `this._modules` 中；接着去执行addModuleQueue 时传入的回调函数（this.addModule(newModule, (err, module) => {....})） 传入的回调函数（alias: cbAddModule） 在 cbAddModule 回调中，建立 originModule.setResolvedModule、moduleGraph.setIssuerIfUnset 及其依赖的关系，也就是 compilation.moduleGraph，此前还会判断缓存，接着调用 `this._handleModuleBuildAndDependencies` 方法传入，这个方法内部主要是用于执行 this.buildModule(), buildModule 方法主要用于把 module 加入到 buildQueue 内部，进而触发 buildQueue 的 processor —— `this._buildModule`

10. request 是经过 webpack 内部拼接过 loader 以及其他内部的处理参数的 request，userRequest 是解析成绝对路径的用户 request，rawRequest 是用户代理里面写的模块路径比如 './src/index.js' 这种


         

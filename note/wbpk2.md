## 一、compiler 上的 FS

webpack/lib/webpack.js createCompiler 方法中的 new NodeEnvironmentPlugin：

```js
const createCompiler = rawOptions => {
 const compiler = new Compiler(options.context, options);
 
 // 创建 fs 信息的插件
 new NodeEnvironmentPlugin({
  infrastructureLogging: options.infrastructureLogging
 }).apply(compiler);
 
 // 用户插件 
 if (Array.isArray(options.plugins)) {
   // ....
 }
 // 其他初始化...
 return compiler;
};
```

NodeEnvironmentPlugin 插件细节：

```js
class NodeEnvironmentPlugin {
 constructor(options) {
  this.options = options;
 }

 apply(compiler) {
  compiler.inputFileSystem = new CachedInputFileSystem(fs, 60000);
  const inputFileSystem = compiler.inputFileSystem; // todo
  compiler.outputFileSystem = fs; // todo ?
  compiler.intermediateFileSystem = fs; // todo
  compiler.watchFileSystem = new NodeWatchFileSystem(
   compiler.inputFileSystem
  );
  compiler.hooks.beforeRun.tap("NodeEnvironmentPlugin", compiler => {
   if (compiler.inputFileSystem === inputFileSystem) {
    compiler.fsStartTime = Date.now();
    inputFileSystem.purge();
   }
  });
 }
}
```

这个插件在 用户插件前执行，其中涉及了以下 fs：
1. compiler.inputFileSystem = new CachedInputFileSystem(fs)
2. compiler.outputFileSystem = fs
3. compiler.intermediateFileSystem = fs
4. compiler.watchFileSystem = new NodeWatchFileSystem(compiler.inputFileSystem)

## 二、compiler.inputFileSystem


该文件系统的值为 CachedInputFileSystem 实例对象，该类型由 `enhanced-resolve/lib/CachedInputFileSystem` 模块导出。


## 三、 compiler.outputFileSystem


compiler.outputFileSystem = fs，fs 来自 `graceful-fs` 模块；


## 四、compiler.intermediateFileSystem
compiler.intermediateFileSystem 为中间产物文件系统，其值同样来自 `graceful-fs` 模块。这个文件系统在缓存系统中在 cacheOptions.store 为 pack 时注册 IdleFileCachePlugin 时注册 PackFileCacheStrategy 时传递给 PackFileCacheStrategy:
 ```
switch (cacheOptions.store) {
 case "pack": {

  new IdleFileCachePlugin(
   new PackFileCacheStrategy({
    fs: compiler.intermediateFileSystem,
    // ....
  ).apply(compiler);
  break;
 }
 default:
  throw new Error("Unhandled value for cache.store");
}
```

在 PackFileCacheStrategy 的构造函数中有以下两处应用：

```js
class PackFileCacheStrategy {

 constructor({
  compiler,
  fs,
 
 }) {
  this.fileSerializer = createFileSerializer(
   fs,
   compiler.options.output.hashFunction
  );
  this.fileSystemInfo = new FileSystemInfo(fs, {
   managedPaths: snapshot.managedPaths,
   immutablePaths: snapshot.immutablePaths,
   logger: logger.getChildLogger("webpack.FileSystemInfo"),
   hashFunction: compiler.options.output.hashFunction
  });
```

1. 创建 this.fileSerializer 对象
2. 创建 this.fileSystemInfo 对象

### 3.1 this.fileSerializer
该属性是 PackFileCacheStrategy 的私有属性，其值为 createFileSerializer 方法的返回值：

```js
 this.fileSerializer = createFileSerializer(
   fs,
   compiler.options.output.hashFunction
  );
```

该方法接收两个参数:
1. fs
2. compiler.options.output.hashFunction

#### 3.1.1 createFileSerializer

这个方法是由  `webpack/lib/util/serialization.js` 模块导出的成员方法，该方法简化如下：
该方法中我们只研究和 fs 有关的部分，其余部分暂时忽略：

```js
module.exports = {
 // other member methods
 createFileSerializer: (fs, hashFunction) => {
  const FileMiddleware = require("../serialization/FileMiddleware");
  const fileMiddleware = new FileMiddleware(fs, hashFunction);

  return new Serializer([
   // ... other middlewares
   fileMiddleware
  ]);
 }
};
```

#### 3.1.2 FileMiddleware
该类型由 `webpack/lib/serialization/FileMiddleware.js` 模块导出，是`缓存文件`中间件；

+ 构造函数参数：
    1. fs 文件系统，上面的 compiler.intermediateFileSystem 就是传到这里的
    2. hashFunction，同理前面传的，兜底 md4
+ 重要成员方法：
    1. serialize 序列化
    2. deserialize 反序列化
+ 作用：
  该类型提供了对文件的序列化和反序列化，期间借助 fs 的能力；

```
class FileMiddleware extends SerializerMiddleware {

 constructor(fs, hashFunction = "md4") {
  super();
  this.fs = fs;
  this._hashFunction = hashFunction;
 }

 serialize(data, context) {
  
 }


 deserialize(data, context) {
  
 }
}
```

##### 3.1.2.1 deserialize 阶段
1. this.fs.stat
2. this.fs.open
3. this.fs.read

##### 3.1.2.2 serialize 阶段
1. this.fs.mkdir
2. this.fs.createWriteStream
3. this.fs.rename



### 3.2 this.fileSystemInfo

fileSystemInfo 是策略里面专门用于处理快照的解析、校验等工作的类，来自：`webpack/lib/FileSystemInfo.js` 模块；其中用到了以下 fs 的方法：

1. createResolver({ fileSystem: this.fs })
2. this.fs.realpath
3. this.fs.dirname(fs,absPath) fs 无
4. this.fs.relative(fs, rootPath, targetPath) fs 无
5. this.fs.readFile(path)
6. this.fs.join(fs, rootPath, filename) fs 无
7. this.fs.stat(path, cb)



## 五、graceful-fs
来自 node_modules/graceful-fs 模块，是原生 fs 模块的替代方案，其中做了跨平台的一致性处理和错误弹性处理。

其核心主入口问题：graceful-fs/graceful-fs.js 模块；

```js
module.exports = patch(clone(fs))
```
1. 克隆 fs 原生模块
2. patch 克隆所得的fs复制品

## 六、方案

### 6.1 初步方案
改写 graceful-fs 中的用到的这些方法需要做以下工作：
1. 设法传入当前 context 目录
2. 改写上面用到的方法，在方法调用前给相对路径拼接 context


### 6.2 风险点
那些没有调用但是仍然需要路径的方法如何确保为绝对路径？
1. 全量改写？
2. 有没有装饰器或者通用拦截的玩意儿？













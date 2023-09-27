1. 插件改写 path 时机 before resolved 或者 resolved 是否可可以
2. loader-runner 中通过 require() 加载 loader
3. _doBuild() callback 中 checkDependencies 时强制校验绝对路径失败，是否还要改写 fileSystemInfo.createSnapshot？

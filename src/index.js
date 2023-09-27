import oj from '/src/ok'
import { sum } from 'Src/some-dir/a'
// export * as ns from 'Src/some-dir/b'
// const foo = require('module-foo'); // webpack-virtual-modules 插件测试代码
// import g from 'qiang-sheng-group' // 测试 internal request 用的模块 #xiaolong
// import { findOk } from './some-dir/f'; 就是因为 index.js 引用了 f.js 这个模块，导致我在 webpack.config.js 中试图把被引用多次的 f 模块单独打成一个 chunk 失败，之所有有这个问题应该是 index.js 对应的 bundle1.js 这个父 chunk 中引用了 f.js，导致在 compilation.hooks.optimizeChunkBasic 钩子触发时被 RemoveParentsChunksPlugin 给移除掉了，我看他里面会查找模块如果在父 chunk 中，自己就用父 chunk 的，所以导致后面异步的 b c 两个chunk 没有 f.js 这个模块了。所以就更别提单独拆分出来了

// console.log(findOk());

// console.log(foo); // webpack-virtual-modules 插件测试代码
console.log(sum(1, 2));
console.log(oj);
// console.log(g);


// function testD (x, y, z) {
//   console.log(x, y, z)
// }

// 测试 parser.hooks.preStatement.call 触发时 CompatibilityPlugin 做的工作
// function __webpack_require__(x, y) {
//   console.log(x, y)
// }
//
// __webpack_require__(1, 2)

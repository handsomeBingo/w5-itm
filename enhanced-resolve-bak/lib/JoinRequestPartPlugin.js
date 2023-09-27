/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */

const namespaceStartCharCode = "@".charCodeAt(0);

module.exports = class JoinRequestPartPlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {string | ResolveStepHook} target target
	 */
	constructor(source, target) {
		this.source = source;
		this.target = target;
	}

	/**
	 * @param {Resolver} resolver the resolver
	 * @returns {void}
	 */
	apply(resolver) {
		const target = resolver.ensureHook(this.target);
		resolver
			.getHook(this.source)
			.tapAsync(
				"JoinRequestPartPlugin",
				(request, resolveContext, callback) => {
					//  request 有长这样的： ./@jridgewell/trace-mapping
					const req = request.request || "";
					let i = req.indexOf("/", 3); // 所以就是从 ./@ 后面查找第一个 /

					if (i >= 0 && req.charCodeAt(2) === namespaceStartCharCode) { // @ 符号
						// 如果是带命名空间的要看在命名空间的第一个 / 后面是不是还有 /
						// 比如： ./@some-name/sug-module/sub2-m.js 这种，要找的是 sub2-m.js 前面的 /
						i = req.indexOf("/", i + 1);
					}

					let moduleName, remainingRequest, fullySpecified;
					if (i < 0) {
						// 没有第二个斜杠，都是 @namespace/ 的第一级子模块
						moduleName = req;
						remainingRequest = "."; // . 表示当前
						fullySpecified = false;
					} else {
						// 有第二个斜杠，说名是 @namespace/sub1 的子模块，也就是 @namespace 的孙子模块
						moduleName = req.slice(0, i); // 改写 moduleName 到第二个斜杠 ，@namespace/sub1 这个
						remainingRequest = "." + req.slice(i); // reaminingRequest 变成 ./sub2-module.js
						fullySpecified = request.fullySpecified;
					}
					// 重新构造 path、relativePath、request
					const obj = {
						...request,
						path: resolver.join(request.path, moduleName),
						relativePath:
							request.relativePath &&
							resolver.join(request.relativePath, moduleName),
						request: remainingRequest,
						fullySpecified
					};
					resolver.doResolve(target, obj, null, resolveContext, callback);
				}
			);
	}
};

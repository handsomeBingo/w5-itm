/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */

module.exports = class DirectoryExistsPlugin {
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
				"DirectoryExistsPlugin",
				(request, resolveContext, callback) => {
					const fs = resolver.fileSystem;
					const directory = request.path;
					// 判断 path 是否为 falsy 值，如果为假值就返回
					if (!directory) return callback();

					// fs.stat 验证路径
					fs.stat(directory, (err, stat) => {
						if (err || !stat) {
							// 如果有错或者没得到 stat 对象说明有问题
							// 把这个路径加入到 resolveContext.missingDependencies 中
							if (resolveContext.missingDependencies)
								resolveContext.missingDependencies.add(directory);
							if (resolveContext.log)
								resolveContext.log(directory + " doesn't exist");
							return callback();
						}
						if (!stat.isDirectory()) {
							// directory 路径不是个目录（比如是文件）
							// 把这个路径加入到 resolveContext.missingDependencies 中
							if (resolveContext.missingDependencies)
								resolveContext.missingDependencies.add(directory);
							if (resolveContext.log)
								resolveContext.log(directory + " is not a directory");
							return callback();
						}
						// 如果 resolveContext.fileDependencies 属性存在则收集当前目录
						if (resolveContext.fileDependencies)
							resolveContext.fileDependencies.add(directory);

						// 执行后续解析流程
						resolver.doResolve(
							target,
							request,
							`existing directory ${directory}`,
							resolveContext,
							callback
						);
					});
				}
			);
	}
};

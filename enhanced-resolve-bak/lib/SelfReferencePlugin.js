/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const DescriptionFileUtils = require("./DescriptionFileUtils");

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */

const slashCode = "/".charCodeAt(0);

module.exports = class SelfReferencePlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {string | string[]} fieldNamePath name path
	 * @param {string | ResolveStepHook} target target
	 */
	constructor(source, fieldNamePath, target) {
		this.source = source;
		this.target = target;
		this.fieldName = fieldNamePath;
	}

	/**
	 * @param {Resolver} resolver the resolver
	 * @returns {void}
	 */
	apply(resolver) {
		const target = resolver.ensureHook(this.target);
		resolver
			.getHook(this.source)
			.tapAsync("SelfReferencePlugin", (request, resolveContext, callback) => {
				if (!request.descriptionFilePath) return callback();

				const req = request.request;
				if (!req) return callback();

				// Feature is only enabled when an exports field is present
				// 当 package.json.exports 字段存在时才启用该特性
				// 获取 exports 字段对应的对象：
				const exportsField = DescriptionFileUtils.getField(
					request.descriptionFileData,
					this.fieldName
				);
				if (!exportsField) return callback();

				// 获取包的名字
				const name = DescriptionFileUtils.getField(
					request.descriptionFileData,
					"name"
				);
				if (typeof name !== "string") return callback();

				// 处理直接导入 包名 ： import gao from 'qiang-sheng-group'
				// 还有子路径： import tangxiaolong from 'qiang-sheng-group/tangxiaolong/some.js'
				if (
					req.startsWith(name) &&
					(req.length === name.length || // 包名
						req.charCodeAt(name.length) === slashCode) // 包名后面紧跟着 / 的就是子路径
				) {
					// 如果直接是包名：则 remainingRequest 就是 "."
					// 如果是子路径：则变成 ./除了包名以外剩下的路径
					const remainingRequest = `.${req.slice(name.length)}`;

					const obj = {
						...request,
						request: remainingRequest,
						path: /** @type {string} */ (request.descriptionFileRoot),
						relativePath: "."
					};

					// 继续解析：
					resolver.doResolve(
						target,
						obj,
						"self reference",
						resolveContext,
						callback
					);
				} else {
					return callback();
				}
			});
	}
};

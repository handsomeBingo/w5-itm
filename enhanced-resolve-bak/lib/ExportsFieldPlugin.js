/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Ivan Kopeykin @vankop
*/

"use strict";

const path = require("path");
const DescriptionFileUtils = require("./DescriptionFileUtils");
const forEachBail = require("./forEachBail");
const { processExportsField } = require("./util/entrypoints");
const { parseIdentifier } = require("./util/identifier");
const { checkImportsExportsFieldTarget } = require("./util/path");

/** @typedef {import("./Resolver")} Resolver */
/** @typedef {import("./Resolver").ResolveStepHook} ResolveStepHook */
/** @typedef {import("./util/entrypoints").ExportsField} ExportsField */
/** @typedef {import("./util/entrypoints").FieldProcessor} FieldProcessor */

module.exports = class ExportsFieldPlugin {
	/**
	 * @param {string | ResolveStepHook} source source
	 * @param {Set<string>} conditionNames condition names
	 * @param {string | string[]} fieldNamePath name path
	 * @param {string | ResolveStepHook} target target
	 */
	constructor(source, conditionNames, fieldNamePath, target) {
		this.source = source;
		this.target = target;
		this.conditionNames = conditionNames;
		this.fieldName = fieldNamePath;
		/** @type {WeakMap<any, FieldProcessor>} */
		this.fieldProcessorCache = new WeakMap();
	}

	/**
	 * @param {Resolver} resolver the resolver
	 * @returns {void}
	 */
	apply(resolver) {
		const target = resolver.ensureHook(this.target);
		resolver
			.getHook(this.source)
			.tapAsync("ExportsFieldPlugin", (request, resolveContext, callback) => {
				// When there is no description file, abort
				// 没有 package.json 跳过
				if (!request.descriptionFilePath) return callback();
				if (
					// When the description file is inherited from parent, abort
					// (There is no description file inside of this package)
					// 如果 package.json 是从父目录继承的，跳过
					request.relativePath !== "." ||
					request.request === undefined
				)
					return callback();

				const remainingRequest =
					request.query || request.fragment
						? (request.request === "." ? "./" : request.request) +
						  request.query +
						  request.fragment
						: request.request;
				/** @type {ExportsField|null} */
				// 获取 package.json.exports 字段值
				const exportsField = DescriptionFileUtils.getField(
					request.descriptionFileData,
					this.fieldName
				);
				if (!exportsField) return callback();

				if (request.directory) {
					return callback(
						new Error(
							`Resolving to directories is not possible with the exports field (request was ${remainingRequest}/)`
						)
					);
				}

				let paths;

				try {
					// We attach the cache to the description file instead of the exportsField value
					// because we use a WeakMap and the exportsField could be a string too.
					// Description file is always an object when exports field can be accessed.
					let fieldProcessor = this.fieldProcessorCache.get(
						request.descriptionFileData
					);
					if (fieldProcessor === undefined) {
						// 把 package.json 指定的 exports 对象处理成 fileProcessor 函数
						fieldProcessor = processExportsField(exportsField);
						this.fieldProcessorCache.set(
							request.descriptionFileData,
							fieldProcessor
						);
					}
					// 利用根据 request 和 条件得到最终的路径数组
					paths = fieldProcessor(remainingRequest, this.conditionNames);
				} catch (err) {
					if (resolveContext.log) {
						resolveContext.log(
							`Exports field in ${request.descriptionFilePath} can't be processed: ${err}`
						);
					}
					return callback(err);
				}

				if (paths.length === 0) {
					return callback(
						new Error(
							`Package path ${remainingRequest} is not exported from package ${request.descriptionFileRoot} (see exports field in ${request.descriptionFilePath})`
						)
					);
				}

				// 遍历 path 尝试

				forEachBail(
					paths,
					(p, callback) => {
						const parsedIdentifier = parseIdentifier(p);

						if (!parsedIdentifier) return callback();

						const [relativePath, query, fragment] = parsedIdentifier;

						const error = checkImportsExportsFieldTarget(relativePath);

						if (error) {
							return callback(error);
						}

						const obj = {
							...request,
							request: undefined,
							path: path.join(
								/** @type {string} */ (request.descriptionFileRoot), // 拼接当前包的 package.json 和模块相对路径 就是解析出来的绝对路径
								relativePath
							),
							relativePath,
							query,
							fragment
						};

						resolver.doResolve(
							target,
							obj,
							"using exports field: " + p,
							resolveContext,
							callback
						);
					},
					(err, result) => callback(err, result || null)
				);
			});
	}
};

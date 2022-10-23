"use strict";
/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NatsInstrumentation = void 0;
const api_1 = require("@opentelemetry/api");
const instrumentation_1 = require("@opentelemetry/instrumentation");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const utils = require("./utils");
const version_1 = require("./version");
/**
 * Nats instrumentation for Opentelemetry
 */
class NatsInstrumentation extends instrumentation_1.InstrumentationBase {
    constructor(_config = {}) {
        super("@opentelemetry/instrumentation-nats", version_1.VERSION, _config);
        this._config = _config;
        this._natsHelpers = {
            replySubjects: new Set(),
        };
    }
    init() {
        return new instrumentation_1.InstrumentationNodeModuleDefinition("nats", ["2.*"], (moduleExports, moduleVersion) => {
            api_1.diag.debug(`Applying nats patch for nats@${moduleVersion}`);
            const { headers } = moduleExports;
            // Grab helpers from nats moduleExports for wrappings in the future
            this._natsHelpers.headers = headers;
            this.ensureWrapped(moduleVersion, moduleExports, "connect", this.wrapConnect.bind(this));
            return moduleExports;
        }, (moduleExports, moduleVersion) => {
            if (moduleExports === undefined)
                return;
            this._unwrap(moduleExports, "connect");
            api_1.diag.debug(`Removing nats patch for nats@${moduleVersion}`);
        });
    }
    wrapConnect(originalFunc) {
        const instrumentation = this;
        const traps = {
            get: function get(target, prop) {
                switch (prop) {
                    case "subscribe":
                        return instrumentation.wrapSubscribe(target.subscribe);
                    case "publish":
                        return instrumentation.wrapPublish(target.publish);
                    case "request":
                        return instrumentation.wrapRequest(target.request);
                    default:
                        return target[prop];
                }
            },
        };
        return async function connect(opts) {
            const nc = await originalFunc(opts);
            return new Proxy(nc, traps);
        };
    }
    wrapSubscribe(originalFunc) {
        const instrumentation = this;
        return function subscribe(subject, opts) {
            const nc = this;
            const genSpanAndContextFromMessage = (m) => {
                // Extract propagation info from nats header
                const parentContext = api_1.propagation.extract(api_1.ROOT_CONTEXT, m.headers, utils.natsContextGetter);
                const span = instrumentation.tracer.startSpan(`${m.subject} process`, {
                    attributes: Object.assign(Object.assign({}, utils.traceAttrs(nc.info, m)), { [semantic_conventions_1.SemanticAttributes.MESSAGING_OPERATION]: "process", [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION_KIND]: "topic" }),
                    // If the message has a reply address, assume it's seeking
                    // a response from us
                    kind: m.reply ? api_1.SpanKind.SERVER : api_1.SpanKind.CONSUMER,
                }, parentContext);
                const ctx = api_1.trace.setSpan(parentContext, span);
                return [ctx, span];
            };
            if (opts === null || opts === void 0 ? void 0 : opts.callback) {
                const originalCallback = opts.callback;
                opts.callback = function wrappedCallback(err, msg) {
                    if (err) {
                        // If there was an error with Nats, bail early
                        originalCallback(err, msg);
                        return;
                    }
                    msg = instrumentation.setupMessage(msg, nc);
                    const [ctx, span] = genSpanAndContextFromMessage(msg);
                    try {
                        api_1.context.with(ctx, originalCallback, undefined, err, msg);
                        span.setStatus({
                            code: api_1.SpanStatusCode.OK,
                        });
                    }
                    catch (err) {
                        span.setStatus({
                            code: api_1.SpanStatusCode.ERROR,
                            message: err.message,
                        });
                        span.recordException(err);
                        throw err;
                    }
                    finally {
                        instrumentation.cleanupMessage(msg);
                        span.end();
                    }
                };
            }
            const sub = originalFunc.apply(this, [subject, opts]);
            if (opts === null || opts === void 0 ? void 0 : opts.callback) {
                // If we have a callback then sub is no longer an async iterator. No
                // need to wrap it. Just bail early
                // https://github.com/nats-io/nats.js#async-vs-callbacks
                return sub;
            }
            const wrappedInterator = (function wrappedInterator() {
                return __asyncGenerator(this, arguments, function* wrappedInterator_1() {
                    var e_1, _a;
                    try {
                        for (var sub_1 = __asyncValues(sub), sub_1_1; sub_1_1 = yield __await(sub_1.next()), !sub_1_1.done;) {
                            let m = sub_1_1.value;
                            m = instrumentation.setupMessage(m, nc);
                            // FixMe: Fix setting context once
                            // https://github.com/open-telemetry/opentelemetry-js-api/pull/123
                            // lands
                            const [_ctx, span] = genSpanAndContextFromMessage(m);
                            try {
                                yield yield __await(m);
                                span.setStatus({
                                    code: api_1.SpanStatusCode.OK,
                                });
                            }
                            catch (err) {
                                span.setStatus({
                                    code: api_1.SpanStatusCode.ERROR,
                                    message: err.message,
                                });
                                span.recordException(err);
                                throw err;
                            }
                            finally {
                                instrumentation.cleanupMessage(m);
                                span.end();
                            }
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (sub_1_1 && !sub_1_1.done && (_a = sub_1.return)) yield __await(_a.call(sub_1));
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                });
            })();
            Object.assign(wrappedInterator, sub);
            return wrappedInterator;
        };
    }
    wrapRequest(originalFunc) {
        const instrumentation = this;
        return async function request(subject, data, opts) {
            const nc = this;
            // FixMe: "request" is a non-standard operation. Should we use a diffrent
            // name/format for this span?
            const span = instrumentation.tracer.startSpan(`${subject} request`, {
                attributes: Object.assign({}, utils.baseTraceAttrs(nc.info)),
                kind: api_1.SpanKind.CLIENT,
            });
            try {
                const res = await api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), originalFunc, this, subject, data, opts);
                span.setStatus({ code: api_1.SpanStatusCode.OK });
                return res;
            }
            catch (err) {
                span.recordException(err);
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: err.message });
                throw err;
            }
            finally {
                span.end();
            }
        };
    }
    wrapPublish(originalFunc) {
        const instrumentation = this;
        return function publish(subject, data, options) {
            const nc = this;
            const isTemporaryDestination = instrumentation.isTemporaryDestination(subject);
            const destination = isTemporaryDestination ? "(temporary)" : subject;
            const span = instrumentation.tracer.startSpan(`${destination} send`, {
                attributes: Object.assign(Object.assign({}, utils.baseTraceAttrs(nc.info)), { [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION_KIND]: "topic", [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION]: destination, [semantic_conventions_1.SemanticAttributes.MESSAGING_TEMP_DESTINATION]: isTemporaryDestination, [semantic_conventions_1.SemanticAttributes.MESSAGING_MESSAGE_PAYLOAD_SIZE_BYTES]: data
                        ? data.length
                        : 0 }),
                kind: api_1.SpanKind.PRODUCER,
            });
            if (isTemporaryDestination) {
                span.setAttribute(semantic_conventions_1.SemanticAttributes.MESSAGING_CONVERSATION_ID, subject);
            }
            else if (options === null || options === void 0 ? void 0 : options.reply) {
                span.setAttribute(semantic_conventions_1.SemanticAttributes.MESSAGING_CONVERSATION_ID, options.reply);
            }
            const ctx = api_1.trace.setSpan(api_1.context.active(), span);
            const h = (options === null || options === void 0 ? void 0 : options.headers)
                ? options.headers
                : instrumentation._natsHelpers.headers();
            api_1.propagation.inject(ctx, h, utils.natsContextSetter);
            try {
                api_1.context.with(ctx, originalFunc, this, subject, data, Object.assign(Object.assign({}, options), { headers: h }));
                span.setStatus({ code: api_1.SpanStatusCode.OK });
            }
            catch (err) {
                span.recordException(err);
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: err.message });
                throw err;
            }
            finally {
                span.end();
            }
        };
    }
    wrapRespond(originalFunc, nc) {
        const instrumentation = this;
        return function respond(data, options) {
            const msg = this;
            const destination = "(temporary)";
            const span = instrumentation.tracer.startSpan(`${destination} send`, {
                attributes: Object.assign(Object.assign({}, utils.baseTraceAttrs(nc.info)), { [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION_KIND]: "topic", [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION]: destination, [semantic_conventions_1.SemanticAttributes.MESSAGING_TEMP_DESTINATION]: true, [semantic_conventions_1.SemanticAttributes.MESSAGING_MESSAGE_PAYLOAD_SIZE_BYTES]: data
                        ? data.length
                        : 0, [semantic_conventions_1.SemanticAttributes.MESSAGING_CONVERSATION_ID]: msg.reply }),
                kind: api_1.SpanKind.PRODUCER,
            });
            const ctx = api_1.trace.setSpan(api_1.context.active(), span);
            const h = msg.headers
                ? msg.headers
                : instrumentation._natsHelpers.headers();
            api_1.propagation.inject(ctx, h, utils.natsContextSetter);
            try {
                api_1.context.with(ctx, originalFunc, this, data, Object.assign(Object.assign({}, options), { headers: h }));
                span.setStatus({ code: api_1.SpanStatusCode.OK });
            }
            catch (err) {
                span.recordException(err);
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: err.message });
                throw err;
            }
            finally {
                span.end();
            }
        };
    }
    isTemporaryDestination(subject) {
        return this._natsHelpers.replySubjects.has(subject);
    }
    setupMessage(msg, nc) {
        const instrumentation = this;
        if (msg.reply) {
            // Add this reply subject to tracked list. When/if we then respond
            // to this reply we will know this is a response rather than
            // publishing to a presisted subject
            this._natsHelpers.replySubjects.add(msg.reply);
        }
        const traps = {
            get: function get(target, prop) {
                if (prop === "respond") {
                    return instrumentation.wrapRespond(target.respond, nc);
                }
                return target[prop];
            },
        };
        return new Proxy(msg, traps);
    }
    cleanupMessage(msg) {
        if (msg.reply) {
            // Remove temp reply addresses from memory
            this._natsHelpers.replySubjects.delete(msg.reply);
        }
    }
    ensureWrapped(moduleVersion, obj, methodName, wrapper) {
        api_1.diag.debug(`Applying ${methodName} patch for nats@${moduleVersion}`);
        if (instrumentation_1.isWrapped(obj[methodName])) {
            this._unwrap(obj, methodName);
        }
        this._wrap(obj, methodName, wrapper);
    }
}
exports.NatsInstrumentation = NatsInstrumentation;
//# sourceMappingURL=instrumentation.js.map
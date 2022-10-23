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
Object.defineProperty(exports, "__esModule", { value: true });
exports.natsContextSetter = exports.natsContextGetter = exports.traceAttrs = exports.baseTraceAttrs = void 0;
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
function baseTraceAttrs(info) {
    const attributes = {
        [semantic_conventions_1.SemanticAttributes.MESSAGING_SYSTEM]: 'nats',
        [semantic_conventions_1.SemanticAttributes.MESSAGING_PROTOCOL]: 'nats',
    };
    if (info) {
        attributes[semantic_conventions_1.SemanticAttributes.MESSAGING_PROTOCOL_VERSION] = info.version;
        attributes[semantic_conventions_1.SemanticAttributes.NET_PEER_NAME] = info.host;
        attributes[semantic_conventions_1.SemanticAttributes.NET_PEER_PORT] = `${info.port}`;
        if (info.client_ip) {
            attributes[semantic_conventions_1.SemanticAttributes.NET_PEER_IP] = info.client_ip;
        }
    }
    return attributes;
}
exports.baseTraceAttrs = baseTraceAttrs;
function traceAttrs(info, m) {
    const attributes = Object.assign(Object.assign({}, baseTraceAttrs(info)), { [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION]: m.subject, [semantic_conventions_1.SemanticAttributes.MESSAGING_MESSAGE_PAYLOAD_SIZE_BYTES]: m.data
            ? m.data.length
            : 0 });
    if (m.reply) {
        attributes[semantic_conventions_1.SemanticAttributes.MESSAGING_CONVERSATION_ID] = m.reply;
    }
    return attributes;
}
exports.traceAttrs = traceAttrs;
exports.natsContextGetter = {
    keys(h) {
        if (h == null)
            return [];
        // MsgHdrs type is missing "keys" function. But exists in implementation
        // https://github.com/nats-io/nats.deno/blob/c560da31ffa17601ec2e56fee0aa351d8c6a0d07/nats-base-client/headers.ts#L191-L197
        return h.keys();
    },
    get(h, key) {
        if (h == null)
            return undefined;
        const res = h.get(key);
        return res === '' ? undefined : res;
    },
};
exports.natsContextSetter = {
    set(h, key, value) {
        if (h == null)
            return;
        h.set(key, value);
    },
};
//# sourceMappingURL=utils.js.map
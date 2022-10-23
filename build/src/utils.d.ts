import { TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import type { ServerInfo, Msg, MsgHdrs } from 'nats';
export declare function baseTraceAttrs(info: ServerInfo | undefined): {
    [x: string]: string;
};
export declare function traceAttrs(info: ServerInfo | undefined, m: Msg): {
    [x: string]: string | number;
};
export declare const natsContextGetter: TextMapGetter<MsgHdrs>;
export declare const natsContextSetter: TextMapSetter<MsgHdrs>;
//# sourceMappingURL=utils.d.ts.map
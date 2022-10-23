import { InstrumentationBase, InstrumentationNodeModuleDefinition } from "@opentelemetry/instrumentation";
import type * as Nats from "nats";
import { NatsInstrumentationConfig } from "./types";
interface NatsHelpers {
    /** Tracks which subjects are reply addresses */
    replySubjects: Set<string>;
    headers?: () => Nats.MsgHdrs;
}
/**
 * Nats instrumentation for Opentelemetry
 */
export declare class NatsInstrumentation extends InstrumentationBase<typeof Nats> {
    protected _config: NatsInstrumentationConfig;
    constructor(_config?: NatsInstrumentationConfig);
    _natsHelpers: NatsHelpers;
    init(): InstrumentationNodeModuleDefinition<typeof Nats>;
    private wrapConnect;
    private wrapSubscribe;
    private wrapRequest;
    private wrapPublish;
    private wrapRespond;
    private isTemporaryDestination;
    private setupMessage;
    private cleanupMessage;
    ensureWrapped(moduleVersion: string | undefined, obj: any, methodName: string, wrapper: (original: any) => any): void;
}
export {};
//# sourceMappingURL=instrumentation.d.ts.map
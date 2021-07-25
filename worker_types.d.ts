import { DurableObjectNamespace } from './deps.ts';

export interface WorkerEnv {
    readonly memoryNamespace: DurableObjectNamespace;
}

export interface DurableObjectEnv {
    readonly memoryNamespace: DurableObjectNamespace;
}

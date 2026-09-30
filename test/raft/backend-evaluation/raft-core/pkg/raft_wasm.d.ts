/* tslint:disable */
/* eslint-disable */
export function wasm_start(): void;
export function propose_conf_change_v2(handle: number, cc: any): void;
export function apply_conf_change(handle: number, cc: any): any;
export function decode_conf_change_entry(entry_type: number, data?: string | null): any;
export function conf_state(handle: number): any;
export function set_conf_state(handle: number, cs: any): void;
export function persist_commit_index(handle: number, commit: string): void;
export function export_persisted_state(handle: number): any;
export function wasm_memory_bytes(): number;
export function handle_count(): number;
export function step(handle: number, msg: any): void;
export function propose(handle: number, data: Uint8Array): void;
export function tick(handle: number): void;
export function has_ready(handle: number): boolean;
export function take_ready(handle: number): any;
export function persist_ready(handle: number): void;
export function advance_append(handle: number): any;
export function advance_apply(handle: number): void;
export function advance(handle: number): void;
export function campaign(handle: number): void;
export function status(handle: number): any;
export function create_node(opts: any): number;
export function seed_storage(handle: number, bootstrap: any): void;
export function free(handle: number): void;

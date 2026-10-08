import { HTMLElement } from './dom.ts';
import type { LoadWalkerContext } from './api.ts';
import type { BufferSource } from './util.ts';
export declare class Image {
    #private;
    src: string;
    buffer: Uint8Array | undefined;
    width: number;
    height: number;
    status: 'unloaded' | 'loading' | 'loaded' | 'error';
    reason: unknown;
    decoded: unknown;
    constructor(src: string, source?: BufferSource);
    onLoaded(): void;
    onError(error: unknown): void;
    tryObjectUrl(url: URL): BufferSource | undefined;
    load(): Promise<void>;
    loadSync(): void;
}
export declare function clearImageCache(): void;
export declare function getImage(src: string): Image | undefined;
export declare function checkCache(): void;
export declare function onLoadWalkerElementForImage(ctx: LoadWalkerContext, el: HTMLElement): void;

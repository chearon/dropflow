let getBufferImpl;
export function getBuffer(path) {
    if (!getBufferImpl)
        throw new Error('Call setGetBufferImpl in the entry point');
    return getBufferImpl(path);
}
export function setGetBufferImpl(fn) {
    getBufferImpl = fn;
}

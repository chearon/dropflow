let getBufferImpl: (path: string) => Promise<ArrayBuffer>;

export function getBuffer(path: string) {
  if (!getBufferImpl) throw new Error('Call setGetBufferImpl in the entry point');
  return getBufferImpl(path);
}

export function setGetBufferImpl(fn: typeof getBufferImpl) {
  getBufferImpl = fn;
}

/**
 * Wraps a promise or thenable (PromiseLike) with a timeout.
 */
export const withTimeout = <T>(promise: PromiseLike<T> | Promise<T>, timeoutMs = 10000): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('network_timeout: 요청 처리 시간이 초과되었습니다. 네트워크 상태를 점검해 주세요.'));
    }, timeoutMs);

    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
};

export class SingleFlight {
  constructor() {
    this.inFlight = new Map();
  }

  async do(key, worker) {
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const promise = Promise.resolve()
      .then(worker)
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }
}

export async function mapPool(items, concurrency, mapper) {
  const list = [...items];
  let index = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), list.length || 1) }, async () => {
    while (index < list.length) {
      const item = list[index];
      index += 1;
      await mapper(item);
    }
  });
  await Promise.all(workers);
}

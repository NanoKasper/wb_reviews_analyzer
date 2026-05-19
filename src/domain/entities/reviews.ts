export class Review {
  constructor(private readonly raw: Record<string, unknown>) {}

  getRaw(): Record<string, unknown> {
    return { ...this.raw };
  }

  get<T = unknown>(key: string): T | undefined {
    return this.raw[key] as T | undefined;
  }

  toJSON(): Record<string, unknown> {
    return this.getRaw();
  }
}
export type Node<T> = {
  value: T;
  next?: Node<T>;
};

export class Queue<T> {
  private head?: Node<T>;
  private tail?: Node<T>;
  private _size: number = 0;

  pushTail(value: T): void {
    const item: Node<T> = {
      value,
    };
    if (!this.head) {
      this.head = item;
    }
    if (this.tail) {
      this.tail.next = item;
    }
    this.tail = item;
    ++this._size;
  }

  popHead(): T | undefined {
    if (this.head) {
      const { value } = this.head;
      this.head = this.head.next;
      --this._size;
      if (this._size === 0) {
        this.tail = undefined;
      }
      return value;
    }
    return;
  }

  public get headValue(): T | undefined {
    return this.head?.value;
  }

  public get tailValue(): T | undefined {
    return this.tail?.value;
  }

  public get size(): number {
    return this._size;
  }

  // Iterator
  [Symbol.iterator](): Iterator<T> {
    let current = this.head;
    return {
      next: () => {
        if (current) {
          const { value } = current;
          current = current.next;
          return { value, done: false };
        }
        return { done: true, value: undefined };
      },
    };
  }
}

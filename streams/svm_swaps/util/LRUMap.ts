class LRUMapNode<K, V> {
  value: V;
  next: K | null = null;
  prev: K | null = null;
  constructor(value: V) {
    this.value = value;
  }
}

export class LRUMap<K, V> {
  private tail: K | null = null;
  private head: K | null = null;
  private map: Map<K, LRUMapNode<K, V>> = new Map();

  constructor(private capacity: number) {}

  get size() {
    return this.map.size;
  }

  set(k: K, v: V) {
    if (this.map.has(k)) {
      this.pop(k);
    } else if (this.map.size === this.capacity) {
      this.pop(this.tail!);
    }
    const newNode: LRUMapNode<K, V> = {
      next: null,
      prev: this.head,
      value: v,
    };
    if (this.head) {
      const oldHead = this.map.get(this.head);
      oldHead!.next = k;
    }
    this.head = k;
    if (!this.tail) {
      this.tail = k;
    }
    this.map.set(k, newNode);
  }

  get(k: K): V | null {
    // Retrieving an item places it back at the head
    const v = this.pop(k);
    if (v) {
      this.set(k, v);
    }
    return v;
  }

  pop(k: K): V | null {
    const existing = this.map.get(k);
    if (existing) {
      // Update links
      if (existing.next) {
        const next = this.map.get(existing.next);
        next!.prev = existing.prev;
      } else {
        this.head = existing.prev;
      }
      if (existing.prev) {
        const prev = this.map.get(existing.prev);
        prev!.next = existing.next;
      } else {
        this.tail = existing.next;
      }
      // Remove the element
      this.map.delete(k);
    }
    return existing?.value || null;
  }
}

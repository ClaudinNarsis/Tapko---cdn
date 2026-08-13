import { describe, it, expect, vi } from 'vitest';

// FeedbackQueueManager.enqueue() rebuilds feedbackData field-by-field before
// storing it in IndexedDB. It previously whitelisted title/description/
// screenshot/annotationData/logs/networkLogs/context/idempotencyKey/
// projectId/userId but omitted `priority`, so the /high /medium /low inline
// command (CommentCard.submit -> feedbackData.priority) was silently dropped
// on the queued (primary, IndexedDB-backed) submission path even though it
// reached this call with priority set correctly.
vi.mock('../src/db/IndexedDBWrapper.js', () => {
  return {
    default: class MockIndexedDBWrapper {
      static isSupported() {
        return true;
      }
      constructor() {
        this.items = new Map();
      }
      async init() {}
      async count() {
        return this.items.size;
      }
      async getAll() {
        return Array.from(this.items.values());
      }
      async put(item) {
        this.items.set(item.id, item);
      }
      async get(id) {
        return this.items.get(id);
      }
    }
  };
});

const { default: FeedbackQueueManager } = await import('../src/managers/FeedbackQueueManager.js');

describe('FeedbackQueueManager.enqueue — priority passthrough', () => {
  it('preserves priority on the queued feedbackData', async () => {
    const manager = new FeedbackQueueManager({ userId: 'u1', projectId: 'p1' });
    await manager.init();

    const id = await manager.enqueue({
      title: 'Button broken',
      description: 'the button is broken',
      context: {},
      idempotencyKey: 'k1',
      projectId: 'p1',
      userId: 'u1',
      priority: 'high'
    });

    const stored = await manager.db.get(id);
    expect(stored.feedbackData.priority).toBe('high');
  });

  it('omits priority when none was set (no /command typed)', async () => {
    const manager = new FeedbackQueueManager({ userId: 'u1', projectId: 'p1' });
    await manager.init();

    const id = await manager.enqueue({
      title: 'Button broken',
      description: 'the button is broken',
      context: {},
      idempotencyKey: 'k2',
      projectId: 'p1',
      userId: 'u1'
    });

    const stored = await manager.db.get(id);
    expect(stored.feedbackData.priority).toBeUndefined();
  });
});

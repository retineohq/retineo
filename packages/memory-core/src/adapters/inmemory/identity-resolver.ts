import type { ObjectId } from '../../domain/ids.js';
import type { IdentityResolver } from '../../ports/repositories.js';

export class InMemoryIdentityResolver implements IdentityResolver {
  private redirects = new Map<ObjectId, ObjectId>();

  resolve(id: ObjectId): ObjectId {
    let current = id;
    const visited = new Set<ObjectId>();
    while (this.redirects.has(current)) {
      if (visited.has(current)) {
        throw new Error(`Circular redirect detected: ${id}`);
      }
      visited.add(current);
      current = this.redirects.get(current)!;
    }
    return current;
  }

  merge(fromId: ObjectId, intoId: ObjectId): void {
    const resolvedFrom = this.resolve(fromId);
    const resolvedInto = this.resolve(intoId);
    if (resolvedFrom === resolvedInto) {
      throw new Error('Cannot merge object into itself');
    }
    this.redirects.set(resolvedFrom, resolvedInto);
  }
}

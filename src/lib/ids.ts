// UUID v7 — time-sortable, collision-resistant, decoupled from MongoDB ObjectIds.
import { v7 as uuidv7 } from 'uuid';

export function newId(): string {
  return uuidv7();
}

import { InvalidProductIdError } from "../errors/Domainerrors";

export type ProductId = string & { readonly __brand: 'ProductId' };

export function asProductId(id: string): ProductId {
  if (!id || typeof id !== 'string') {
    throw new InvalidProductIdError(id || 'undefined');
  }
  return id as ProductId;
}
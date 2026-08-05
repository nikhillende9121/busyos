import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";

export const productImageRepository = {
  countByProduct(productId: bigint) {
    return prisma.productImage.count({ where: { productId } });
  },

  findAllForProduct(productId: bigint) {
    return prisma.productImage.findMany({
      where: { productId },
      orderBy: { sortOrder: "asc" },
    });
  },

  findByIdForProduct(productId: bigint, id: bigint) {
    return prisma.productImage.findFirst({ where: { id, productId } });
  },

  // Appends after the current highest sortOrder — 0 for the first image on
  // a product.
  async nextSortOrder(productId: bigint): Promise<number> {
    const last = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: "desc" },
    });
    return last ? last.sortOrder + 1 : 0;
  },

  create(data: { productId: bigint; publicId: string; sortOrder: number }) {
    return prisma.productImage.create({ data });
  },

  remove(id: bigint) {
    return prisma.productImage.delete({ where: { id } });
  },

  // "Make primary" swaps sortOrder with the current primary rather than
  // rewriting every row's position — see product-image.service.ts.
  swapSortOrder(
    tx: Db,
    idA: bigint,
    sortOrderA: number,
    idB: bigint,
    sortOrderB: number,
  ): Promise<[unknown, unknown]> {
    return Promise.all([
      tx.productImage.update({ where: { id: idA }, data: { sortOrder: sortOrderB } }),
      tx.productImage.update({ where: { id: idB }, data: { sortOrder: sortOrderA } }),
    ]);
  },
};

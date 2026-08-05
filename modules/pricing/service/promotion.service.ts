import { Prisma } from "@prisma/client";
import type { Coupon, CouponProduct, CouponCategory, Discount } from "@prisma/client";
import type { Db } from "@/shared/database/transaction-client";
import { discountRepository } from "../repository/discount.repository";
import { couponRepository } from "../repository/coupon.repository";
import { AppError } from "@/shared/errors/app-error";
import type { QuoteInput } from "../dto/promotion.dto";
import type { QuoteView, QuoteLineView, QuoteCouponView, QuoteLineDiscountView } from "../types/promotion.types";

type CouponWithLinks = Coupon & { products: CouponProduct[]; categories: CouponCategory[] };

export const promotionService = {
  // Pure computation, no writes — safe to call as a checkout preview before
  // any Sale exists. See applyQuoteToSale for the persisting counterpart.
  async quote(input: QuoteInput): Promise<QuoteView> {
    const now = new Date();

    // Subtotal is computed up front (cheap, no DB calls) so minPurchaseAmount
    // can be checked before doing any per-line discount work — an
    // unqualifying or inapplicable coupon should fail fast.
    const subtotal = input.lines.reduce(
      (sum, line) => sum.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
      new Prisma.Decimal(0),
    );

    let coupon: CouponWithLinks | null = null;
    if (input.couponCode) {
      coupon = await couponRepository.findActiveByCode(input.tenantId, input.couponCode, now);
      if (!coupon) {
        throw new AppError("VALIDATION_ERROR", `Coupon "${input.couponCode}" is not valid`);
      }
      assertCouponContextMatches(coupon, input);
      // Checked against the PRE-discount subtotal — checking it
      // post-discount would let another discount be used to artificially
      // clear the coupon's minimum threshold.
      if (coupon.minPurchaseAmount !== null && subtotal.lessThan(coupon.minPurchaseAmount)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Order does not meet the minimum purchase amount for coupon "${input.couponCode}"`,
        );
      }
    }

    const lineViews: QuoteLineView[] = [];
    let lineReductionTotal = new Prisma.Decimal(0);
    let couponLineAmountTotal = new Prisma.Decimal(0);
    let couponMatchedAnyLine = false;

    for (const line of input.lines) {
      const unitPrice = new Prisma.Decimal(line.unitPrice);
      const quantity = new Prisma.Decimal(line.quantity);
      const lineSubtotal = unitPrice.mul(quantity);

      const applicable = await discountRepository.findApplicableForProduct(input.tenantId, {
        warehouseId: input.warehouseId,
        customerGroupId: input.customerGroupId,
        customerId: input.customerId,
        productId: line.productId,
        categoryId: line.categoryId,
        now,
      });

      // Non-stackable: only the single highest-value one applies (computed
      // against the untouched lineSubtotal, since none has applied yet).
      // Stackable: applied sequentially in priority order, each computed
      // off the running (already-discounted) amount — see
      // Docs/business-rules/discounts-and-coupons.md -> Stacking Rules.
      const nonStackable = applicable.filter((d) => !d.stackable);
      const stackable = applicable.filter((d) => d.stackable).sort((a, b) => a.priority - b.priority);

      const lineDiscounts: QuoteLineDiscountView[] = [];
      let runningAmount = lineSubtotal;

      if (nonStackable.length > 0) {
        const best = pickBestDiscount(nonStackable, runningAmount);
        runningAmount = runningAmount.sub(best.amount);
        lineDiscounts.push({
          discountId: best.discount.id.toString(),
          name: best.discount.name,
          amount: best.amount.toString(),
        });
      }

      for (const discount of stackable) {
        const amount = computePromoAmount(discount.type, discount.value, discount.maxDiscountAmount, runningAmount);
        runningAmount = runningAmount.sub(amount);
        lineDiscounts.push({ discountId: discount.id.toString(), name: discount.name, amount: amount.toString() });
      }

      // A PRODUCT/CATEGORY-scoped coupon reduces only the lines it
      // matches, the same way a scoped Discount would — see
      // Docs/business-rules/discounts-and-coupons.md -> PRODUCT/CATEGORY
      // Coupon Scope. An ORDER-scope coupon is handled once, below, after
      // this loop, never here.
      if (coupon && coupon.scope !== "ORDER") {
        const matchesLine =
          coupon.scope === "PRODUCT"
            ? coupon.products.some((p) => p.productId === line.productId)
            : line.categoryId !== undefined && coupon.categories.some((c) => c.categoryId === line.categoryId);
        if (matchesLine) {
          const amount = computePromoAmount(coupon.type, coupon.value, coupon.maxDiscountAmount, runningAmount);
          runningAmount = runningAmount.sub(amount);
          lineDiscounts.push({ couponId: coupon.id.toString(), name: coupon.code, amount: amount.toString() });
          couponLineAmountTotal = couponLineAmountTotal.add(amount);
          couponMatchedAnyLine = true;
        }
      }

      lineReductionTotal = lineReductionTotal.add(lineSubtotal.sub(runningAmount));
      lineViews.push({
        productId: line.productId.toString(),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineSubtotal: lineSubtotal.toString(),
        discounts: lineDiscounts,
        lineTotal: runningAmount.toString(),
      });
    }

    let grandTotal = subtotal.sub(lineReductionTotal);
    let couponView: QuoteCouponView | null = null;

    if (coupon) {
      if (coupon.scope === "ORDER") {
        const amount = computePromoAmount(coupon.type, coupon.value, coupon.maxDiscountAmount, grandTotal);
        couponView = { couponId: coupon.id.toString(), code: coupon.code, amount: amount.toString() };
        grandTotal = grandTotal.sub(amount);
      } else {
        if (!couponMatchedAnyLine) {
          throw new AppError(
            "VALIDATION_ERROR",
            `Coupon "${coupon.code}" does not apply to any item in this order`,
          );
        }
        // grandTotal already reflects these reductions via lineReductionTotal
        // — don't subtract couponLineAmountTotal a second time.
        couponView = { couponId: coupon.id.toString(), code: coupon.code, amount: couponLineAmountTotal.toString() };
      }
    }

    return {
      lines: lineViews,
      subtotal: subtotal.toString(),
      lineDiscountTotal: lineReductionTotal.toString(),
      coupon: couponView,
      grandTotal: grandTotal.toString(),
    };
  },

  // Persists what quote() computed: a SaleDiscount row per line/order
  // discount, and — if a coupon was used — a race-safe CouponRedemption
  // (locks the coupon row first, then re-checks usage limits AND validity,
  // since time may have passed since the preview) plus, for an ORDER-scope
  // coupon only, its own order-level SaleDiscount row (a PRODUCT/CATEGORY-
  // scoped coupon's reductions were already recorded per matching line
  // above, via the same loop that handles Discounts). Must run inside the
  // same transaction as the Sale write it belongs to — see
  // Docs/business-rules/discounts-and-coupons.md -> Concurrency.
  async applyQuoteToSale(
    tx: Db,
    params: {
      tenantId: bigint;
      saleId: bigint;
      customerId?: bigint;
      quote: QuoteView;
      saleItemIdByProductId: Map<string, bigint>;
    },
  ): Promise<void> {
    for (const line of params.quote.lines) {
      const saleItemId = params.saleItemIdByProductId.get(line.productId);
      for (const discount of line.discounts) {
        await tx.saleDiscount.create({
          data: {
            tenantId: params.tenantId,
            saleId: params.saleId,
            saleItemId,
            discountId: discount.discountId ? BigInt(discount.discountId) : undefined,
            couponId: discount.couponId ? BigInt(discount.couponId) : undefined,
            amount: new Prisma.Decimal(discount.amount),
          },
        });
      }
    }

    if (!params.quote.coupon) {
      return;
    }

    const couponId = BigInt(params.quote.coupon.couponId);
    await couponRepository.lockCoupon(tx, couponId);

    const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: couponId } });
    const now = new Date();
    if (!coupon.isActive || coupon.startDate > now || (coupon.endDate !== null && coupon.endDate < now)) {
      throw new AppError("VALIDATION_ERROR", `Coupon "${coupon.code}" is no longer valid`);
    }
    if (coupon.usageLimitTotal !== null) {
      const total = await couponRepository.countRedemptions(tx, couponId);
      if (total >= coupon.usageLimitTotal) {
        throw new AppError("CONFLICT", `Coupon "${coupon.code}" has reached its usage limit`);
      }
    }
    if (coupon.usageLimitPerCustomer !== null && params.customerId !== undefined) {
      const byCustomer = await couponRepository.countRedemptionsByCustomer(tx, couponId, params.customerId);
      if (byCustomer >= coupon.usageLimitPerCustomer) {
        throw new AppError(
          "CONFLICT",
          `Coupon "${coupon.code}" has already been used the maximum number of times`,
        );
      }
    }

    await couponRepository.createRedemption(tx, {
      couponId,
      tenantId: params.tenantId,
      customerId: params.customerId,
      saleId: params.saleId,
      amountDiscounted: new Prisma.Decimal(params.quote.coupon.amount),
    });

    if (coupon.scope === "ORDER") {
      await tx.saleDiscount.create({
        data: {
          tenantId: params.tenantId,
          saleId: params.saleId,
          couponId,
          amount: new Prisma.Decimal(params.quote.coupon.amount),
        },
      });
    }
  },
};

function assertCouponContextMatches(coupon: Coupon, input: QuoteInput): void {
  const matchesContext =
    (coupon.warehouseId === null || coupon.warehouseId === input.warehouseId) &&
    (coupon.customerGroupId === null || coupon.customerGroupId === (input.customerGroupId ?? null)) &&
    (coupon.customerId === null || coupon.customerId === (input.customerId ?? null));
  if (!matchesContext) {
    throw new AppError("VALIDATION_ERROR", `Coupon "${coupon.code}" does not apply to this order`);
  }
}

function pickBestDiscount(
  candidates: Discount[],
  runningAmount: Prisma.Decimal,
): { discount: Discount; amount: Prisma.Decimal } {
  let best: { discount: Discount; amount: Prisma.Decimal } | null = null;
  for (const discount of candidates) {
    const amount = computePromoAmount(discount.type, discount.value, discount.maxDiscountAmount, runningAmount);
    if (!best || amount.greaterThan(best.amount)) {
      best = { discount, amount };
    }
  }
  return best as { discount: Discount; amount: Prisma.Decimal };
}

// Shared by Discount and Coupon (ORDER- or line-scoped): a percentage of
// the running amount, or a flat value; FREE_SHIPPING coupons contribute no
// line-total reduction since shipping isn't modeled yet; capped by
// maxDiscountAmount, then capped again so it never exceeds what's left to
// discount.
function computePromoAmount(
  type: "PERCENTAGE" | "FLAT" | "FREE_SHIPPING",
  value: Prisma.Decimal,
  maxDiscountAmount: Prisma.Decimal | null,
  runningAmount: Prisma.Decimal,
): Prisma.Decimal {
  let amount =
    type === "PERCENTAGE"
      ? runningAmount.mul(value).div(100)
      : type === "FLAT"
        ? new Prisma.Decimal(value)
        : new Prisma.Decimal(0);
  if (maxDiscountAmount !== null && amount.greaterThan(maxDiscountAmount)) {
    amount = new Prisma.Decimal(maxDiscountAmount);
  }
  if (amount.greaterThan(runningAmount)) {
    amount = runningAmount;
  }
  return amount;
}

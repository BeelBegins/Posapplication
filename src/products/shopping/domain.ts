export interface ShoppingModifierSelection {
  code: string;
  value: string;
}

export interface ShoppingCartLine {
  id: string;
  itemCode: string;
  itemName: string;
  imageUrl: string | null;
  quantity: number;
  uom: string;
  displayedRate: number;
  modifiers: ShoppingModifierSelection[];
}

export interface ShoppingCart {
  branch: string | null;
  lines: ShoppingCartLine[];
  updatedAt: string;
}

export interface ShoppingQuote {
  quoteToken: string;
  currency: string;
  subtotal: number;
  discount: number;
  taxes: number;
  deliveryCharge: number;
  grandTotal: number;
  expiresAt: string;
  lines: Array<{
    lineId: string;
    itemCode: string;
    quantity: number;
    rate: number;
    amount: number;
    available: boolean;
    message?: string;
  }>;
}

export interface ShoppingCheckoutInput {
  requestId: string;
  quoteToken: string;
  addressName: string;
  deliveryMethod: string;
  paymentMethod: string;
}

export interface ShoppingCheckoutAttempt {
  cartUpdatedAt: string;
  requestId: string;
}

const quantityPrecision = (value: number) => Math.round(value * 1000) / 1000;
const money = (value: number) => Math.round(value * 100) / 100;

export function emptyCart(now = new Date().toISOString()): ShoppingCart {
  return { branch: null, lines: [], updatedAt: now };
}

export function cartLineId(itemCode: string, modifiers: ShoppingModifierSelection[] = []): string {
  const variant = [...modifiers]
    .sort((a, b) => a.code.localeCompare(b.code) || a.value.localeCompare(b.value))
    .map((modifier) => `${modifier.code}=${modifier.value}`)
    .join("&");
  return variant ? `${itemCode}::${variant}` : itemCode;
}

export function addCartLine(cart: ShoppingCart, input: Omit<ShoppingCartLine, "id" | "quantity"> & { quantity?: number }, now = new Date().toISOString()): ShoppingCart {
  const quantity = quantityPrecision(input.quantity ?? 1);
  if (!input.itemCode.trim()) throw new Error("An item code is required.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Cart quantity must be greater than zero.");
  const id = cartLineId(input.itemCode, input.modifiers);
  const existing = cart.lines.find((line) => line.id === id);
  const next = existing
    ? cart.lines.map((line) => line.id === id ? { ...line, quantity: quantityPrecision(line.quantity + quantity), displayedRate: money(input.displayedRate) } : line)
    : [...cart.lines, { ...input, id, quantity, displayedRate: money(input.displayedRate), modifiers: input.modifiers.map((modifier) => ({ ...modifier })) }];
  return { ...cart, lines: next, updatedAt: now };
}

export function setCartQuantity(cart: ShoppingCart, lineId: string, quantity: number, now = new Date().toISOString()): ShoppingCart {
  const normalized = quantityPrecision(quantity);
  if (!Number.isFinite(normalized)) throw new Error("Cart quantity must be a number.");
  const lines = normalized <= 0
    ? cart.lines.filter((line) => line.id !== lineId)
    : cart.lines.map((line) => line.id === lineId ? { ...line, quantity: normalized } : line);
  return { ...cart, lines, updatedAt: now };
}

export function cartDisplaySubtotal(cart: ShoppingCart): number {
  return money(cart.lines.reduce((total, line) => total + line.displayedRate * line.quantity, 0));
}

export function ensureCheckoutAttempt(
  cart: ShoppingCart,
  saved: ShoppingCheckoutAttempt | null,
  createId: () => string
): ShoppingCheckoutAttempt {
  if (saved?.cartUpdatedAt === cart.updatedAt && saved.requestId.trim()) return saved;
  return { cartUpdatedAt: cart.updatedAt, requestId: createId() };
}

export function quoteMatchesCart(cart: ShoppingCart, quote: ShoppingQuote): boolean {
  if (cart.lines.length !== quote.lines.length) return false;
  return cart.lines.every((line) => {
    const quoted = quote.lines.find((candidate) => candidate.lineId === line.id);
    return Boolean(quoted && quoted.itemCode === line.itemCode && quoted.quantity === line.quantity && quoted.available);
  });
}

export function assertCheckoutReady(cart: ShoppingCart, quote: ShoppingQuote, input: ShoppingCheckoutInput, now = new Date()): void {
  if (!cart.lines.length) throw new Error("Your cart is empty.");
  if (!input.requestId.trim()) throw new Error("A checkout request ID is required for duplicate prevention.");
  if (!input.quoteToken.trim() || input.quoteToken !== quote.quoteToken) throw new Error("Refresh the cart totals before checkout.");
  if (!quoteMatchesCart(cart, quote)) throw new Error("Cart availability or quantities changed. Refresh the cart totals.");
  if (new Date(quote.expiresAt).getTime() <= now.getTime()) throw new Error("Cart pricing has expired. Refresh the cart totals.");
  if (!input.deliveryMethod.trim() || !input.paymentMethod.trim()) throw new Error("Delivery and payment method are required.");
  if (input.deliveryMethod !== "Store Pickup" && !input.addressName.trim()) throw new Error("A delivery address is required.");
}

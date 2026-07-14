export type RestaurantOrderStatus = "Open" | "Sent to Kitchen" | "Bill Requested" | "Closed" | "Cancelled";
export type KitchenTicketStatus = "Queued" | "Preparing" | "Ready" | "Served" | "Cancelled";

export interface RestaurantModifier {
  code: string;
  label: string;
  price: number;
}

export interface RestaurantOrderLine {
  id: string;
  itemCode: string;
  itemName: string;
  uom: string;
  quantity: number;
  sentQuantity: number;
  rate: number;
  notes: string;
  modifiers: RestaurantModifier[];
}

export interface RestaurantOrder {
  name: string;
  branch: string;
  floor: string;
  table: string;
  waiter: string;
  guestCount: number;
  status: RestaurantOrderStatus;
  lines: RestaurantOrderLine[];
  posInvoice: string | null;
  modified: string;
}

export interface KitchenTicket {
  name: string;
  order: string;
  requestId: string;
  status: KitchenTicketStatus;
  lines: Array<{ orderLineId: string; quantity: number; notes: string; modifiers: RestaurantModifier[] }>;
}

export function lineAmount(line: RestaurantOrderLine): number {
  const modifierRate = line.modifiers.reduce((total, modifier) => total + modifier.price, 0);
  return Math.round((line.rate + modifierRate) * line.quantity * 100) / 100;
}

export function orderTotal(order: RestaurantOrder): number {
  return Math.round(order.lines.reduce((total, line) => total + lineAmount(line), 0) * 100) / 100;
}

export function unsentQuantity(line: RestaurantOrderLine): number {
  return Math.max(0, Math.round((line.quantity - line.sentQuantity) * 1000) / 1000);
}

export function pendingKitchenLines(order: RestaurantOrder): RestaurantOrderLine[] {
  return order.lines.filter((line) => unsentQuantity(line) > 0);
}

export function createKitchenTicket(order: RestaurantOrder, requestId: string, ticketName = "LOCAL-KOT"): KitchenTicket {
  if (!requestId.trim()) throw new Error("Kitchen request ID is required for duplicate prevention.");
  if (order.status === "Closed" || order.status === "Cancelled") throw new Error(`Cannot send a ${order.status.toLowerCase()} order to the kitchen.`);
  const pending = pendingKitchenLines(order);
  if (!pending.length) throw new Error("There are no new quantities to send to the kitchen.");
  return {
    name: ticketName,
    order: order.name,
    requestId,
    status: "Queued",
    lines: pending.map((line) => ({
      orderLineId: line.id,
      quantity: unsentQuantity(line),
      notes: line.notes,
      modifiers: line.modifiers.map((modifier) => ({ ...modifier }))
    }))
  };
}

export function applyKitchenTicket(order: RestaurantOrder, ticket: KitchenTicket): RestaurantOrder {
  if (ticket.order !== order.name) throw new Error("Kitchen ticket belongs to another order.");
  const quantities = new Map(ticket.lines.map((line) => [line.orderLineId, line.quantity]));
  return {
    ...order,
    status: order.status === "Open" ? "Sent to Kitchen" : order.status,
    lines: order.lines.map((line) => ({
      ...line,
      sentQuantity: Math.min(line.quantity, line.sentQuantity + (quantities.get(line.id) ?? 0))
    }))
  };
}

export function canEditLine(order: RestaurantOrder, line: RestaurantOrderLine): boolean {
  return order.status !== "Closed" && order.status !== "Cancelled" && line.sentQuantity === 0;
}

export function requestBill(order: RestaurantOrder): RestaurantOrder {
  if (order.status === "Closed" || order.status === "Cancelled") throw new Error(`Cannot request a bill for a ${order.status.toLowerCase()} order.`);
  if (!order.lines.length) throw new Error("Cannot request a bill for an empty order.");
  if (pendingKitchenLines(order).length) throw new Error("Send all new items to the kitchen before requesting the bill.");
  return { ...order, status: "Bill Requested" };
}

export function closeOrder(order: RestaurantOrder, posInvoice: string): RestaurantOrder {
  if (order.status !== "Bill Requested") throw new Error("The bill must be requested before closing the table.");
  if (!posInvoice.trim()) throw new Error("A submitted POS Invoice is required to close the table.");
  return { ...order, status: "Closed", posInvoice };
}

export type RestaurantOrderStatus = "Open" | "Sent to Kitchen" | "Bill Requested" | "Closed" | "Cancelled";
export type KitchenTicketStatus = "Queued" | "Preparing" | "Ready" | "Served" | "Cancelled";
export type TableStatus = "Available" | "Occupied" | "Order pending" | "Sent to kitchen" | "Partially served" | "Bill requested" | "Payment pending" | "Needs attention";

export interface RestaurantModifier { code: string; label: string; price: number; }
export interface RestaurantOrderLine {
  id: string; itemCode: string; itemName: string; uom: string; quantity: number; sentQuantity: number;
  rate: number; notes: string; modifiers: RestaurantModifier[]; kitchenStatus?: KitchenTicketStatus | "Not sent";
  station?: string; addedAt?: string;
}
export interface RestaurantOrder {
  name: string; branch: string; floor: string; table: string; waiter: string; guestCount: number;
  status: RestaurantOrderStatus; lines: RestaurantOrderLine[]; posInvoice: string | null; modified: string;
  openedAt?: string;
}
export interface KitchenTicket {
  name: string; order: string; requestId: string; status: KitchenTicketStatus;
  lines: Array<{ orderLineId: string; quantity: number; notes: string; modifiers: RestaurantModifier[] }>;
}
export interface MenuItem {
  code: string; name: string; description: string; category: string; price: number; available: boolean;
  prepMinutes: number; vegetarian?: boolean; spicy?: boolean; popular?: boolean; recent?: boolean;
  station: string; modifiers?: Array<{ title: string; required?: boolean; multiple?: boolean; options: RestaurantModifier[] }>;
}
export interface RestaurantTable {
  id: string; title: string; floor: string; capacity: number; status: TableStatus; guests: number;
  waiter: string; orderName?: string; amount?: number; openedAt?: string;
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
  return { name: ticketName, order: order.name, requestId, status: "Queued", lines: pending.map((line) => ({
    orderLineId: line.id, quantity: unsentQuantity(line), notes: line.notes,
    modifiers: line.modifiers.map((modifier) => ({ ...modifier }))
  })) };
}
export function applyKitchenTicket(order: RestaurantOrder, ticket: KitchenTicket): RestaurantOrder {
  if (ticket.order !== order.name) throw new Error("Kitchen ticket belongs to another order.");
  const quantities = new Map(ticket.lines.map((line) => [line.orderLineId, line.quantity]));
  return { ...order, status: order.status === "Open" ? "Sent to Kitchen" : order.status, modified: new Date().toISOString(),
    lines: order.lines.map((line) => quantities.has(line.id) ? {
      ...line, sentQuantity: Math.min(line.quantity, line.sentQuantity + (quantities.get(line.id) ?? 0)), kitchenStatus: "Queued"
    } : line) };
}
export function canEditLine(order: RestaurantOrder, line: RestaurantOrderLine): boolean {
  return order.status !== "Closed" && order.status !== "Cancelled" && line.sentQuantity === 0;
}
export function requestBill(order: RestaurantOrder): RestaurantOrder {
  if (order.status === "Closed" || order.status === "Cancelled") throw new Error(`Cannot request a bill for a ${order.status.toLowerCase()} order.`);
  if (!order.lines.length) throw new Error("Cannot request a bill for an empty order.");
  if (pendingKitchenLines(order).length) throw new Error("Send all new items to the kitchen before requesting the bill.");
  return { ...order, status: "Bill Requested", modified: new Date().toISOString() };
}
export function closeOrder(order: RestaurantOrder, posInvoice: string): RestaurantOrder {
  if (order.status !== "Bill Requested") throw new Error("The bill must be requested before closing the table.");
  if (!posInvoice.trim()) throw new Error("A submitted POS Invoice is required to close the table.");
  return { ...order, status: "Closed", posInvoice, modified: new Date().toISOString() };
}
export function addMenuItem(order: RestaurantOrder, item: MenuItem, modifiers: RestaurantModifier[] = [], notes = "", quantity = 1): RestaurantOrder {
  if (!item.available) throw new Error(`${item.name} is unavailable.`);
  if (quantity <= 0 || !Number.isFinite(quantity)) throw new Error("Quantity must be greater than zero.");
  const signature = `${item.code}|${modifiers.map((x) => x.code).sort().join(",")}|${notes.trim()}`;
  const existing = order.lines.find((line) => line.sentQuantity === 0 && `${line.itemCode}|${line.modifiers.map((x) => x.code).sort().join(",")}|${line.notes.trim()}` === signature);
  const lines = existing ? order.lines.map((line) => line.id === existing.id ? { ...line, quantity: line.quantity + quantity } : line) : [...order.lines, {
    id: `line-${Date.now()}-${order.lines.length}`, itemCode: item.code, itemName: item.name, uom: "Nos", quantity,
    sentQuantity: 0, rate: item.price, notes: notes.trim(), modifiers: modifiers.map((x) => ({ ...x })), kitchenStatus: "Not sent" as const,
    station: item.station, addedAt: new Date().toISOString()
  }];
  return { ...order, lines, modified: new Date().toISOString() };
}
export function changeUnsentQuantity(order: RestaurantOrder, lineId: string, quantity: number): RestaurantOrder {
  const line = order.lines.find((x) => x.id === lineId);
  if (!line) throw new Error("Order item was not found.");
  if (!canEditLine(order, line)) throw new Error("Sent items cannot be edited directly.");
  const lines = quantity <= 0 ? order.lines.filter((x) => x.id !== lineId) : order.lines.map((x) => x.id === lineId ? { ...x, quantity } : x);
  return { ...order, lines, modified: new Date().toISOString() };
}
export function nextKitchenStatus(status: RestaurantOrderLine["kitchenStatus"]): RestaurantOrderLine["kitchenStatus"] {
  const flow: RestaurantOrderLine["kitchenStatus"][] = ["Queued", "Preparing", "Ready", "Served"];
  const index = flow.indexOf(status);
  return index < 0 ? status : flow[Math.min(index + 1, flow.length - 1)];
}
export function statusForOrder(order: RestaurantOrder): TableStatus {
  if (order.status === "Bill Requested") return "Bill requested";
  if (pendingKitchenLines(order).length) return "Order pending";
  if (order.lines.some((x) => x.kitchenStatus === "Ready") && order.lines.some((x) => x.kitchenStatus !== "Served")) return "Needs attention";
  if (order.lines.some((x) => x.kitchenStatus === "Served") && order.lines.some((x) => x.kitchenStatus !== "Served")) return "Partially served";
  if (order.lines.length) return "Sent to kitchen";
  return "Occupied";
}

/** Builds a hand-out sheet: orders grouped by the student's grade/class, plus the total of each item to pick. Pure. */
export interface PackingOrder {
  orderNumber: string;
  customerName: string;
  students: { name: string; grade: string }[];
  fulfillmentLabel: string;
  status: string;
  items: { name: string; variant: string; quantity: number }[];
}

export interface PackingGroup {
  grade: string;
  orders: PackingOrder[];
}

export interface PickLine {
  name: string;
  variant: string;
  quantity: number;
}

export const NO_CLASS = "No class given";

function gradeKey(o: PackingOrder): string {
  const grades = [...new Set(o.students.map((s) => s.grade.trim()).filter(Boolean))];
  return grades.length ? grades.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(" / ") : NO_CLASS;
}

export function buildPackingList(orders: PackingOrder[]): { groups: PackingGroup[]; totals: PickLine[]; orderCount: number; itemCount: number } {
  const map = new Map<string, PackingOrder[]>();
  for (const o of orders) {
    const k = gradeKey(o);
    map.set(k, [...(map.get(k) ?? []), o]);
  }
  const groups = [...map.entries()]
    .map(([grade, list]) => ({ grade, orders: list.sort((a, b) => a.customerName.localeCompare(b.customerName)) }))
    .sort((a, b) => (a.grade === NO_CLASS ? 1 : b.grade === NO_CLASS ? -1 : a.grade.localeCompare(b.grade, undefined, { numeric: true })));
  const totals = new Map<string, PickLine>();
  let itemCount = 0;
  for (const o of orders)
    for (const i of o.items) {
      const k = `${i.name}|${i.variant}`;
      const cur = totals.get(k) ?? { name: i.name, variant: i.variant, quantity: 0 };
      cur.quantity += i.quantity;
      totals.set(k, cur);
      itemCount += i.quantity;
    }
  return {
    groups,
    totals: [...totals.values()].sort((a, b) => a.name.localeCompare(b.name) || a.variant.localeCompare(b.variant, undefined, { numeric: true })),
    orderCount: orders.length,
    itemCount,
  };
}

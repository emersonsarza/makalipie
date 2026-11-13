import { randomUUID } from "node:crypto";
import { createServiceClient } from "../src/lib/admin/supabase";
import { manilaDate } from "../src/lib/catalog/rules";
import { applyOrderChange } from "../src/lib/orders/change";

const service = createServiceClient();
const today = manilaDate();
const tag = randomUUID().slice(0, 8);

async function header(id: string) {
  const row = await service.from("orders").select("id, updated_at, order_number, status, payment, fulfillment, delivery_fee_mode").eq("id", id).single();
  if (row.error || !row.data) throw row.error ?? new Error("missing order");
  return row.data;
}

async function place(patch: Record<string, unknown>, actor: "admin" | "public" = "admin") {
  const result = await applyOrderChange("place_order", {
    idempotencyKey: `cebu-demo-${tag}-${String(patch.customerName)}`,
    channel: "regular",
    locationId: "cebu",
    fulfillmentDate: today,
    fulfillment: "pickup",
    slotId: "11:00",
    notes: "",
    allowUnavailable: true,
    ...patch,
  }, actor);
  if (result.status !== 200) throw new Error(JSON.stringify({ patch, result }));
  return String((result.body as { orderId: string }).orderId);
}

async function transition(id: string, status: string) {
  const current = await header(id);
  const result = await applyOrderChange("transition_order", { orderId: id, updatedAt: current.updated_at, status }, "admin");
  if (result.status !== 200) throw new Error(JSON.stringify({ id, status, result }));
}

async function main() {
  const specs: Array<{
    label: string;
    actor?: "admin" | "public";
    patch: Record<string, unknown>;
    steps?: string[];
  }> = [
    {
      label: "pending unpaid pickup",
      actor: "public",
      patch: {
        slotId: "11:00",
        customerName: "Ava Tan",
        customerPhone: "09171230001",
        notes: "Call on arrival",
        lines: [
          { productId: "keylime", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 24000 },
          { productId: "pecan", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 24000 },
        ],
      },
    },
    {
      label: "pending unpaid delivery, fee unknown",
      actor: "public",
      patch: {
        fulfillment: "delivery",
        slotId: "12:00",
        deliveryAddress: "IT Park, Lahug, Cebu City",
        customerName: "Benji Cruz",
        customerPhone: "09281230002",
        notes: "Leave with guard",
        lines: [{ productId: "smores", sizeId: "4-inch", quantity: 3, unitPriceCentavos: 19000 }],
        addons: [{ id: "note-card", quantity: 1, unitPriceCentavos: 1500 }],
      },
    },
    {
      label: "pending paid delivery, fee unknown",
      patch: {
        fulfillment: "delivery",
        slotId: "13:00",
        deliveryAddress: "Banilad Town Centre, Cebu",
        customerName: "Celine Ong",
        customerPhone: "09181230003",
        lines: [
          { productId: "oreo", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 19000 },
          { productId: "banoffee", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 24000 },
        ],
      },
      steps: ["paid"],
    },
    {
      label: "pending unpaid delivery, known fee",
      patch: {
        fulfillment: "delivery",
        slotId: "14:00",
        deliveryAddress: "Ayala Center Cebu, Cebu City",
        deliveryFeeMode: "known",
        deliveryFeeCentavos: 8000,
        customerName: "Diego Ramos",
        customerPhone: "09391230004",
        notes: "Office lobby, 3pm",
        lines: [{ productId: "keylime", sizeId: "4-inch", quantity: 4, unitPriceCentavos: 24000 }],
        addons: [{ id: "birthday-topper", quantity: 1, unitPriceCentavos: 800 }],
      },
    },
    {
      label: "pending unpaid delivery, pays rider",
      patch: {
        fulfillment: "delivery",
        slotId: "15:00",
        deliveryAddress: "Mabolo, Cebu City near Sacred Heart",
        deliveryFeeMode: "rider",
        customerName: "Elena Sy",
        customerPhone: "09151230005",
        lines: [{ productId: "pecan", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 24000 }],
      },
    },
    {
      label: "confirmed unpaid pickup",
      patch: {
        slotId: "16:00",
        customerName: "Franco Lim",
        customerPhone: "09221230006",
        notes: "Birthday pickup",
        lines: [
          { productId: "apple", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 28000 },
          { productId: "buko", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 28000 },
        ],
        addons: [{ id: "birthday-topper", quantity: 2, unitPriceCentavos: 800 }],
      },
      steps: ["confirmed"],
    },
    {
      label: "confirmed paid pickup, 10-inch",
      patch: {
        slotId: "17:00",
        customerName: "Gia Villanueva",
        customerPhone: "09171230007",
        notes: "Whole pie, no candles",
        lines: [{ productId: "keylime", sizeId: "10-inch", quantity: 1, unitPriceCentavos: 250000 }],
      },
      steps: ["paid", "confirmed"],
    },
    {
      label: "confirmed paid delivery, known fee",
      patch: {
        fulfillment: "delivery",
        slotId: "18:00",
        deliveryAddress: "Maria Luisa, Banilad, Cebu",
        deliveryFeeMode: "known",
        deliveryFeeCentavos: 15000,
        customerName: "Hiro Nakamura",
        customerPhone: "09951230008",
        lines: [
          { productId: "buko", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 28000 },
          { productId: "apple", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 28000 },
        ],
      },
      steps: ["paid", "confirmed"],
    },
    {
      label: "confirmed paid delivery, pays rider",
      patch: {
        fulfillment: "delivery",
        slotId: "11:00",
        deliveryAddress: "Capitol Site, Cebu City",
        deliveryFeeMode: "rider",
        customerName: "Ivy Dela Cruz",
        customerPhone: "09061230009",
        notes: "Cash to rider for fee only",
        lines: [{ productId: "butter-chicken-curry", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 30000 }],
      },
      steps: ["paid", "confirmed"],
    },
    {
      label: "completed paid pickup",
      patch: {
        slotId: "10:00",
        customerName: "Jules Mercado",
        customerPhone: "09181230010",
        lines: [{ productId: "banoffee", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 24000 }],
        addons: [{ id: "note-card", quantity: 1, unitPriceCentavos: 1500 }],
      },
      steps: ["paid", "confirmed", "completed"],
    },
    {
      label: "pending unpaid pickup, late slot",
      actor: "public",
      patch: {
        slotId: "12:00",
        customerName: "Kai Fernandez",
        customerPhone: "09281230011",
        notes: "After-work pickup",
        lines: [{ productId: "oreo", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 19000 }],
      },
    },
    {
      label: "completed then refunded",
      patch: {
        slotId: "18:00",
        customerName: "Lia Santos",
        customerPhone: "09391230012",
        notes: "Whole pie for event",
        lines: [{ productId: "pecan", sizeId: "10-inch", quantity: 1, unitPriceCentavos: 250000 }],
      },
      steps: ["paid", "confirmed", "completed", "refunded"],
    },
    {
      label: "pending paid pickup",
      patch: {
        slotId: "13:00",
        customerName: "Miko Alvarez",
        customerPhone: "09171230013",
        notes: "GCash paid in chat",
        lines: [
          { productId: "smores", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 19000 },
          { productId: "oreo", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 19000 },
        ],
      },
      steps: ["paid"],
    },
    {
      label: "confirmed unpaid delivery, zero fee",
      patch: {
        fulfillment: "delivery",
        slotId: "16:00",
        deliveryAddress: "SM City Cebu, North Reclamation",
        deliveryFeeMode: "known",
        deliveryFeeCentavos: 0,
        customerName: "Nina Go",
        customerPhone: "09281230014",
        notes: "Staff pickup at concierge, zero fee",
        lines: [{ productId: "keylime", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 24000 }],
      },
      steps: ["confirmed"],
    },
    {
      label: "confirmed unpaid delivery, pays rider",
      patch: {
        fulfillment: "delivery",
        slotId: "17:00",
        deliveryAddress: "Guadalupe, Cebu City",
        deliveryFeeMode: "rider",
        customerName: "Omar Palacio",
        customerPhone: "09181230015",
        notes: "Gate code 4421",
        lines: [{ productId: "pecan", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 24000 }],
      },
      steps: ["confirmed"],
    },
    {
      label: "confirmed paid pickup, mixed weekend pies",
      patch: {
        slotId: "14:00",
        customerName: "Pia Uy",
        customerPhone: "09391230016",
        lines: [
          { productId: "buko", sizeId: "4-inch", quantity: 3, unitPriceCentavos: 28000 },
          { productId: "apple", sizeId: "10-inch", quantity: 1, unitPriceCentavos: 280000 },
        ],
        addons: [
          { id: "birthday-topper", quantity: 1, unitPriceCentavos: 800 },
          { id: "note-card", quantity: 1, unitPriceCentavos: 1500 },
        ],
      },
      steps: ["paid", "confirmed"],
    },
    {
      label: "completed paid delivery, known fee",
      patch: {
        fulfillment: "delivery",
        slotId: "10:00",
        deliveryAddress: "Talamban, Cebu City",
        deliveryFeeMode: "known",
        deliveryFeeCentavos: 22000,
        customerName: "Quinn Batiancila",
        customerPhone: "09151230017",
        lines: [
          { productId: "banoffee", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 24000 },
          { productId: "keylime", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 24000 },
        ],
      },
      steps: ["paid", "confirmed", "completed"],
    },
    {
      label: "pending unpaid pickup, large mixed cart",
      actor: "public",
      patch: {
        slotId: "18:00",
        customerName: "Rina Escario",
        customerPhone: "09221230018",
        notes: "Office treat, split boxes",
        lines: [
          { productId: "keylime", sizeId: "4-inch", quantity: 3, unitPriceCentavos: 24000 },
          { productId: "pecan", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 24000 },
          { productId: "smores", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 19000 },
          { productId: "oreo", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 19000 },
        ],
        addons: [{ id: "note-card", quantity: 3, unitPriceCentavos: 1500 }],
      },
    },
    {
      label: "pending paid delivery, known fee",
      patch: {
        fulfillment: "delivery",
        slotId: "12:00",
        deliveryAddress: "Cebu Business Park, Ayala",
        deliveryFeeMode: "known",
        deliveryFeeCentavos: 12000,
        customerName: "Sofia Ybañez",
        customerPhone: "09171230019",
        notes: "Reception, Tower 2",
        lines: [
          { productId: "smores", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 19000 },
          { productId: "banoffee", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 24000 },
        ],
        addons: [{ id: "note-card", quantity: 2, unitPriceCentavos: 1500 }],
      },
      steps: ["paid"],
    },
    {
      label: "completed paid delivery, pays rider",
      patch: {
        fulfillment: "delivery",
        slotId: "15:00",
        deliveryAddress: "Lahug, near JY Square",
        deliveryFeeMode: "rider",
        customerName: "Theo Abellana",
        customerPhone: "09281230020",
        lines: [
          { productId: "butter-chicken-curry", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 30000 },
          { productId: "keylime", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 24000 },
        ],
      },
      steps: ["paid", "confirmed", "completed"],
    },
  ];

  for (const spec of specs) {
    const id = await place(spec.patch, spec.actor ?? "admin");
    for (const step of spec.steps ?? []) await transition(id, step);
    const saved = await header(id);
    console.log(`${saved.order_number}\t${saved.status}/${saved.payment}\t${saved.fulfillment}/${saved.delivery_fee_mode ?? "none"}\t${spec.label}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

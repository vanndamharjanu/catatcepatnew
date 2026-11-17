import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildPresetCategoryList,
  buildSimulationTransactions,
  readDb,
  toPublicState,
  writeDb,
} from "@/lib/store";
import type { WorkspaceSettings } from "@/lib/types";

export async function GET() {
  const db = readDb();
  return NextResponse.json(toPublicState(db));
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      monthlyBudget?: number;
      paydayDay?: number;
      name?: string;
      categoryPreset?: WorkspaceSettings["categoryPreset"];
      categoryName?: string;
      categoryType?: "Masuk" | "Keluar";
      categoryId?: string;
      plan?: "free" | "pro";
    };

    const db = readDb();

    if (body.action === "load_simulation") {
      const sample = buildSimulationTransactions();
      db.transactions = [...sample, ...db.transactions];
      writeDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "clear_all_data") {
      db.transactions = [];
      db.goals = [];
      writeDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "add_category") {
      const cleanName = (body.categoryName || "").trim();
      const catType = body.categoryType === "Masuk" ? "Masuk" : "Keluar";
      if (!cleanName) {
        return NextResponse.json({ error: "Nama kategori wajib diisi." }, { status: 400 });
      }
      const exists = db.categories.some(
        (c) => c.type === catType && c.name.toLowerCase() === cleanName.toLowerCase(),
      );
      if (!exists) {
        db.categories.push({
          id: `cat-${randomUUID().slice(0, 8)}`,
          name: cleanName,
          type: catType,
          iconKey: "tag",
        });
        writeDb(db);
      }
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "delete_category" && body.categoryId) {
      db.categories = db.categories.filter((c) => c.id !== body.categoryId);
      writeDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (typeof body.monthlyBudget === "number" && body.monthlyBudget >= 0) {
      db.settings.monthlyBudget = Math.round(body.monthlyBudget);
    }
    if (typeof body.paydayDay === "number" && body.paydayDay >= 1 && body.paydayDay <= 28) {
      db.settings.paydayDay = Math.round(body.paydayDay);
    }
    if (typeof body.name === "string" && body.name.trim()) {
      db.settings.name = body.name.trim().slice(0, 60);
    }
    if (body.plan === "free" || body.plan === "pro") {
      db.settings.plan = body.plan;
    }
    if (body.categoryPreset) {
      db.settings.categoryPreset = body.categoryPreset;
      db.categories = buildPresetCategoryList(body.categoryPreset);
    }

    writeDb(db);
    return NextResponse.json(toPublicState(db));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memperbarui pengaturan." },
      { status: 500 },
    );
  }
}

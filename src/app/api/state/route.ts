import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { tryAutoSync } from "@/lib/google-sheets";
import {
  ALLOWED_CATEGORY_ICONS,
  buildPresetCategoryList,
  buildSimulationTransactions,
  deleteCategoryInDb,
  readDb,
  reorderCategoriesInDb,
  toPublicState,
  updateCategoryInDb,
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
      iconKey?: string;
      replacementCategory?: string;
      orderedIds?: string[];
      plan?: "free" | "pro";
      initialBalances?: Record<string, number>;
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
      if (exists) {
        return NextResponse.json(
          { error: `Kategori "${cleanName}" sudah ada.` },
          { status: 400 },
        );
      }
      const iconKey =
        body.iconKey && ALLOWED_CATEGORY_ICONS.has(body.iconKey) ? body.iconKey : "tag";
      db.categories.push({
        id: `cat-${randomUUID().slice(0, 8)}`,
        name: cleanName.slice(0, 40),
        type: catType,
        iconKey,
      });
      writeDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "update_category" && body.categoryId) {
      const result = updateCategoryInDb(db, body.categoryId, {
        name: body.categoryName,
        iconKey: body.iconKey,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      if (result.transactionsChanged) await tryAutoSync(db);
      writeDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "reorder_categories" && Array.isArray(body.orderedIds)) {
      const catType = body.categoryType === "Masuk" ? "Masuk" : "Keluar";
      const result = reorderCategoriesInDb(db, catType, body.orderedIds);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      writeDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "delete_category" && body.categoryId) {
      const result = deleteCategoryInDb(db, body.categoryId, body.replacementCategory);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      if (result.transactionsChanged) await tryAutoSync(db);
      writeDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "reorder_categories" && Array.isArray(body.orderedIds)) {
      const catType = body.categoryType === "Masuk" ? "Masuk" : "Keluar";
      const result = reorderCategoriesInDb(db, catType, body.orderedIds);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
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
    if (body.initialBalances && typeof body.initialBalances === "object") {
      for (const acc of db.accounts) {
        if (!(acc.id in body.initialBalances)) continue;
        const raw = Number(body.initialBalances[acc.id]);
        if (!Number.isFinite(raw) || raw < 0) {
          return NextResponse.json(
            { error: `Saldo awal ${acc.name} harus Rp 0 atau lebih.` },
            { status: 400 },
          );
        }
        acc.initialBalance = Math.round(raw);
      }
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

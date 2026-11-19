import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  addAccountInDb,
  ALLOWED_CATEGORY_ICONS,
  buildPresetCategoryList,
  buildSimulationTransactions,
  deleteAccountInDb,
  deleteCategoryInDb,
  isUnauthenticatedCloudRequest,
  readAsyncDb,
  reorderCategoriesInDb,
  toPublicState,
  updateCategoryInDb,
  writeAsyncDb,
} from "@/lib/store";
import type { AccountKind, WorkspaceSettings } from "@/lib/types";

export async function GET() {
  const db = await readAsyncDb();
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
      accountName?: string;
      accountKind?: AccountKind;
      accountInitialBalance?: number;
      accountId?: string;
      replacementAccountId?: string;
      initialBalances?: Record<string, number>;
    };

    const db = await readAsyncDb();
    if (isUnauthenticatedCloudRequest(db)) {
      return NextResponse.json(
        { error: "Silakan masuk ke akun Anda terlebih dahulu." },
        { status: 401 },
      );
    }

    if (body.action === "load_simulation") {
      const sample = buildSimulationTransactions();
      db.transactions = [...sample, ...db.transactions];
      await writeAsyncDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "clear_all_data") {
      db.transactions = [];
      db.goals = [];
      db.sheetConnection.pendingDeletes = [];
      await writeAsyncDb(db);
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
      await writeAsyncDb(db);
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
      await writeAsyncDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "reorder_categories" && Array.isArray(body.orderedIds)) {
      const catType = body.categoryType === "Masuk" ? "Masuk" : "Keluar";
      const result = reorderCategoriesInDb(db, catType, body.orderedIds);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      await writeAsyncDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "delete_category" && body.categoryId) {
      const result = deleteCategoryInDb(db, body.categoryId, body.replacementCategory);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      await writeAsyncDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "add_account") {
      const result = addAccountInDb(
        db,
        body.accountName || "",
        body.accountKind || "bank",
        body.accountInitialBalance ?? 0,
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      await writeAsyncDb(db);
      return NextResponse.json(toPublicState(db));
    }

    if (body.action === "delete_account" && body.accountId) {
      const result = deleteAccountInDb(db, body.accountId, body.replacementAccountId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      await writeAsyncDb(db);
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

    await writeAsyncDb(db);
    return NextResponse.json(toPublicState(db));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memperbarui pengaturan." },
      { status: 500 },
    );
  }
}

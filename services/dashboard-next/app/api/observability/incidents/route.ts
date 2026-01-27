import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { incidents as incidentsTable } from "@/lib/db/platform-schema";
import { eq, desc, and, sql } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const conditions = [];
    if (status && status !== "all") {
      conditions.push(eq(incidentsTable.status, status));
    }
    if (severity && severity !== "all") {
      conditions.push(eq(incidentsTable.severity, severity));
    }

    let incidentsQuery = db.select().from(incidentsTable);
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(incidentsTable);

    if (conditions.length > 0) {
      const whereClause = and(...conditions);
      incidentsQuery = incidentsQuery.where(whereClause) as typeof incidentsQuery;
      countQuery = countQuery.where(whereClause) as typeof countQuery;
    }

    const [incidentsList, countResult] = await Promise.all([
      incidentsQuery
        .orderBy(desc(incidentsTable.createdAt))
        .limit(limit)
        .offset(offset),
      countQuery,
    ]);

    return NextResponse.json({
      success: true,
      incidents: incidentsList.map((i) => ({
        ...i,
        createdAt: i.createdAt?.toISOString() ?? new Date().toISOString(),
        acknowledgedAt: i.acknowledgedAt?.toISOString(),
        resolvedAt: i.resolvedAt?.toISOString(),
      })),
      total: Number(countResult[0]?.count || 0),
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("Get incidents error:", error);
    return NextResponse.json(
      { error: "Failed to fetch incidents", details: error.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { remediationEngine } from "@/lib/remediation-engine";
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
    if (status) {
      conditions.push(eq(incidentsTable.status, status));
    }
    if (severity) {
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
      incidents: incidentsList,
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

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      serviceName,
      severity,
      title,
      description,
      runbookId,
      autoRemediate,
      context,
    } = body;

    if (!serviceName || !severity || !title) {
      return NextResponse.json(
        { error: "Missing required fields: serviceName, severity, title" },
        { status: 400 }
      );
    }

    const [incident] = await db
      .insert(incidentsTable)
      .values({
        serviceName,
        severity,
        status: "open",
        title,
        description,
        runbookId,
      })
      .returning();

    if (autoRemediate && runbookId) {
      try {
        remediationEngine.loadRunbooks();
        const execution = await remediationEngine.executeRunbook(runbookId, {
          incidentId: incident.id,
          serviceName,
          ...context,
        });

        if (execution.status === "completed") {
          await db
            .update(incidentsTable)
            .set({
              status: "resolved",
              resolvedAt: new Date(),
              resolution: "Automatically resolved by runbook",
            })
            .where(eq(incidentsTable.id, incident.id));
          
          incident.status = "resolved";
          incident.resolvedAt = new Date();
          incident.resolution = "Automatically resolved by runbook";
        }
      } catch (runbookError: any) {
        console.error("Runbook execution failed:", runbookError);
        await db
          .update(incidentsTable)
          .set({
            description: `${description || ""}\n\nRunbook Error: ${runbookError.message}`,
          })
          .where(eq(incidentsTable.id, incident.id));
      }
    }

    return NextResponse.json({ incident }, { status: 201 });
  } catch (error: any) {
    console.error("Create incident error:", error);
    return NextResponse.json(
      { error: "Failed to create incident", details: error.message },
      { status: 500 }
    );
  }
}

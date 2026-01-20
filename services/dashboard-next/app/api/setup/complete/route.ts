import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setupConfiguration, setupStepData } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { features, summary } = body;

    const configs = await db.select().from(setupConfiguration).limit(1);
    
    if (configs.length === 0) {
      await db.insert(setupConfiguration).values({
        setupComplete: true,
        currentStep: 8,
        welcomeCompleted: true,
        featuresEnabled: features || {},
        completedAt: new Date(),
      });
    } else {
      await db
        .update(setupConfiguration)
        .set({
          setupComplete: true,
          currentStep: 8,
          featuresEnabled: features || {},
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(setupConfiguration.id, configs[0].id));
    }

    await db
      .insert(setupStepData)
      .values({
        stepName: "completion",
        stepNumber: 8,
        completed: true,
        data: { summary, completedAt: new Date().toISOString() },
        validatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: setupStepData.stepName,
        set: {
          completed: true,
          data: { summary, completedAt: new Date().toISOString() },
          validatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({
      success: true,
      message: "Setup completed successfully",
      redirectTo: "/",
    });
  } catch (error) {
    console.error("[Setup Complete API] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to complete setup" },
      { status: 500 }
    );
  }
}

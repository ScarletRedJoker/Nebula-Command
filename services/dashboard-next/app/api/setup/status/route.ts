import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setupConfiguration, setupStepData } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const configs = await db.select().from(setupConfiguration).limit(1);
    const config = configs[0];

    if (!config) {
      return NextResponse.json({
        success: true,
        isComplete: false,
        currentStep: 0,
        needsSetup: true,
        steps: [],
      });
    }

    const steps = await db.select().from(setupStepData).orderBy(setupStepData.stepNumber);

    return NextResponse.json({
      success: true,
      isComplete: config.setupComplete,
      currentStep: config.currentStep,
      needsSetup: !config.setupComplete,
      completedAt: config.completedAt,
      features: config.featuresEnabled,
      steps: steps.map((s) => ({
        name: s.stepName,
        number: s.stepNumber,
        completed: s.completed,
        validatedAt: s.validatedAt,
      })),
    });
  } catch (error) {
    console.error("[Setup Status API] Error:", error);
    return NextResponse.json({
      success: true,
      isComplete: false,
      currentStep: 0,
      needsSetup: true,
      steps: [],
    });
  }
}

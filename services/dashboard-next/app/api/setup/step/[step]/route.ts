import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setupConfiguration, setupStepData } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

const STEP_NAMES: Record<string, { number: number; name: string }> = {
  welcome: { number: 1, name: "Welcome" },
  environment: { number: 2, name: "Environment Detection" },
  admin: { number: 3, name: "Admin Account Setup" },
  nodes: { number: 4, name: "Node Configuration" },
  secrets: { number: 5, name: "Secrets Configuration" },
  ai: { number: 6, name: "AI Services Setup" },
  features: { number: 7, name: "Feature Selection" },
  completion: { number: 8, name: "Completion" },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ step: string }> }
) {
  try {
    const { step } = await params;
    const stepInfo = STEP_NAMES[step];

    if (!stepInfo) {
      return NextResponse.json(
        { success: false, error: "Invalid step" },
        { status: 400 }
      );
    }

    const stepData = await db
      .select()
      .from(setupStepData)
      .where(eq(setupStepData.stepName, step))
      .limit(1);

    return NextResponse.json({
      success: true,
      step: step,
      stepNumber: stepInfo.number,
      stepName: stepInfo.name,
      completed: stepData[0]?.completed || false,
      data: stepData[0]?.data || null,
      validatedAt: stepData[0]?.validatedAt,
    });
  } catch (error) {
    console.error("[Setup Step API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get step data" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ step: string }> }
) {
  try {
    const { step } = await params;
    const body = await request.json();
    const stepInfo = STEP_NAMES[step];

    if (!stepInfo) {
      return NextResponse.json(
        { success: false, error: "Invalid step" },
        { status: 400 }
      );
    }

    const { data, validated = true } = body;

    await db
      .insert(setupStepData)
      .values({
        stepName: step,
        stepNumber: stepInfo.number,
        completed: validated,
        data: data || {},
        validatedAt: validated ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: setupStepData.stepName,
        set: {
          completed: validated,
          data: data || {},
          validatedAt: validated ? new Date() : null,
          updatedAt: new Date(),
        },
      });

    const configs = await db.select().from(setupConfiguration).limit(1);
    
    if (configs.length === 0) {
      await db.insert(setupConfiguration).values({
        currentStep: stepInfo.number,
        welcomeCompleted: step === "welcome" ? true : false,
      });
    } else {
      const updateData: Record<string, unknown> = {
        currentStep: Math.max(configs[0].currentStep || 0, stepInfo.number),
        updatedAt: new Date(),
      };

      if (step === "welcome") updateData.welcomeCompleted = true;
      if (step === "environment") updateData.environmentDetected = data;
      if (step === "admin") {
        updateData.adminConfigured = true;
        if (data?.userId) updateData.adminUserId = data.userId;
      }
      if (step === "nodes") updateData.nodesConfigured = data;
      if (step === "secrets") updateData.secretsConfigured = data;
      if (step === "ai") updateData.aiServicesConfigured = data;
      if (step === "features") updateData.featuresEnabled = data;

      await db
        .update(setupConfiguration)
        .set(updateData)
        .where(eq(setupConfiguration.id, configs[0].id));
    }

    return NextResponse.json({
      success: true,
      step,
      stepNumber: stepInfo.number,
      saved: true,
      nextStep: stepInfo.number < 8 ? Object.keys(STEP_NAMES)[stepInfo.number] : null,
    });
  } catch (error) {
    console.error("[Setup Step API] POST error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save step data" },
      { status: 500 }
    );
  }
}

/**
 * Creative Pipelines API
 * GET /api/creative/pipelines - List available pipeline templates
 * POST /api/creative/pipelines - Create a custom pipeline
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creativePipelines, type NewCreativePipeline } from "@/lib/db/platform-schema";
import { eq, desc } from "drizzle-orm";

const BUILT_IN_PIPELINES = [
  {
    id: "basic-txt2img",
    name: "Basic Text to Image",
    description: "Simple text-to-image generation with default settings",
    steps: [
      {
        type: "text-to-image",
        config: {
          size: "512x512",
          steps: 25,
          cfgScale: 7,
        },
      },
    ],
    isBuiltIn: true,
    category: "generation",
  },
  {
    id: "hires-fix",
    name: "High Resolution Fix",
    description: "Generate at low res, then upscale for better quality at high resolutions",
    steps: [
      {
        type: "text-to-image",
        config: {
          size: "512x512",
          steps: 25,
          cfgScale: 7,
        },
      },
      {
        type: "upscale",
        config: {
          scaleFactor: 2,
          upscaler: "R-ESRGAN 4x+",
        },
      },
    ],
    isBuiltIn: true,
    category: "generation",
  },
  {
    id: "img2img-refinement",
    name: "Image Refinement",
    description: "Enhance an existing image with subtle modifications",
    steps: [
      {
        type: "image-to-image",
        config: {
          denoisingStrength: 0.35,
          steps: 25,
          cfgScale: 7,
        },
      },
    ],
    isBuiltIn: true,
    category: "enhancement",
  },
  {
    id: "controlnet-pose",
    name: "Pose Transfer",
    description: "Generate an image matching a reference pose using OpenPose ControlNet",
    steps: [
      {
        type: "controlnet",
        config: {
          controlNets: [
            {
              controlType: "openpose",
              weight: 1.0,
            },
          ],
          steps: 25,
          cfgScale: 7,
        },
      },
    ],
    isBuiltIn: true,
    category: "controlnet",
  },
  {
    id: "controlnet-canny",
    name: "Edge-Guided Generation",
    description: "Generate an image following edge structure using Canny ControlNet",
    steps: [
      {
        type: "controlnet",
        config: {
          controlNets: [
            {
              controlType: "canny",
              weight: 1.0,
            },
          ],
          steps: 25,
          cfgScale: 7,
        },
      },
    ],
    isBuiltIn: true,
    category: "controlnet",
  },
  {
    id: "controlnet-depth",
    name: "Depth-Guided Generation",
    description: "Generate an image with depth structure matching a reference",
    steps: [
      {
        type: "controlnet",
        config: {
          controlNets: [
            {
              controlType: "depth",
              weight: 1.0,
            },
          ],
          steps: 25,
          cfgScale: 7,
        },
      },
    ],
    isBuiltIn: true,
    category: "controlnet",
  },
  {
    id: "face-swap-enhance",
    name: "Face Swap with Enhancement",
    description: "Swap faces and apply face restoration for better quality",
    steps: [
      {
        type: "face-swap",
        config: {
          restoreFace: true,
          upscale: false,
        },
      },
    ],
    isBuiltIn: true,
    category: "face",
  },
  {
    id: "inpaint-object-removal",
    name: "Object Removal",
    description: "Remove objects by masking and inpainting",
    steps: [
      {
        type: "inpainting",
        config: {
          denoisingStrength: 0.85,
          maskBlur: 4,
          inpaintingFill: 1,
          steps: 30,
          cfgScale: 7,
        },
      },
    ],
    isBuiltIn: true,
    category: "inpainting",
  },
  {
    id: "super-upscale",
    name: "4x Super Upscale",
    description: "Maximum quality upscaling with face enhancement",
    steps: [
      {
        type: "upscale",
        config: {
          scaleFactor: 4,
          upscaler: "R-ESRGAN 4x+",
          codeformerVisibility: 0.5,
        },
      },
    ],
    isBuiltIn: true,
    category: "enhancement",
  },
];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category");
    const includeBuiltIn = searchParams.get("includeBuiltIn") !== "false";

    const customPipelines = await db
      .select()
      .from(creativePipelines)
      .orderBy(desc(creativePipelines.createdAt));

    let allPipelines: Array<any> = [...customPipelines.map((p) => ({
      ...p,
      isBuiltIn: false,
      category: "custom",
    }))];

    if (includeBuiltIn) {
      allPipelines = [...BUILT_IN_PIPELINES, ...allPipelines];
    }

    if (category) {
      allPipelines = allPipelines.filter((p) => p.category === category);
    }

    const categories = [
      { id: "generation", name: "Generation", description: "Text-to-image generation pipelines" },
      { id: "enhancement", name: "Enhancement", description: "Image quality improvement pipelines" },
      { id: "controlnet", name: "ControlNet", description: "Guided generation with control images" },
      { id: "inpainting", name: "Inpainting", description: "Mask-based image editing pipelines" },
      { id: "face", name: "Face", description: "Face-related operations" },
      { id: "custom", name: "Custom", description: "User-created pipelines" },
    ];

    return NextResponse.json({
      success: true,
      pipelines: allPipelines,
      categories,
      total: allPipelines.length,
    });
  } catch (error) {
    console.error("[Creative Pipelines API] List error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list pipelines",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, description, steps, category, isPublic } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Pipeline name is required" },
        { status: 400 }
      );
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json(
        { success: false, error: "Pipeline must have at least one step" },
        { status: 400 }
      );
    }

    const validStepTypes = [
      "text-to-image",
      "image-to-image",
      "inpainting",
      "controlnet",
      "upscale",
      "face-swap",
    ];

    for (const step of steps) {
      if (!step.type || !validStepTypes.includes(step.type)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid step type: ${step.type}. Must be one of: ${validStepTypes.join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    const newPipeline: NewCreativePipeline = {
      name,
      description: description || null,
      stages: steps,
      isTemplate: isPublic ?? false,
    };

    const [insertedPipeline] = await db
      .insert(creativePipelines)
      .values(newPipeline)
      .returning();

    console.log(`[Creative Pipelines API] Created pipeline ${insertedPipeline.id}: ${name}`);

    return NextResponse.json({
      success: true,
      pipeline: insertedPipeline,
    });
  } catch (error) {
    console.error("[Creative Pipelines API] Create error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create pipeline",
      },
      { status: 500 }
    );
  }
}

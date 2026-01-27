import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

interface NodeCapabilities {
  has_gpu: boolean;
  is_gpu_capable: boolean;
  vram_mb: number;
  can_run_llm: boolean;
  can_run_sd: boolean;
  can_run_comfyui: boolean;
}

interface NodeProfile {
  node_id: string;
  detected_at: string;
  platform: 'linux' | 'windows';
  os: string;
  arch: string;
  ram_mb: number;
  disk_available_mb: number;
  gpu: {
    vendor: string;
    count: number;
    names: string;
    vram_mb: number;
    cuda_version?: string;
    rocm_version?: string;
  };
  network: {
    primary_ip: string;
    tailscale_ip?: string;
    interfaces: string;
  };
  services: {
    ollama: boolean;
    comfyui: boolean;
    stable_diffusion: boolean;
    docker: boolean;
  };
  capabilities: NodeCapabilities;
}

export async function POST(request: NextRequest) {
  try {
    const profile: NodeProfile = await request.json();

    if (!profile.node_id) {
      return NextResponse.json(
        { success: false, error: 'node_id is required' },
        { status: 400 }
      );
    }

    const capabilities = [
      profile.capabilities.can_run_llm && 'llm',
      profile.capabilities.can_run_sd && 'stable-diffusion',
      profile.capabilities.can_run_comfyui && 'comfyui',
      profile.services.docker && 'docker',
    ].filter(Boolean);

    const advertiseIp = profile.network.tailscale_ip || profile.network.primary_ip;

    await db.execute(sql`
      INSERT INTO service_registry (
        service_name,
        node_id,
        host,
        port,
        health_status,
        capabilities,
        metadata,
        last_heartbeat
      ) VALUES (
        'ai-node',
        ${profile.node_id},
        ${advertiseIp},
        11434,
        'healthy',
        ${JSON.stringify(capabilities)},
        ${JSON.stringify({
          platform: profile.platform,
          os: profile.os,
          arch: profile.arch,
          ram_mb: profile.ram_mb,
          gpu: profile.gpu,
          services: profile.services,
          detected_at: profile.detected_at,
        })},
        NOW()
      )
      ON CONFLICT (service_name, node_id) DO UPDATE SET
        host = EXCLUDED.host,
        health_status = 'healthy',
        capabilities = EXCLUDED.capabilities,
        metadata = EXCLUDED.metadata,
        last_heartbeat = NOW()
    `);

    console.log(`[NodeRegistry] Registered node: ${profile.node_id} (${profile.platform})`);

    return NextResponse.json({
      success: true,
      node_id: profile.node_id,
      message: 'Node registered successfully',
      advertise_ip: advertiseIp,
      capabilities,
    });
  } catch (error) {
    console.error('[NodeRegistry] Registration error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to register node' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const nodeId = searchParams.get('node_id');

    let query;
    if (nodeId) {
      query = sql`
        SELECT * FROM service_registry 
        WHERE service_name = 'ai-node' AND node_id = ${nodeId}
      `;
    } else {
      query = sql`
        SELECT * FROM service_registry 
        WHERE service_name = 'ai-node'
        ORDER BY last_heartbeat DESC
      `;
    }

    const result = await db.execute(query);

    return NextResponse.json({
      success: true,
      nodes: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('[NodeRegistry] Query error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to query nodes' },
      { status: 500 }
    );
  }
}

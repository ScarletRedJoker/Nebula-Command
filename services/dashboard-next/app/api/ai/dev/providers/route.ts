import { NextRequest, NextResponse } from 'next/server';
import { providerRegistry } from '@/lib/ai/ai-dev/provider-registry';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const checkHealth = searchParams.get('health') === 'true';

    const providers = providerRegistry.listProviders();

    if (checkHealth) {
      const healthStatuses = await providerRegistry.getAllProviderHealth();

      return NextResponse.json({
        success: true,
        providers: providers.map(name => ({
          name,
          health: healthStatuses[name],
        })),
      });
    }

    return NextResponse.json({
      success: true,
      providers: providers.map(name => ({ name })),
    });
  } catch (error) {
    console.error('[AI Dev Providers] Error listing providers:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list providers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, provider } = body;

    if (action === 'set_default') {
      if (!provider) {
        return NextResponse.json(
          { success: false, error: 'Provider name is required' },
          { status: 400 }
        );
      }

      try {
        providerRegistry.setDefaultProvider(provider);
        return NextResponse.json({
          success: true,
          message: `Default provider set to ${provider}`,
        });
      } catch (error) {
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
          { status: 400 }
        );
      }
    }

    if (action === 'health_check') {
      const health = provider
        ? await providerRegistry.getProviderHealth(provider)
        : await providerRegistry.getAllProviderHealth();

      return NextResponse.json({
        success: true,
        health,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('[AI Dev Providers] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to perform action' },
      { status: 500 }
    );
  }
}

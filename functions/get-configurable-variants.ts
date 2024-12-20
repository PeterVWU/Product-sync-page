import { Env } from "./backendTypes";
import Logger from './logger';

interface EnvBind extends Env {
    PRODUCT_SYNC_LOGS: KVNamespace;
}

function normalizeUrl(url: string): string {
    url = url.replace(/\/+$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url;
}

export const onRequestGet: PagesFunction<EnvBind> = async (context) => {
    const { searchParams } = new URL(context.request.url);
    const sku = searchParams.get('sku');
    const request = context.request;
    const env = context.env;
    const logger = new Logger({ kv: env.PRODUCT_SYNC_LOGS });

    if (!sku) {
        return new Response(JSON.stringify({ error: 'SKU parameter is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        logger.info('Starting get configurable variants request', { method: request.method });
        await logger.flush();
        const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);

        // Get children products
        const response = await fetch(
            `${baseUrl}/rest/V1/configurable-products/${encodeURIComponent(sku)}/children`,
            {
                headers: {
                    Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                }
            }
        );

        if (!response.ok) {
            // If the product is not found or has no children, return empty array
            if (response.status === 404) {
                logger.info('No childten found');
                await logger.flush();
                return new Response(JSON.stringify({ childSkus: [] }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            throw new Error(`Failed to fetch variants: ${response.statusText}`);
        }

        const children: any = await response.json();
        const childSkus = children.map((child: any) => child.sku);

        return new Response(JSON.stringify({ childSkus }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        logger.error('Failed to to fetch variantse', { error: error.message });
        await logger.flush();
        return new Response(JSON.stringify({
            error: (error as Error).message,
            childSkus: [] // Return empty array on error
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
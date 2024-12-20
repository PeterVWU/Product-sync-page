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
    const searchBase = searchParams.get('searchBase');
    const env = context.env;
    const logger = new Logger({ kv: env.PRODUCT_SYNC_LOGS });
    logger.info('Starting search magento produicts', { method: context.request.method });
    await logger.flush();

    if (!searchBase) {
        return new Response(JSON.stringify({ error: 'Search base required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);
        const response = await fetch(
            `${baseUrl}/rest/V1/products?${new URLSearchParams({
                'searchCriteria[pageSize]': '50',
                'searchCriteria[filterGroups][0][filters][0][field]': 'url_key',
                'searchCriteria[filterGroups][0][filters][0][value]': `${searchBase}%`,
                'searchCriteria[filterGroups][0][filters][0][conditionType]': 'like',
                'searchCriteria[filterGroups][1][filters][0][field]': 'type_id',
                'searchCriteria[filterGroups][1][filters][0][value]': 'configurable',
                'searchCriteria[filterGroups][1][filters][0][conditionType]': 'eq'
            })}`,
            {
                headers: {
                    Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                }
            }
        );

        const data: any = await response.json();

        return new Response(JSON.stringify({
            products: data.items.map((item: any) => ({
                sku: item.sku,
                name: item.name,
                type_id: item.type_id,
                url_key: item.custom_attributes?.find(
                    (attr: any) => attr.attribute_code === 'url_key'
                )?.value
            }))
        }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        logger.error('Search magento product failed', {
            error: (error as Error).message
        });

        await logger.flush();
        return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
import { Env, MagentoAttributeMetadata } from "./backendTypes";
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

async function fetchMagentoAttributeMetadata(env: Env, logger: Logger): Promise<MagentoAttributeMetadata[]> {
    const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);
    logger.info('Fetching Magento attribute metadata');

    const searchParams = new URLSearchParams({
        'searchCriteria[pageSize]': '100',
        'searchCriteria[currentPage]': '1',
        'searchCriteria[filterGroups][0][filters][0][field]': 'frontend_input',
        'searchCriteria[filterGroups][0][filters][0][value]': 'text,textarea,select,multiselect',
        'searchCriteria[filterGroups][0][filters][0][conditionType]': 'in'
    });

    const startTime = Date.now();
    const response = await fetch(
        `${baseUrl}/rest/V1/products/attributes?${searchParams.toString()}`,
        {
            headers: {
                Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch Magento attributes: ${response.statusText}`);
    }

    const attributesResponse: any = await response.json();
    const attributes = attributesResponse.items as MagentoAttributeMetadata[];

    logger.info('Magento attributes fetched', {
        attributeCount: attributes.length,
        duration: `${Date.now() - startTime}ms`
    });
    await logger.flush();

    return attributes;
}

export const onRequestGet: PagesFunction<EnvBind> = async (context) => {
    const env = context.env;
    const logger = new Logger({ kv: env.PRODUCT_SYNC_LOGS });
    logger.info('Starting get magento attribute request', { method: context.request.method });
    await logger.flush();

    try {
        if (!env.MAGENTO_BASE_URL || !env.MAGENTO_ACCESS_TOKEN) {
            logger.error('Missing environment variables');
            await logger.flush();
            return new Response(JSON.stringify({
                error: 'Missing required environment variables. Please check MAGENTO_BASE_URL and MAGENTO_ACCESS_TOKEN are set.'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const attributes = await fetchMagentoAttributeMetadata(env, logger);

        return new Response(JSON.stringify({
            attributes
        }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        const error = err as Error;
        logger.error('Failed to fetch attributes', { error: error.message });
        await logger.flush();

        return new Response(JSON.stringify({
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};

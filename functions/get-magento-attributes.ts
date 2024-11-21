import { Env, LogEntry, MagentoAttributeMetadata } from "./backendTypes";

class Logger {
    private logs: LogEntry[] = [];
    private startTime: number;

    constructor() {
        this.startTime = Date.now();
    }

    log(event: string, details?: any) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            event,
            details,
            duration: Date.now() - this.startTime
        };
        this.logs.push(entry);
        console.log(JSON.stringify(entry));
    }

    getLogs() {
        return this.logs;
    }
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
    logger.log('Fetching Magento attribute metadata');

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

    logger.log('Magento attributes fetched', {
        attributeCount: attributes.length,
        duration: `${Date.now() - startTime}ms`
    });

    return attributes;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const env = context.env;
    const logger = new Logger();
    logger.log('Worker started', { method: context.request.method });

    try {
        if (!env.MAGENTO_BASE_URL || !env.MAGENTO_ACCESS_TOKEN) {
            logger.log('Missing environment variables');
            return new Response(JSON.stringify({
                error: 'Missing required environment variables. Please check MAGENTO_BASE_URL and MAGENTO_ACCESS_TOKEN are set.'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const attributes = await fetchMagentoAttributeMetadata(env, logger);

        return new Response(JSON.stringify({
            attributes,
            logs: logger.getLogs()
        }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        const error = err as Error;
        logger.log('Failed to fetch attributes', { error: error.message });

        return new Response(JSON.stringify({
            error: error.message,
            logs: logger.getLogs()
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};

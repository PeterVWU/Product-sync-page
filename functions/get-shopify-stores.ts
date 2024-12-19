import { Env, ShopifyStoreConfig } from "./backendTypes";
import Logger from './logger';

interface StoreResponse {
    id: string;
    name: string;
    storeUrl: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const env = context.env;
    const logger = new Logger({ kv: env.PRODUCT_SYNC_LOGS });
    try {
        logger.info('Starting get shopify stores', { method: context.request.method });
        await logger.flush();

        // Parse store configurations from environment variables
        let stores: ShopifyStoreConfig[] = [];
        try {
            const storeConfigs = JSON.parse(env.ADDITIONAL_SHOPIFY_STORES || '[]');
            stores = Array.isArray(storeConfigs) ? storeConfigs : [];
        } catch (err) {
            console.error('Failed to parse ADDITIONAL_SHOPIFY_STORES:', err);
            stores = [];
        }

        // Return store information without sensitive data
        const safeStores: StoreResponse[] = stores.map(store => ({
            id: store.id,
            name: store.name,
            storeUrl: store.storeUrl
        }));

        return new Response(JSON.stringify({
            stores: safeStores
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        logger.error('Get shopify stores failed', {
            error: (error as Error).message
        });

        await logger.flush();
        return new Response(JSON.stringify({
            error: 'Failed to fetch store configurations'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
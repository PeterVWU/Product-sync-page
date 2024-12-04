import { Env, LogEntry, ShopifyProduct, ShopifyStoreConfig } from "./backendTypes";

interface BatchImportRequest {
    shopifyProduct: ShopifyProduct;
    targetStoreIds: string[];
}

interface ImportResult {
    storeId: string;
    storeName: string;
    success: boolean;
    error?: string;
    productId?: string;
}

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

const SHOPIFY_IMPORT_MUTATION = `
  mutation createProduct($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function importToStore(
    product: ShopifyProduct,
    store: ShopifyStoreConfig,
    token: string,
    logger: Logger
): Promise<ImportResult> {
    try {
        logger.log('Starting import to store', {
            storeId: store.id,
            storeName: store.name,
            productTitle: product.title
        });

        const input = {
            title: product.title,
            descriptionHtml: product.description,
            vendor: product.vendor,
            productType: product.productType,
            options: product.variants[0].selectedOptions.map(opt => ({
                name: opt.name,
                values: [...new Set(product.variants.map(v =>
                    v.selectedOptions.find(o => o.name === opt.name)?.value
                ).filter(Boolean))]
            })),
            variants: product.variants.map(variant => ({
                sku: variant.sku,
                price: variant.price,
                inventoryQuantity: variant.inventoryQuantity,
                options: variant.selectedOptions.map(opt => opt.value)
            })),
            status: product.status
        };
        logger.log('After input, before fetch: $input', input);

        const response = await fetch(`https://${store.storeUrl}/admin/api/2024-01/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': token
            },
            body: JSON.stringify({
                query: SHOPIFY_IMPORT_MUTATION,
                variables: { input }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.statusText}`);
        }

        const result: any = await response.json();

        if (result.data?.productCreate?.userErrors?.length > 0) {
            throw new Error(result.data.productCreate.userErrors[0].message);
        }

        logger.log('Successfully imported to store', {
            storeId: store.id,
            productId: result.data.productCreate.product.id
        });

        return {
            storeId: store.id,
            storeName: store.name,
            success: true,
            productId: result.data.productCreate.product.id
        };

    } catch (error) {
        logger.log('Failed to import to store', {
            storeId: store.id,
            error: (error as Error).message
        });

        return {
            storeId: store.id,
            storeName: store.name,
            success: false,
            error: (error as Error).message
        };
    }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const request = context.request;
    const env = context.env;
    const logger = new Logger();

    try {
        const { shopifyProduct, targetStoreIds } = await request.json() as BatchImportRequest;

        // Parse store configurations and tokens from environment variables
        const stores: ShopifyStoreConfig[] = JSON.parse(env.ADDITIONAL_SHOPIFY_STORES || '[]');
        const tokens: Record<string, string> = JSON.parse(env.ADDITIONAL_SHOPIFY_TOKENS || '{}');

        // Filter selected stores and validate tokens
        const selectedStores = stores.filter(store =>
            targetStoreIds.includes(store.id) && tokens[store.id]
        );

        if (selectedStores.length === 0) {
            throw new Error('No valid stores selected for import');
        }

        logger.log('Starting batch import', {
            productTitle: shopifyProduct.title,
            storeCount: selectedStores.length
        });

        // Import to each store concurrently
        const results = await Promise.all(
            selectedStores.map(store =>
                importToStore(shopifyProduct, store, tokens[store.id], logger)
            )
        );

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        logger.log('Batch import completed', {
            totalStores: results.length,
            successful: successful.length,
            failed: failed.length
        });

        return new Response(JSON.stringify({
            results,
            summary: {
                total: results.length,
                successful: successful.length,
                failed: failed.length
            },
            logs: logger.getLogs()
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        logger.log('Batch import failed', {
            error: (error as Error).message
        });

        return new Response(JSON.stringify({
            error: (error as Error).message,
            logs: logger.getLogs()
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
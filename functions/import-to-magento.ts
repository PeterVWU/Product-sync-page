import { Env, LogEntry, MagentoError, MagentoProduct, ShopifyProduct, ShopifyVariant } from "./backendTypes";

interface ImportRequest {
    shopifyProduct: ShopifyProduct;
    variant: ShopifyVariant;
    attributeMappings: {
        [key: string]: {
            value: string;
            mappedTo: string;
            mappedValue: string;
        };
    };
    configurableSku: string;
    isNewConfigurable: boolean;
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

async function getConfigurableAttributes(
    configurableSku: string,
    env: Env,
    logger: Logger
): Promise<Array<{ attribute_id: string; code: string }>> {
    const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);

    logger.log('Getting configurable attributes', { configurableSku });

    const response = await fetch(
        `${baseUrl}/rest/V1/configurable-products/${encodeURIComponent(configurableSku)}/options/all`,
        {
            headers: {
                Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
            }
        }
    );

    if (!response.ok) {
        const error: any = await response.json();
        throw new Error(`Failed to get configurable attributes: ${error.message}`);
    }

    const attributes: any = await response.json();
    logger.log('Retrieved configurable attributes', { attributes });
    return attributes;
}

async function linkVariantToConfigurable(
    configurableSku: string,
    variantSku: string,
    attributeMappings: ImportRequest['attributeMappings'],
    env: Env,
    logger: Logger
): Promise<void> {
    const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);

    logger.log('Linking variant to configurable product', {
        configurableSku,
        variantSku,
        attributeMappings
    });

    try {
        // Add the variant to the configurable product
        const response = await fetch(
            `${baseUrl}/rest/V1/configurable-products/${encodeURIComponent(configurableSku)}/child`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                },
                body: JSON.stringify({
                    childSku: variantSku
                }),
            }
        );

        if (!response.ok) {
            const error: any = await response.json();
            throw new Error(`Failed to link variant: ${error.message}`);
        }

        logger.log('Successfully linked variant', {
            configurableSku,
            variantSku
        });
    } catch (error) {
        logger.log('Error linking variant', {
            error: (error as Error).message,
            configurableSku,
            variantSku
        });
        throw error;
    }
}



async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
    // Convert ArrayBuffer to base64 using btoa and Uint8Array
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
}

function getMimeType(url: string): string | null {
    // Only allow specific image formats that Magento supports
    const supportedExtensions: { [key: string]: string } = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif'
    };

    const extension = url.split('?').shift().split('.').pop()?.toLowerCase() || '';
    return supportedExtensions[extension] || null;
}

async function fetchImageAsBase64(imageUrl: string, logger: Logger): Promise<{ base64Data: string; mimeType: string } | null> {
    try {
        const mimeType = getMimeType(imageUrl);
        if (!mimeType) {
            logger.log('Unsupported image type', { url: imageUrl });
            return null;
        }

        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        // Verify content type from response
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
            logger.log('Invalid content type', { url: imageUrl, contentType });
            return null;
        }

        logger.log('Fetching image', {
            url: imageUrl,
            mimeType,
            contentType
        });

        const arrayBuffer = await response.arrayBuffer();
        const base64Data = await arrayBufferToBase64(arrayBuffer);

        logger.log('Image processed', {
            url: imageUrl,
            size: arrayBuffer.byteLength,
            mimeType,
            base64Preview: base64Data.substring(0, 50) + '...'
        });

        return { base64Data, mimeType };
    } catch (error) {
        logger.log('Image fetch failed', {
            error: (error as Error).message,
            url: imageUrl
        });
        return null;
    }
}


function normalizeUrl(url: string): string {
    url = url.replace(/\/+$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url;
}

async function checkMagentoProduct(sku: string, env: Env, logger: Logger): Promise<boolean> {
    try {
        const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);
        const encodedSku = encodeURIComponent(sku);
        logger.log('Checking Magento product', { sku, url: `${baseUrl}/rest/V1/products/${encodedSku}` });

        const startTime = Date.now();
        const response = await fetch(
            `${baseUrl}/rest/V1/products/${encodedSku}`,
            {
                headers: {
                    Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                },
            }
        );

        logger.log('Magento product check complete', {
            sku,
            exists: response.ok,
            duration: `${Date.now() - startTime}ms`
        });

        return response.ok;
    } catch (error) {
        logger.log('Magento product check error', { sku, error: (error as Error).message });
        return false;
    }
}


function validateSku(sku: string | undefined): string {
    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
        throw new Error('Invalid SKU: SKU cannot be empty');
    }
    return sku.trim();
}


async function transformToMagentoProduct(
    shopifyProduct: ShopifyProduct,
    variant: ShopifyVariant,
    attributeMappings: ImportRequest['attributeMappings'],
    logger: Logger
): Promise<MagentoProduct> {
    // Validate SKU first
    const validatedSku = validateSku(variant.sku);
    logger.log('Validating SKU', {
        originalSku: variant.sku,
        validatedSku,
        variantTitle: variant.title
    });

    const customAttributes: Array<{ attribute_code: string; value: string }> = [];

    // Add mapped attributes with their mapped values
    Object.entries(attributeMappings).forEach(([_, mapping]) => {
        if (mapping.mappedTo && mapping.mappedValue) {
            customAttributes.push({
                attribute_code: mapping.mappedTo,
                value: mapping.mappedValue
            });
        }
    });
    if (typeof variant.inventoryCost === 'number' && variant.inventoryCost > 0) {
        customAttributes.push({
            attribute_code: 'cost',
            value: variant.inventoryCost.toString()
        });
    }

    // Process variant image
    let mediaGalleryEntries: any[] = [];

    // Use variant's specific image if available, otherwise use first product image
    const imageToUse = variant.image || (shopifyProduct.images[0] || null);

    if (imageToUse) {
        try {
            const imageUrl = imageToUse.url.split('?')[0]
            const imageResult = await fetchImageAsBase64(imageUrl, logger);
            if (imageResult) {
                const { base64Data, mimeType } = imageResult;
                const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
                const timestamp = Date.now();
                const filename = `${validatedSku}-${timestamp}.${extension}`;

                mediaGalleryEntries.push({
                    media_type: 'image',
                    label: imageToUse.altText || `${variant.title || shopifyProduct.title}`,
                    position: 1,
                    disabled: false,
                    types: ['image', 'small_image', 'thumbnail'],
                    content: {
                        base64_encoded_data: base64Data,
                        type: mimeType,
                        name: filename
                    },
                    file: filename
                });

                logger.log('Processed variant image', {
                    sku: validatedSku,
                    filename,
                    mimeType,
                    hasBase64Data: !!base64Data,
                    base64Preview: base64Data.substring(0, 30) + '...'
                });
            }
        } catch (error) {
            logger.log('Error processing variant image', {
                sku: validatedSku,
                variant: variant.title,
                error: (error as Error).message,
                imageUrl: imageToUse.url
            });
        }
    } else {
        logger.log('No image available for variant', {
            sku: validatedSku,
            variant: variant.title
        });
    }

    // Add URL key to custom attributes if not present
    if (!customAttributes.some(attr => attr.attribute_code === 'url_key')) {
        const urlKey = `${shopifyProduct.handle}-${validatedSku}`.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        customAttributes.push({
            attribute_code: 'url_key',
            value: urlKey
        });
    }

    const product: MagentoProduct = {
        sku: variant.sku,
        name: shopifyProduct.variants.length > 1
            ? `${shopifyProduct.title} - ${variant.title}`
            : shopifyProduct.title,
        price: parseFloat(variant.price) || 0,
        type_id: 'simple',
        attribute_set_id: 4,
        weight: 1.0,
        status: 1, // Always enabled for variants
        visibility: 1,
        custom_attributes: customAttributes,
        media_gallery_entries: mediaGalleryEntries,
        extension_attributes: {
            stock_item: {
                manage_stock: true,
                is_in_stock: variant.inventoryQuantity > 0,
                qty: variant.inventoryQuantity
            }
        }
    };

    logger.log('Transformed product', {
        sku: product.sku,
        name: product.name,
        hasImage: mediaGalleryEntries.length > 0,
        attributeCount: customAttributes.length
    });

    return product;
}
async function createMagentoProduct(product: MagentoProduct, env: Env, logger: Logger): Promise<void> {
    const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);
    logger.log('Creating Magento product', {
        sku: product.sku,
        attributes: product.custom_attributes
    });

    const startTime = Date.now();
    const response = await fetch(
        `${baseUrl}/rest/V1/products`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({ product }),
        }
    );

    if (!response.ok) {
        const error = await response.json() as MagentoError;
        logger.log('Magento product creation failed', {
            sku: product.sku,
            error: error.message,
            duration: `${Date.now() - startTime}ms`
        });
        throw new Error(`Failed to create Magento product: ${error.message}`);
    }

    logger.log('Magento product created', {
        sku: product.sku,
        duration: `${Date.now() - startTime}ms`
    });
}

async function updateMagentoProduct(product: MagentoProduct, env: Env, logger: Logger): Promise<void> {
    const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);
    const encodedSku = encodeURIComponent(product.sku);
    logger.log('Updating Magento product', {
        sku: product.sku,
        attributes: product.custom_attributes
    });

    const startTime = Date.now();
    const response = await fetch(
        `${baseUrl}/rest/V1/products/${encodedSku}`,
        {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({ product }),
        }
    );

    if (!response.ok) {
        const error = await response.json() as MagentoError;
        logger.log('Magento product update failed', {
            sku: product.sku,
            error: error.message,
            duration: `${Date.now() - startTime}ms`
        });
        throw new Error(`Failed to update Magento product: ${error.message}`);
    }

    logger.log('Magento product updated', {
        sku: product.sku,
        duration: `${Date.now() - startTime}ms`
    });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const request = context.request;
    const env = context.env;
    const logger = new Logger();
    logger.log('Worker started', { method: request.method });

    try {

        const importRequest = await request.json() as ImportRequest;
        const { shopifyProduct, variant, attributeMappings, configurableSku } = importRequest;

        logger.log('Processing import request', {
            productId: shopifyProduct.id,
            title: shopifyProduct.title,
            sku: variant.sku,
            mappings: attributeMappings
        });

        const magentoProduct = await transformToMagentoProduct(shopifyProduct, variant, attributeMappings, logger);

        // Set specific attributes for variants
        magentoProduct.visibility = 1; // Not visible individually
        magentoProduct.type_id = 'simple';

        // Check if variant exists
        const variantExists = await checkMagentoProduct(variant.sku, env, logger);
        try {
            if (variantExists) {
                await updateMagentoProduct(magentoProduct, env, logger);
                logger.log('Product updated successfully', {
                    sku: magentoProduct.sku,
                    hasImage: magentoProduct.media_gallery_entries?.length > 0
                });
            } else {
                await createMagentoProduct(magentoProduct, env, logger);
                logger.log('Product created successfully', {
                    sku: magentoProduct.sku,
                    hasImage: magentoProduct.media_gallery_entries?.length > 0
                });
            }

            // After successful creation/update, link the variant to the configurable product
            if (configurableSku) {
                await linkVariantToConfigurable(
                    configurableSku,
                    variant.sku,
                    attributeMappings,
                    env,
                    logger
                );
            }

            return new Response(JSON.stringify({
                success: true,
                message: variantExists ? 'Product updated successfully' : 'Product created successfully',
                sku: magentoProduct.sku,
                logs: logger.getLogs()
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (err) {
            const error = err as Error;
            logger.log('Import failed', { error: error.message });

            return new Response(JSON.stringify({
                error: error.message,
                logs: logger.getLogs()
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    } catch (err) {
        const error = err as Error;
        logger.log('Invalid request', { error: error.message });

        return new Response(JSON.stringify({
            error: 'Invalid request format',
            details: error.message,
            logs: logger.getLogs()
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};

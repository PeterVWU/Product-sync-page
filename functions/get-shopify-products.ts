import { Env, LogEntry, ShopifyGraphQLResponse, ShopifyProduct } from "./backendTypes";

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

const SHOPIFY_PRODUCT_QUERY = `
  query GetProduct($query: String!) {
    products(first: 1, query: $query) {
      edges {
        node {
          id
          title
          descriptionHtml
          vendor
          productType
          tags
          status
          handle
          images(first: 10) {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                sku
                price
                title
                inventoryItem {
                    unitCost {
                        amount
                    }
                }
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
                image {
                  id
                  url
                  altText
                }
                updatedAt
              }
            }
          }
        }
      }
    }
  }
`;


function normalizeUrl(url: string): string {
  url = url.replace(/\/+$/, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

function formatCost(cost: string): number {
  if (cost === undefined) return 0;
  return Number(cost);
}

async function searchShopifyProduct(searchTerm: string, env: Env, logger: Logger): Promise<ShopifyProduct | null> {
  const baseUrl = normalizeUrl(env.SHOPIFY_STORE_URL);
  logger.log('Searching Shopify product', { searchTerm });

  const startTime = Date.now();
  const response = await fetch(
    `${baseUrl}/admin/api/2024-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: SHOPIFY_PRODUCT_QUERY,
        variables: {
          query: searchTerm
        }
      }),
    }
  );

  if (!response.ok) {
    const error = `Shopify API error: ${response.status} ${response.statusText}`;
    logger.log('Shopify API Error', { error, status: response.status });
    throw new Error(error);
  }

  const data = await response.json() as ShopifyGraphQLResponse;
  const duration = Date.now() - startTime;

  logger.log('Shopify product search completed', {
    found: data.data.products.edges.length > 0,
    duration: `${duration}ms`
  });

  if (data.data.products.edges.length === 0) {
    return null;
  }

  const product = data.data.products.edges[0].node;
  return {
    id: product.id,
    title: product.title,
    description: product.descriptionHtml,
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags,
    status: product.status,
    handle: product.handle,
    images: product.images.edges.map(img => ({
      id: img.node.id,
      url: img.node.url,
      altText: img.node.altText
    })),
    variants: product.variants.edges.map((variantEdge) => ({
      id: variantEdge.node.id,
      sku: variantEdge.node.sku,
      price: variantEdge.node.price,
      title: variantEdge.node.title,
      selectedOptions: variantEdge.node.selectedOptions,
      updatedAt: variantEdge.node.updatedAt,
      inventoryCost: formatCost(variantEdge.node.inventoryItem?.unitCost?.amount),
      inventoryQuantity: variantEdge.node.inventoryQuantity,
      image: variantEdge.node.image ? {
        id: variantEdge.node.image.id,
        url: variantEdge.node.image.url,
        altText: variantEdge.node.image.altText
      } : null
    })),
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const logger = new Logger();
  logger.log('Worker started', { method: context.request.method });

  try {
    if (!env.SHOPIFY_STORE_URL || !env.SHOPIFY_ACCESS_TOKEN) {
      logger.log('Missing environment variables');
      return new Response(JSON.stringify({
        error: 'Missing required environment variables. Please check SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN are set.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { searchParams } = new URL(context.request.url);
    const searchTerm = searchParams.get('search');

    if (!searchTerm) {
      return new Response(JSON.stringify({
        error: 'Search term is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const product = await searchShopifyProduct(searchTerm, env, logger);

    return new Response(JSON.stringify({
      product,
      logs: logger.getLogs()
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const error = err as Error;
    logger.log('Failed to search product', { error: error.message });

    return new Response(JSON.stringify({
      error: error.message,
      details: 'If this is a URL error, please check that your SHOPIFY_STORE_URL is correctly formatted',
      logs: logger.getLogs()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
